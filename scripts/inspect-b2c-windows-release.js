// Read-only release evidence. No DB, DPAPI, queue, service or task mutation.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const https = require('node:https');
const crypto = require('node:crypto');
const { operatorJson } = require('../src/config/operator-json');
const TARGET = 'ccc646a649ed2bd6a9e138f27a43efe96a536edd';
const BASELINE = '090aa82643a46856d8963909b3ecbb2d8c9d95bf';
const BACKEND = ['src/operations/b2c-readiness.js', 'src/operations/policy.js', 'src/operations/read.js'];
const PREPARATION = new Set(['scripts/inspect-b2c-windows-release.js', 'scripts/inspect-b2c-windows-release.ps1', 'tests/b2c-windows-preparation.test.js', 'docs/b2c-windows-release.md']);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const normalized = bytes => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
function read(file) {
  const absolute = path.resolve(file), stat = fs.lstatSync(absolute), real = fs.realpathSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 32 * 1024 * 1024 ||
      (process.platform === 'win32' ? real.toLowerCase() !== absolute.toLowerCase() : real !== absolute)) throw Error('UNSAFE_INSPECTION_FILE');
  return fs.readFileSync(absolute);
}
const git = (root, args) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
async function probe(runtimeRoot, env, activeDist) {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw Error('TLS_BYPASS_REJECTED');
  const trust = require('./runtime-tls-trust').runtimeTrust(runtimeRoot, env);
  const port = Number(env.LOCAL_HTTPS_PORT || 8443);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('RUNTIME_HTTPS_PORT_REJECTED');
  const get = resource => new Promise((resolve, reject) => {
    const req = https.get({ hostname: '127.0.0.1', port, path: resource, servername: 'localhost', ca: trust.ca, rejectUnauthorized: true,
      headers: { Host: `localhost:${port}`, 'Cache-Control': 'no-cache' } }, res => {
      const peer = res.socket.getPeerCertificate();
      if (!peer.raw || hash(peer.raw) !== hash(trust.leaf.raw)) { res.resume(); reject(Error('LIVE_TLS_CERTIFICATE_PIN_MISMATCH')); return; }
      if (res.statusCode !== 200) { res.resume(); reject(Error('FRONTEND_HTTP_' + res.statusCode)); return; }
      const chunks = []; let size = 0;
      res.on('data', bytes => { size += bytes.length; if (size > 32 * 1024 * 1024) req.destroy(Error('FRONTEND_RESPONSE_TOO_LARGE')); else chunks.push(bytes); });
      res.on('end', () => resolve(Buffer.concat(chunks))); res.on('error', reject); res.on('aborted', () => reject(Error('FRONTEND_RESPONSE_ABORTED')));
    });
    req.setTimeout(10000, () => req.destroy(Error('FRONTEND_HEALTH_TIMEOUT'))); req.on('error', reject);
  });
  const index = read(path.join(activeDist, 'index.html')), served = await get('/login');
  if (hash(index) !== hash(served)) throw Error('SERVED_FRONTEND_DIFFERS_FROM_ACTIVE_DIST');
  const refs = [...index.toString('utf8').matchAll(/(?:src|href)="(\/assets\/[A-Za-z0-9_.-]+\.(?:js|css))"/g)].map(match => match[1]);
  if (!refs.length) throw Error('INDEX_STATIC_REFERENCES_REQUIRED');
  for (const ref of new Set(refs)) if (hash(read(path.join(activeDist, ref.slice(1)))) !== hash(await get(ref))) throw Error('SERVED_ASSET_HASH_MISMATCH');
  const leafPath = path.resolve(runtimeRoot, env.LOCAL_TLS_CERT || '.local/tls/localhost.crt');
  return { status: 'BASELINE_FRONTEND_PASS', healthUrl: `https://localhost:${port}/login`, tlsVerified: true, certificatePinned: true,
    trustFile: trust.mode === 'PINNED_SELF_SIGNED_RUNTIME_CERT' ? leafPath : env.LOCAL_TLS_CA ? path.resolve(runtimeRoot, env.LOCAL_TLS_CA) : path.join(path.dirname(leafPath), 'ca.crt'),
    indexSha256: hash(index), checkedEntryAssets: new Set(refs).size };
}
async function inspect(input, { gitCommand = git, probeFrontend = probe } = {}) {
  if (!input || Object.keys(input).some(key => !['candidateRoot', 'runtimeRoot', 'courierConfig', 'configSha256', 'ownerSid', 'webProcessVerified'].includes(key))) throw Error('INSPECTION_INPUT_REJECTED');
  const { candidateRoot, runtimeRoot, courierConfig, configSha256, ownerSid, webProcessVerified } = input;
  if (![candidateRoot, runtimeRoot, courierConfig].every(value => typeof value === 'string' && path.isAbsolute(value)) || !/^[a-f0-9]{64}$/.test(configSha256 || '') || !/^S-1-[0-9-]+$/.test(ownerSid || '') || webProcessVerified !== true) throw Error('INSPECTION_INPUT_REJECTED');
  if (gitCommand(candidateRoot, ['status', '--porcelain', '--untracked-files=normal']).trim()) throw Error('CANDIDATE_WORKTREE_NOT_CLEAN');
  gitCommand(candidateRoot, ['merge-base', '--is-ancestor', TARGET, 'HEAD']);
  const changes = gitCommand(candidateRoot, ['diff', '--name-only', TARGET, 'HEAD']).trim().split(/\r?\n/).filter(Boolean);
  if (changes.some(file => !PREPARATION.has(file))) throw Error('APPLICATION_DIFFERS_FROM_APPROVED_CANDIDATE');
  const checkoutCommit = gitCommand(candidateRoot, ['rev-parse', 'HEAD']).trim();
  const envBytes = read(path.join(runtimeRoot, 'service/environment.json')), env = operatorJson(envBytes);
  if (env.HDWORK2_PUBLIC_ORIGIN !== 'https://hdwork2.yoloo.space' || env.HDWORK2_SHARED_GROUPS_ENABLED !== 'true') throw Error('EXPECTED_SHARED_GROUPS_RUNTIME_REQUIRED');
  const cfgBytes = read(courierConfig);
  if (hash(cfgBytes) !== configSha256) throw Error('COURIER_CONFIG_HASH_MISMATCH');
  const cfg = operatorJson(cfgBytes);
  if (cfg.version !== 1 || cfg.kind !== 'HDWORK2_COURIER_AUTOSTART' || cfg.ownerSid !== ownerSid || !cfg.sourceHashes || typeof cfg.sourceHashes !== 'object' || Array.isArray(cfg.sourceHashes) || typeof cfg.snapshot !== 'string' || !path.isAbsolute(cfg.snapshot)) throw Error('COURIER_CONFIG_REJECTED');
  const rows = BACKEND.map(file => {
    const target = normalized(Buffer.from(gitCommand(candidateRoot, ['show', `${TARGET}:${file}`])));
    const baseline = normalized(Buffer.from(gitCommand(candidateRoot, ['show', `${BASELINE}:${file}`])));
    if (hash(normalized(read(path.join(candidateRoot, file)))) !== hash(target)) throw Error('CANDIDATE_SOURCE_DRIFT');
    const current = read(path.join(runtimeRoot, file)), digest = hash(normalized(current));
    const pinned = Object.hasOwn(cfg.sourceHashes, file);
    const pinnedBytes = pinned ? read(path.join(cfg.snapshot, file)) : null;
    return { file, candidateSha256: hash(target), runtimeSha256: digest,
      runtimeState: digest === hash(target) ? 'TARGET_MATCH' : digest === hash(baseline) ? 'BASELINE_MATCH' : 'UNKNOWN_DRIFT',
      pinnedByCourier: pinned, courierPinMatchesFile: pinned ? hash(pinnedBytes) === cfg.sourceHashes[file] : null };
  });
  const activeDist = require('../src/config/web-build').webBuild(runtimeRoot, env);
  const frontend = await probeFrontend(runtimeRoot, env, activeDist);
  const blockers = rows.filter(row => row.runtimeState === 'UNKNOWN_DRIFT').map(row => 'RUNTIME_SOURCE_DRIFT:' + row.file);
  for (const row of rows) if (row.courierPinMatchesFile === false) blockers.push('COURIER_SOURCE_PIN_DRIFT:' + row.file);
  const sameSnapshot = path.resolve(cfg.snapshot).toLowerCase() === path.resolve(runtimeRoot).toLowerCase();
  const pinnedChanges = rows.filter(row => row.pinnedByCourier && row.runtimeState !== 'TARGET_MATCH').map(row => row.file);
  if (sameSnapshot && pinnedChanges.length) blockers.push('IN_PLACE_WEB_UPDATE_WOULD_BREAK_COURIER_PINS');
  return { status: 'B2C_WINDOWS_READ_ONLY_INSPECTION', applicationCommit: TARGET, checkoutCommit, runtimeRoot, activeDist,
    courierSnapshot: cfg.snapshot, sameWebAndCourierSnapshot: sameSnapshot, courierConfigSha256: configSha256,
    changedBackendFiles: rows, pinnedChangedFiles: pinnedChanges, frontend, blockers,
    nextStep: blockers.length ? 'REVIEW_BLOCKERS_AND_PREPARE_COMPATIBLE_ISOLATED_WEB_RELEASE' : 'PREPARE_BACKUP_AND_COORDINATED_WEB_FRONTEND_RELEASE',
    deploymentReady: false, runtimeChanged: false, credentialsAccessed: false, databaseAccessed: false, telegramAccessed: false };
}
async function main() {
  if (process.argv.length !== 2) throw Error('STDIN_METADATA_ONLY');
  let data = ''; for await (const chunk of process.stdin) { data += chunk; if (data.length > 32768) throw Error('INSPECTION_INPUT_TOO_LARGE'); }
  console.log(JSON.stringify(await inspect(JSON.parse(data)), null, 2));
}
if (require.main === module) main().catch(error => { console.error(JSON.stringify({ status: 'B2C_INSPECTION_FAILED', code: /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : error.code === 'ENOENT' ? 'INSPECTION_FILE_MISSING' : 'INSPECTION_FAILED_REVIEW_LOCAL_INPUTS', runtimeChanged: false })); process.exitCode = 1; });
module.exports = { TARGET, BACKEND, inspect, probe };

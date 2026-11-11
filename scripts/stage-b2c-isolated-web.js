// Stage only: no process/service control, DB, DPAPI decryption or Telegram calls.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { operatorJson } = require('../src/config/operator-json');
const frontend = require('./frontend-only-release');
const { TARGET, BACKEND, inspect } = require('./inspect-b2c-windows-release');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const normalized = bytes => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const equal = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
function regular(file) {
  const absolute = path.resolve(file), stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || !equal(fs.realpathSync(absolute), absolute)) throw Error('STAGE_LINK_OR_FILE_REJECTED');
  return absolute;
}
function directory(folder) { const absolute = path.resolve(folder); if (!fs.lstatSync(absolute).isDirectory() || !equal(fs.realpathSync(absolute), absolute)) throw Error('STAGE_DIRECTORY_REJECTED'); return absolute; }
function separate(a, b) { const rel = path.relative(a, b), reverse = path.relative(b, a); if (!rel || (!rel.startsWith('..' + path.sep) && !path.isAbsolute(rel)) || (!reverse.startsWith('..' + path.sep) && !path.isAbsolute(reverse))) throw Error('OVERLAPPING_STAGE_PATHS'); }
// Create new files under the private target ACL; do not copy source DACLs/ADS.
function copyFile(from, to) { regular(from); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, fs.readFileSync(from), { flag: 'wx' }); if (hash(fs.readFileSync(from)) !== hash(fs.readFileSync(to))) throw Error('STAGE_COPY_HASH_MISMATCH'); }
function tree(from, to) {
  directory(from); fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    // Runtime Node never invokes npm command shims; do not follow .bin links.
    if (entry.name === '.bin' || entry.name === '__pycache__') continue;
    const source = path.join(from, entry.name), target = path.join(to, entry.name);
    if (entry.isSymbolicLink()) throw Error('STAGE_LINK_REJECTED');
    if (entry.isDirectory()) tree(source, target); else if (entry.isFile()) copyFile(source, target); else throw Error('STAGE_SPECIAL_FILE_REJECTED');
  }
}
function inventory(root, prefix = '', result = {}) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name), name = prefix + entry.name;
    if (entry.isSymbolicLink()) throw Error('STAGE_LINK_REJECTED');
    if (entry.isDirectory()) inventory(file, name + '/', result); else { regular(file); result[name] = hash(fs.readFileSync(file)); }
  }
  return result;
}
function tlsFiles(runtime, env) {
  const result = new Set(['.local/tls/ca.crt', '.local/tls/localhost.crt', '.local/tls/localhost.key']);
  for (const value of [env.LOCAL_TLS_CERT, env.LOCAL_TLS_KEY, env.LOCAL_TLS_CA].filter(Boolean)) {
    if (typeof value !== 'string') throw Error('TLS_PATH_REJECTED');
    if (path.isAbsolute(value)) { regular(value); continue; } // Preserve existing absolute reference; never rewrite environment.
    const resolved = path.resolve(runtime, value), relative = path.relative(runtime, resolved).split(path.sep).join('/');
    if (!/^\.local\/tls\/[A-Za-z0-9_.-]+\.(?:crt|pem|key)$/.test(relative) || /(^|\/)ca\.key$/i.test(relative)) throw Error('TLS_RELATIVE_PATH_REQUIRES_REVIEW');
    result.add(relative);
  }
  return [...result];
}
async function stage(input, { inspectRuntime = inspect, gitBlob = (root, file) => require('node:child_process').execFileSync('git', ['show', `${TARGET}:${file}`], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }) } = {}) {
  const allowed = ['candidateRoot', 'runtimeRoot', 'courierConfig', 'configSha256', 'ownerSid', 'webProcessVerified', 'stageRoot', 'manifestSha256', 'baselineIndexSha256', 'webTaskXml'];
  if (!input || typeof input.webTaskXml !== 'string' || input.webTaskXml.length > 131072 || !/<Task\b/.test(input.webTaskXml) || Object.keys(input).some(key => !allowed.includes(key)) || !/^[a-f0-9]{64}$/.test(input.manifestSha256 || '') || !/^[a-f0-9]{64}$/.test(input.baselineIndexSha256 || '')) throw Error('STAGE_INPUT_REJECTED');
  const candidate = directory(input.candidateRoot), runtime = directory(input.runtimeRoot), target = directory(input.stageRoot);
  separate(candidate, runtime); separate(target, runtime); separate(target, candidate);
  // The Windows wrapper creates only a private, empty service/state directory.
  directory(path.join(target, 'service')); directory(path.join(target, 'service/state'));
  const existing = fs.readdirSync(target);
  if (existing.some(name => name !== 'service') || fs.readdirSync(path.join(target, 'service')).some(name => name !== 'state') || fs.readdirSync(path.join(target, 'service/state')).length) throw Error('EMPTY_PRIVATE_STAGE_REQUIRED');
  const metadata = Object.fromEntries(['candidateRoot', 'runtimeRoot', 'courierConfig', 'configSha256', 'ownerSid', 'webProcessVerified'].map(key => [key, input[key]]));
  const evidence = await inspectRuntime(metadata);
  if (evidence.runtimeRoot !== runtime || evidence.frontend.status !== 'BASELINE_FRONTEND_PASS' || evidence.frontend.indexSha256 !== input.baselineIndexSha256 || evidence.blockers.some(code => code !== 'IN_PLACE_WEB_UPDATE_WOULD_BREAK_COURIER_PINS')) throw Error('RUNTIME_BASELINE_REQUIRES_REVIEW');
  const build = await frontend.verified(path.join(candidate, 'frontend/dist'), input.manifestSha256);
  if (build.manifest.apiOrigin !== 'https://hdwork2.yoloo.space' || ['authCookie', 'operations', 'liveChat'].some(key => build.manifest.flags?.[key] !== true)) throw Error('EXPECTED_B2C_FRONTEND_REQUIRED');
  const envFile = regular(path.join(runtime, 'service/environment.json')), envBytes = fs.readFileSync(envFile), env = operatorJson(envBytes);
  if (require('../src/config/persistent-auth').validatePersistentAuth(env) !== true || env.HDWORK2_SERVICE_AUTH_POLICY !== 'operational-write') throw Error('EXISTING_OPERATIONAL_PROFILE_REQUIRED');
  if (env.HDWORK2_TESTING_SOLVER_ENABLED !== 'false' || env.HDWORK2_SHARED_GROUPS_ENABLED !== 'true' || env.LOCAL_WEB_DIST !== undefined) throw Error('ISOLATED_WEB_ENVIRONMENT_REQUIRES_REVIEW');
  const cfgBytes = fs.readFileSync(regular(input.courierConfig)), cfg = operatorJson(cfgBytes);
  if (hash(cfgBytes) !== input.configSha256) throw Error('COURIER_CONFIG_CHANGED');
  if (equal(directory(cfg.snapshot), runtime) && cfg.environmentSha256 !== hash(envBytes)) throw Error('COURIER_ENVIRONMENT_PIN_CHANGED');
  const bundleFile = regular(path.join(runtime, 'service/secrets.dpapi')), bundleHash = hash(fs.readFileSync(bundleFile));
  if (equal(directory(cfg.snapshot), runtime) && cfg.encryptedBundleSha256 !== bundleHash) throw Error('ENCRYPTED_BUNDLE_PIN_CHANGED');
  const activeDist = directory(evidence.activeDist), baseline = await frontend.inventory(activeDist);
  if (baseline['index.html'] !== input.baselineIndexSha256) throw Error('ACTIVE_FRONTEND_CHANGED');
  const release = path.join(target, '.b2c-release'); fs.mkdirSync(release);
  const baselineSources = Object.fromEntries(BACKEND.map(file => [file, hash(fs.readFileSync(regular(path.join(runtime, file))))]));
  const save = value => fs.writeFileSync(path.join(release, 'plan.json'), JSON.stringify(value, null, 2) + '\n');
  const taskBytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(input.webTaskXml, 'utf16le')]);
  fs.writeFileSync(path.join(release, 'previous-web-task.xml'), taskBytes, { flag: 'wx' });
  const plan = { previousWebTaskSha256: hash(taskBytes), version: 1, kind: 'HDWORK2_ISOLATED_B2C_WEB', state: 'STAGING', applicationCommit: TARGET, previousRuntime: runtime, stagedRuntime: target,
    manifestSha256: input.manifestSha256, baselineIndexSha256: input.baselineIndexSha256, baselineSources, courierConfig: input.courierConfig, courierConfigSha256: input.configSha256,
    environmentSha256: hash(envBytes), encryptedBundleSha256: bundleHash, baselineFrontend: baseline, servicesChanged: false, activated: false };
  save(plan);
  try {
    for (const entry of fs.readdirSync(runtime, { withFileTypes: true })) if (entry.isFile() && (/^[A-Za-z0-9_.-]+\.(?:js|cjs)$/.test(entry.name) || ['package.json', 'package-lock.json'].includes(entry.name))) copyFile(path.join(runtime, entry.name), path.join(target, entry.name));
    for (const folder of ['src', 'scripts', 'contracts', 'node_modules']) tree(path.join(runtime, folder), path.join(target, folder));
    if (fs.existsSync(path.join(runtime, 'database'))) tree(path.join(runtime, 'database'), path.join(target, 'database'));
    // Copy existing ciphertext verbatim. Never decrypt, rotate or rewrite it.
    copyFile(envFile, path.join(target, 'service/environment.json'));
    copyFile(bundleFile, path.join(target, 'service/secrets.dpapi'));
    for (const file of tlsFiles(runtime, env)) copyFile(path.join(runtime, file), path.join(target, file));
    const copiedBaseline = inventory(target);
    for (const file of Object.keys(copiedBaseline)) if (file.startsWith('.b2c-release/')) delete copiedBaseline[file];
    for (const file of BACKEND) {
      const bytes = gitBlob(candidate, file), working = fs.readFileSync(regular(path.join(candidate, file)));
      if (hash(normalized(bytes)) !== hash(normalized(working))) throw Error('CANDIDATE_SOURCE_CHANGED');
      fs.writeFileSync(path.join(target, file), bytes); // New private snapshot only; original runtime stays untouched.
    }
    const dist = path.join(target, 'frontend/dist'); fs.mkdirSync(dist, { recursive: true });
    for (const file of Object.keys(baseline)) copyFile(path.join(activeDist, file), path.join(dist, file));
    for (const [file, expected] of Object.entries(build.files)) {
      if (file === 'index.html') continue;
      const dest = path.join(dist, file);
      if (fs.existsSync(dest)) {
        if (hash(fs.readFileSync(regular(dest))) === expected) continue;
        if (file.startsWith('assets/')) throw Error('IMMUTABLE_ASSET_COLLISION');
        fs.writeFileSync(dest, fs.readFileSync(path.join(build.source, file)));
      } else copyFile(path.join(build.source, file), dest);
    }
    fs.writeFileSync(path.join(dist, 'index.html'), fs.readFileSync(path.join(build.source, 'index.html')));
    copyFile(path.join(build.source, 'release-manifest.json'), path.join(release, 'candidate-manifest.json'));
    const stagedFrontend = await frontend.inventory(dist);
    for (const [file, expected] of Object.entries(build.files)) if (stagedFrontend[file] !== expected) throw Error('STAGED_FRONTEND_HASH_MISMATCH');
    for (const [file, expected] of Object.entries(baseline)) if (file.startsWith('assets/') && stagedFrontend[file] !== expected) throw Error('OLD_ASSET_NOT_PRESERVED');
    const files = inventory(target); for (const file of Object.keys(files)) if (file.startsWith('.b2c-release/')) delete files[file];
    // Recheck the live sources/config/index after the copy. Do not accept drift.
    for (const [file, expected] of Object.entries(copiedBaseline)) if (hash(fs.readFileSync(regular(path.join(runtime, file)))) !== expected) throw Error('RUNTIME_COPY_SOURCE_CHANGED_DURING_STAGE');
    for (const [file, expected] of Object.entries(baselineSources)) if (hash(fs.readFileSync(regular(path.join(runtime, file)))) !== expected) throw Error('RUNTIME_SOURCE_CHANGED_DURING_STAGE');
    if (hash(fs.readFileSync(regular(input.courierConfig))) !== input.configSha256 || hash(fs.readFileSync(envFile)) !== hash(envBytes) || hash(fs.readFileSync(bundleFile)) !== bundleHash) throw Error('RUNTIME_CONFIGURATION_CHANGED_DURING_STAGE');
    if (JSON.stringify(await frontend.inventory(activeDist)) !== JSON.stringify(baseline)) throw Error('ACTIVE_FRONTEND_CHANGED_DURING_STAGE');
    Object.assign(plan, { state: 'STAGED_NOT_STARTED', stagedFiles: files, stagedFrontend, stagedSources: Object.fromEntries(BACKEND.map(file => [file, files[file]])), rollbackRuntime: runtime }); save(plan);
    return { status: plan.state, applicationCommit: TARGET, stagedRuntime: target, previousRuntime: runtime, manifestSha256: input.manifestSha256,
      planSha256: hash(fs.readFileSync(path.join(release, 'plan.json'))), copiedFiles: Object.keys(files).length, oldAssetsRetained: true, environmentUnchanged: true, encryptedBundleUnchanged: true,
      courierConfigurationUnchanged: true, servicesChanged: false, databaseAccessed: false, telegramAccessed: false, activated: false };
  } catch (error) { plan.state = 'STAGING_FAILED_NOT_ACTIVATED'; save(plan); throw error; }
}
if (require.main === module) (async () => { if (process.argv.length !== 2) throw Error('STAGE_STDIN_ONLY'); let text = ''; for await (const chunk of process.stdin) { text += chunk; if (text.length > 262144) throw Error('STAGE_INPUT_TOO_LARGE'); } console.log(JSON.stringify(await stage(JSON.parse(text)), null, 2)); })().catch(error => { console.error(JSON.stringify({ status: 'B2C_STAGE_FAILED', code: /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : error.code || 'STAGE_FAILED', activated: false })); process.exitCode = 1; });
module.exports = { stage, tlsFiles };

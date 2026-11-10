// One read-only entry point. No service control, DB driver, token or Telegram access.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const {topology} = require('../src/config/production-topology');
const {operatorJson} = require('../src/config/operator-json');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const normalize = bytes => bytes.toString('utf8').replace(/\r\n/g, '\n');
function read(file) {
  const absolute = path.resolve(file);
  const actual = fs.realpathSync(absolute);
  const equal = process.platform === 'win32' ? actual.toLowerCase() === absolute.toLowerCase() : actual === absolute;
  const stat = fs.lstatSync(absolute);
  if (!equal || !stat.isFile() || stat.nlink !== 1 || stat.size > 8 * 1024 * 1024) throw Error('UNSAFE_CONTROL_INPUT');
  return fs.readFileSync(absolute);
}
function git(repo, args) {
  return cp.execFileSync('git', args, {cwd: repo, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']});
}
function catalog(repo, prefix) {
  return git(repo, ['ls-files', '-z', '--', prefix]).split('\0').filter(Boolean).sort().map(file => ({file, sha256: hash(read(path.join(repo, file)))}));
}
function inspect(configFile, mode = 'health') {
  if (!['health', 'plan'].includes(mode)) throw Error('CONTROL_MODE_REJECTED');
  const config = topology(operatorJson(read(configFile)));
  const resolve = value => path.resolve(path.dirname(path.resolve(configFile)), value);
  const repo = resolve(config.repository), snapshot = resolve(config.webSnapshot);
  if (repo === snapshot) throw Error('SEPARATE_RUNTIME_SNAPSHOT_REQUIRED');
  const commit = git(repo, ['rev-parse', 'HEAD']).trim();
  const clean = git(repo, ['status', '--porcelain', '--untracked-files=normal']).trim() === '';
  const routes = require('../src/config/live-chat-production').routing(operatorJson(read(resolve(config.routingReview))));
  if (routes.botIdentities.length !== 1 || routes.botIdentities[0].botId !== config.bot.internalId ||
      routes.botIdentities[0].botUsername !== config.bot.username) throw Error('TOPOLOGY_ROUTING_IDENTITY_MISMATCH');
  const env = operatorJson(read(path.join(snapshot, 'service/environment.json')));
  const files = git(repo, ['ls-files', '-z', '--', 'src', 'contracts', '*.js', 'package.json', 'package-lock.json'])
    .split('\0').filter(file => file && !file.includes('..') && !file.startsWith('tests/') &&
      (/^(src|contracts)\//.test(file) || !file.includes('/') ||
       ['scripts/protected-web-service.js', 'scripts/office-web-service.js'].includes(file))).sort();
  const drift = [];
  const inventory = files.map(file => {
    const digest = hash(normalize(read(path.join(repo, file))));
    try { if (hash(normalize(read(path.join(snapshot, file)))) !== digest) drift.push({file, status: 'DIFFERENT'}); }
    catch (error) { if (error.code === 'ENOENT') drift.push({file, status: 'MISSING'}); else throw error; }
    return {file, sha256: digest};
  });
  const blockers = [];
  if (!clean) blockers.push('REPOSITORY_HAS_UNCOMMITTED_CHANGES');
  if (drift.length) blockers.push('RUNTIME_SOURCE_DRIFT');
  if (env.HDWORK2_PUBLIC_ORIGIN !== config.apiOrigin) blockers.push('RUNTIME_ORIGIN_MISMATCH');
  if (env.HDWORK2_TESTING_SOLVER_ENABLED === 'true') blockers.push('TRIAL_OVERLAY_STILL_ENABLED');
  if (env.HDWORK2_LIVE_CHAT_ENABLED !== 'true') blockers.push('LIVE_CHAT_FLAG_DISABLED');
  const result = {
    status: blockers.length ? 'BLOCKED' : 'LOCAL_CONSISTENCY_PASS', mode, checkedAt: new Date().toISOString(),
    repository: {commit, clean}, source: {sha256: hash(JSON.stringify(inventory)), fileCount: inventory.length, drift},
    migrations: catalog(repo, 'database/manual'),
    grantPolicySha256: hash(read(path.join(repo, 'src/config/operational-grants.js'))),
    blockers,
    health: Object.fromEntries(['frontend', 'api', 'mysql', 'courier', 'lease', 'queue', 'tunnel', 'telegram'].map(key => [key, 'UNKNOWN'])),
    productionIntegrationVerified: false, activationReady: false,
    databaseAccessed: false, telegramAccessed: false, runtimeChanged: false
  };
  if (mode === 'plan') result.release = {
    phases: ['inventory-and-backup', 'review-migration-grant-and-rollback-plan', 'stage-immutable-release', 'approved-activation', 'real-health-and-chat-verification', 'rollback-if-required'],
    botControllers: 1, businessApis: 1, preserveBotNamespace: true,
    requiredEvidence: ['verified bot numeric ID and routing', 'exact grants and schema', 'fixed activation boundary excludes legacy QUEUED/SENDING/DEAD without changing rows',
      'single poller and fenced lease ownership', 'restorable code/config/grant-compatible backup', 'verified frontend build'],
    automaticApplySupported: false
  };
  return result;
}
function main(argv = process.argv.slice(2)) {
  if (argv.length !== 3 || !['health', 'plan'].includes(argv[0]) || argv[1] !== '--config') throw Error('USE_HEALTH_OR_PLAN_WITH_CONFIG');
  const result = inspect(argv[2], argv[0]);
  console.log(JSON.stringify(result, null, 2));
  // Local consistency never returns success as a substitute for real integration health.
  process.exitCode = result.status === 'BLOCKED' ? 1 : 2;
}
if (require.main === module) {
  try { main(); } catch (error) {
    const allowed = ['USE_HEALTH_OR_PLAN_WITH_CONFIG', 'CONTROL_MODE_REJECTED', 'UNSAFE_CONTROL_INPUT',
      'SEPARATE_RUNTIME_SNAPSHOT_REQUIRED', 'PRODUCTION_TOPOLOGY_REJECTED', 'LEGACY_BOT_NAMESPACE_REVIEW_REQUIRED',
      'PRODUCTION_TASK_MUST_NOT_BE_TESTING', 'TOPOLOGY_ROUTING_IDENTITY_MISMATCH',
      'ROUTING_JSON_INVALID_USE_UTF8_OR_UTF16LE_WITH_BOM', 'VERIFIED_PRODUCTION_ROUTING_REQUIRED'];
    const code = allowed.includes(error.message) ? error.message :
      ['EACCES', 'EPERM'].includes(error.code) ? 'CONTROL_INPUT_ACCESS_DENIED' :
      error.code === 'ENOENT' ? 'CONTROL_INPUT_NOT_FOUND' : 'CONTROL_INPUT_OR_INVENTORY_FAILED';
    console.error(JSON.stringify({status: 'BLOCKED', code, runtimeChanged: false}));
    process.exitCode = 1;
  }
}
module.exports = {inspect, main};

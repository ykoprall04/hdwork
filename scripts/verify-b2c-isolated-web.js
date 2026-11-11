// Read-only validation and offline dependency smoke for a prepared web snapshot.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const { operatorJson } = require('../src/config/operator-json');
const { TARGET, probe } = require('./inspect-b2c-windows-release');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function read(file) { const p = path.resolve(file), s = fs.lstatSync(p), real = fs.realpathSync(p); if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1 || (process.platform === 'win32' ? real.toLowerCase() !== p.toLowerCase() : real !== p)) throw Error('UNSAFE_B2C_RELEASE_FILE'); return fs.readFileSync(p); }
function load(root, expected) {
  if (!path.isAbsolute(root) || !/^[a-f0-9]{64}$/.test(expected || '')) throw Error('EXPLICIT_STAGE_AND_PLAN_HASH_REQUIRED');
  const bytes = read(path.join(root, '.b2c-release/plan.json')); if (hash(bytes) !== expected) throw Error('B2C_PLAN_HASH_CHANGED');
  const plan = operatorJson(bytes);
  if (plan.kind !== 'HDWORK2_ISOLATED_B2C_WEB' || plan.version !== 1 || plan.applicationCommit !== TARGET || plan.state !== 'STAGED_NOT_STARTED' || path.resolve(plan.stagedRuntime).toLowerCase() !== path.resolve(root).toLowerCase() || !path.isAbsolute(plan.previousRuntime) || !plan.stagedFiles) throw Error('B2C_RELEASE_PLAN_REJECTED');
  return plan;
}
function inventory(root, prefix = '', result = {}) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const name = prefix + entry.name, file = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw Error('B2C_RELEASE_LINK_REJECTED');
    if (name === '.b2c-release' || name === 'service/state') continue;
    if (entry.isDirectory()) inventory(file, name + '/', result); else result[name] = hash(read(file));
  }
  return result;
}
function sameFiles(actual, expected) { const keys = Object.keys(actual).sort(), other = Object.keys(expected).sort(); return JSON.stringify(keys) === JSON.stringify(other) && keys.every(key => actual[key] === expected[key]); }
function smoke(root, nodeExecutable) {
  const code = `const r=require('node:module').createRequire(require('node:path').join(process.argv[1],'package.json'));r('bcrypt');r('mysql2/promise');const p=r('./src/operations/policy');r('./src/operations/read');const o={command:'order',status:'IN_PROGRESS',owner_user_id:7},u={id:7,name:'Offline smoke',role:'HD',is_active:1,modules:['TIAL']};let rejected=false;try{p.transition(o,u,{action:'DONE'})}catch(e){rejected=e.statusCode===400}if(!rejected)throw Error('CONFIRMATION_POLICY_MISSING');const e=p.transition(o,u,{action:'ESCALATE',note:'Offline smoke only'});if(e.next.status!=='IN_PROGRESS'||e.next.finish)throw Error('ESCALATION_POLICY_INVALID');if(p.transition(o,u,{action:'DONE',confirm:true}).next.status!=='DONE')throw Error('COMPLETION_POLICY_INVALID');`;
  const result = cp.spawnSync(nodeExecutable, ['-e', code, root], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: Object.fromEntries(['SystemRoot', 'WINDIR', 'PATH', 'Path', 'PATHEXT', 'TEMP', 'TMP'].filter(key => process.env[key]).map(key => [key, process.env[key]])) });
  if (result.error || result.status !== 0) throw Error('STAGED_NATIVE_DEPENDENCY_OR_POLICY_SMOKE_FAILED');
}
async function verify(root, expected, nodeExecutable, { runSmoke = smoke } = {}) {
  const plan = load(root, expected);
  if (!sameFiles(inventory(root), plan.stagedFiles)) throw Error('STAGED_FILES_CHANGED');
  if (hash(read(path.join(root, '.b2c-release/previous-web-task.xml'))) !== plan.previousWebTaskSha256) throw Error('ROLLBACK_TASK_BACKUP_CHANGED');
  if (hash(read(path.join(root, '.b2c-release/candidate-manifest.json'))) !== plan.manifestSha256) throw Error('CANDIDATE_MANIFEST_CHANGED');
  if (hash(read(path.join(root, 'service/environment.json'))) !== plan.environmentSha256 || hash(read(path.join(root, 'service/secrets.dpapi'))) !== plan.encryptedBundleSha256) throw Error('STAGED_CONFIGURATION_CHANGED');
  // Check the original pinned snapshot through the existing read-only validator.
  const cfg = require('./courier-task-runner').configuration(plan.courierConfig, plan.courierConfigSha256);
  if (path.resolve(cfg.snapshot).toLowerCase() !== path.resolve(plan.previousRuntime).toLowerCase()) throw Error('COURIER_SNAPSHOT_CHANGED');
  for (const [file, digest] of Object.entries(plan.baselineSources)) if (hash(read(path.join(plan.previousRuntime, file))) !== digest) throw Error('PREVIOUS_WEB_SOURCE_CHANGED');
  if (!sameFiles(await require('./frontend-only-release').inventory(path.join(plan.previousRuntime, 'frontend/dist')), plan.baselineFrontend)) throw Error('PREVIOUS_FRONTEND_CHANGED');
  runSmoke(root, nodeExecutable);
  return { status: 'B2C_STAGED_FILES_AND_OFFLINE_SMOKE_PASS', applicationCommit: TARGET, stagedRuntime: root, previousRuntime: plan.previousRuntime, planSha256: expected, verifiedFiles: Object.keys(plan.stagedFiles).length, courierPinsVerified: true, activated: false };
}
async function health(root, expected, previous = false) {
  const plan = load(root, expected), target = previous ? plan.previousRuntime : root;
  const env = operatorJson(read(path.join(target, 'service/environment.json')));
  if (hash(read(path.join(target, 'service/environment.json'))) !== plan.environmentSha256 || hash(read(path.join(target, 'service/secrets.dpapi'))) !== plan.encryptedBundleSha256) throw Error('LIVE_CONFIGURATION_CHANGED');
  const frontend = await probe(target, env, path.join(target, 'frontend/dist'));
  const expectedIndex = previous ? plan.baselineIndexSha256 : plan.stagedFrontend['index.html'];
  if (frontend.indexSha256 !== expectedIndex) throw Error('LIVE_INDEX_NOT_EXPECTED_RELEASE');
  require('./courier-task-runner').configuration(plan.courierConfig, plan.courierConfigSha256);
  return { ...frontend, status: previous ? 'PREVIOUS_WEB_TLS_HEALTH_PASS' : 'NEW_WEB_TLS_HEALTH_PASS', applicationCommit: previous ? null : TARGET };
}
async function main() {
  const [mode, root, expected, nodeExecutable] = process.argv.slice(2);
  if (!['verify', 'health', 'health-previous'].includes(mode) || process.argv.length !== (mode === 'verify' ? 6 : 5)) throw Error('B2C_VERIFY_ARGUMENTS_REJECTED');
  console.log(JSON.stringify(mode === 'verify' ? await verify(root, expected, nodeExecutable) : await health(root, expected, mode === 'health-previous'), null, 2));
}
if (require.main === module) main().catch(error => { console.error(JSON.stringify({ status: 'B2C_WEB_CHECK_FAILED', code: /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : error.code || 'B2C_WEB_CHECK_FAILED' })); process.exitCode = 1; });
module.exports = { load, inventory, sameFiles, verify, health, smoke };

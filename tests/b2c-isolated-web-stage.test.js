const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { stage } = require('../scripts/stage-b2c-isolated-web');
const { BACKEND } = require('../scripts/inspect-b2c-windows-release');
const frontend = require('../scripts/frontend-only-release');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'b2c-isolated-stage-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runtime = path.join(root, 'runtime'), candidate = path.join(root, 'candidate'), target = path.join(root, 'stage');
  const put = (file, bytes) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); };
  for (const file of BACKEND) { put(path.join(runtime, file), 'baseline:' + file); put(path.join(candidate, file), 'candidate:' + file); }
  for (const name of ['scripts', 'contracts', 'node_modules', 'database']) put(path.join(runtime, name, 'synthetic.js'), 'retained-runtime-code');
  put(path.join(runtime, 'scripts/run-protected-web.ps1'), '# fixture launcher only');
  put(path.join(runtime, 'api-only-server.js'), '// retained');
  put(path.join(runtime, 'package.json'), '{"name":"synthetic"}');
  put(path.join(runtime, 'service/state/state.json'), '{"status":"READY","pid":123}');
  put(path.join(runtime, 'service/secrets.dpapi'), 'SYNTHETIC CIPHERTEXT ONLY');
  for (const name of ['ca.crt', 'localhost.crt', 'localhost.key', 'ca.key']) put(path.join(runtime, '.local/tls', name), 'synthetic:' + name);
  const env = {
    HDWORK2_SERVICE_AUTH_POLICY: 'operational-write', HDWORK2_SERVICE_AUTH_APPROVED: 'true', HDWORK2_LOCAL_READ_ONLY: 'false', HDWORK2_AUTH_V2: 'true', HDWORK2_AUTH_ONLY: 'false', HDWORK2_AUTH_WRITE_ENABLED: 'true', HDWORK2_AUTH_READ_DASHBOARD: 'true', HDWORK2_OPERATIONS_ENABLED: 'true',
    DB_USER: 'hdwork_auth', DB_NAME: 'hdwork2', DB_HOST: '127.0.0.1', DB_PORT: '3306', OP_READ_ENABLED: 'true', OP_READ_DB_USER: 'hdwork_ops_read', OP_READ_DB_NAME: 'hdwork2', OP_READ_DB_HOST: '127.0.0.1', OP_READ_DB_PORT: '3306',
    OP_WRITE_ENABLED: 'true', HDWORK2_OPERATIONAL_WRITE_APPROVED: 'true', OP_WRITE_DB_USER: 'hdwork_ops_write', OP_WRITE_DB_NAME: 'hdwork2', OP_WRITE_DB_HOST: '127.0.0.1', OP_WRITE_DB_PORT: '3306',
    B2C_WORKFLOW_READ_ENABLED: 'false', B2C_STAGING_ENABLED: 'false', COURIER_ENABLED: 'false', COURIER_ALLOW_NETWORK: 'false', HDWORK2_PUBLIC_ORIGIN_APPROVED: 'true', HDWORK2_PUBLIC_ORIGIN: 'https://hdwork2.yoloo.space', FRONTEND_ORIGINS: 'https://hdwork2.yoloo.space', HDWORK2_SHARED_GROUPS_ENABLED: 'true', HDWORK2_LIVE_CHAT_ENABLED: 'true', HDWORK2_SYSTEM_MONITORING_ENABLED: 'true', HDWORK2_TESTING_SOLVER_ENABLED: 'false',
  };
  put(path.join(runtime, 'service/environment.json'), JSON.stringify(env));
  put(path.join(runtime, 'frontend/dist/index.html'), '<script src="/assets/old.js"></script>');
  put(path.join(runtime, 'frontend/dist/assets/old.js'), 'old-fixture');
  put(path.join(candidate, 'frontend/dist/index.html'), '<script src="/assets/new.js"></script>');
  put(path.join(candidate, 'frontend/dist/assets/new.js'), 'new-fixture');
  const manifestSha256 = await frontend.attest(path.join(candidate, 'frontend/dist'), 'https://hdwork2.yoloo.space', { authCookie: true, operations: true, liveChat: true });
  const cfg = { snapshot: runtime, environmentSha256: hash(fs.readFileSync(path.join(runtime, 'service/environment.json'))), encryptedBundleSha256: hash(fs.readFileSync(path.join(runtime, 'service/secrets.dpapi'))) };
  const courierConfig = path.join(root, 'autostart/config.json'); put(courierConfig, JSON.stringify(cfg));
  fs.mkdirSync(path.join(target, 'service/state'), { recursive: true });
  const input = { candidateRoot: candidate, runtimeRoot: runtime, stageRoot: target, courierConfig, configSha256: hash(fs.readFileSync(courierConfig)), ownerSid: 'S-1-5-21-123', webProcessVerified: true,
    manifestSha256, baselineIndexSha256: hash(fs.readFileSync(path.join(runtime, 'frontend/dist/index.html'))), webTaskXml: '<?xml version="1.0" encoding="UTF-16"?><Task>synthetic existing task</Task>' };
  const inspectRuntime = async () => ({ runtimeRoot: runtime, activeDist: path.join(runtime, 'frontend/dist'), frontend: { status: 'BASELINE_FRONTEND_PASS', indexSha256: input.baselineIndexSha256 }, blockers: ['IN_PLACE_WEB_UPDATE_WOULD_BREAK_COURIER_PINS'] });
  const gitBlob = (_root, file) => fs.readFileSync(path.join(candidate, file));
  return { root, runtime, candidate, target, put, env, input, inspectRuntime, gitBlob };
}
test('isolated staging patches exactly three backend files, keeps ciphertext/env, old assets and rollback task, and starts nothing', async t => {
  const f = await fixture(t), oldConfig = fs.readFileSync(f.input.courierConfig), oldIndex = fs.readFileSync(path.join(f.runtime, 'frontend/dist/index.html'));
  const result = await stage(f.input, f);
  assert.equal(result.status, 'STAGED_NOT_STARTED'); assert.equal(result.activated, false); assert.equal(result.servicesChanged, false);
  assert.deepEqual(fs.readFileSync(f.input.courierConfig), oldConfig);
  assert.deepEqual(fs.readFileSync(path.join(f.runtime, 'frontend/dist/index.html')), oldIndex);
  for (const file of BACKEND) { assert.equal(fs.readFileSync(path.join(f.runtime, file), 'utf8'), 'baseline:' + file); assert.equal(fs.readFileSync(path.join(f.target, file), 'utf8'), 'candidate:' + file); }
  for (const file of ['service/environment.json', 'service/secrets.dpapi']) assert.deepEqual(fs.readFileSync(path.join(f.target, file)), fs.readFileSync(path.join(f.runtime, file)));
  assert.equal(fs.existsSync(path.join(f.target, '.local/tls/ca.key')), false);
  assert.equal(fs.existsSync(path.join(f.target, 'service/state/state.json')), false);
  assert.equal(fs.readFileSync(path.join(f.target, 'frontend/dist/assets/old.js'), 'utf8'), 'old-fixture');
  assert.equal(fs.readFileSync(path.join(f.target, 'frontend/dist/assets/new.js'), 'utf8'), 'new-fixture');
  const planBytes = fs.readFileSync(path.join(f.target, '.b2c-release/plan.json')), plan = JSON.parse(planBytes);
  assert.equal(hash(planBytes), result.planSha256);
  assert.equal(hash(fs.readFileSync(path.join(f.target, '.b2c-release/previous-web-task.xml'))), plan.previousWebTaskSha256);
});
test('changed build hash, baseline or conflicting directory prevents staging payload writes', async t => {
  const f = await fixture(t);
  await assert.rejects(stage({ ...f.input, manifestSha256: '0'.repeat(64) }, f), /MANIFEST_HASH_MISMATCH/);
  assert.equal(fs.existsSync(path.join(f.target, 'src')), false);
  await assert.rejects(stage({ ...f.input, baselineIndexSha256: '0'.repeat(64) }, { ...f, inspectRuntime: async () => ({ runtimeRoot: f.runtime, frontend: { status: 'BASELINE_FRONTEND_PASS', indexSha256: f.input.baselineIndexSha256 }, blockers: [] }) }), /RUNTIME_BASELINE_REQUIRES_REVIEW/);
  f.put(path.join(f.target, 'existing.txt'), 'keep');
  await assert.rejects(stage(f.input, f), /EMPTY_PRIVATE_STAGE_REQUIRED/);
  assert.equal(fs.readFileSync(path.join(f.target, 'existing.txt'), 'utf8'), 'keep');
});
test('an immutable asset collision leaves a failed private stage and the live frontend unchanged', async t => {
  const f = await fixture(t);
  f.put(path.join(f.candidate, 'frontend/dist/assets/old.js'), 'different-under-old-name');
  f.input.manifestSha256 = await frontend.attest(path.join(f.candidate, 'frontend/dist'), 'https://hdwork2.yoloo.space', { authCookie: true, operations: true, liveChat: true });
  await assert.rejects(stage(f.input, f), /IMMUTABLE_ASSET_COLLISION/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.target, '.b2c-release/plan.json'))).state, 'STAGING_FAILED_NOT_ACTIVATED');
  assert.equal(fs.readFileSync(path.join(f.runtime, 'frontend/dist/assets/old.js'), 'utf8'), 'old-fixture');
});
test('stage wrapper contains no activation, task repin, DPAPI unwrap or database operation', () => {
  const script = fs.readFileSync('scripts/stage-b2c-isolated-web.ps1', 'utf8');
  assert.match(script, /SetAccessRuleProtection/); assert.match(script, /S-1-5-19/); assert.match(script, /Export-ScheduledTask/);
  assert.doesNotMatch(script, /(?:Start|Stop|Set|Enable|Disable|Register|Unregister)-ScheduledTask|Restart-Service|Unprotect|ProtectedData|mysql|ConfirmApply/);
});
test('a changed encrypted bundle is rejected before payload copying or decryption', async t => {
  const f = await fixture(t);
  f.put(path.join(f.runtime, 'service/secrets.dpapi'), 'CHANGED SYNTHETIC CIPHERTEXT');
  await assert.rejects(stage(f.input, f), /ENCRYPTED_BUNDLE_PIN_CHANGED/);
  assert.equal(fs.existsSync(path.join(f.target, 'src')), false);
  assert.equal(fs.readFileSync(path.join(f.runtime, 'service/secrets.dpapi'), 'utf8'), 'CHANGED SYNTHETIC CIPHERTEXT');
});
test('a stage child junction/symlink cannot redirect writes into the active runtime', async t => {
  const f = await fixture(t), before = fs.readFileSync(path.join(f.runtime, 'service/environment.json'));
  fs.rmSync(path.join(f.target, 'service'), { recursive: true });
  fs.symlinkSync(path.join(f.runtime, 'service'), path.join(f.target, 'service'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(stage(f.input, f), /STAGE_DIRECTORY_REJECTED/);
  assert.deepEqual(fs.readFileSync(path.join(f.runtime, 'service/environment.json')), before);
});

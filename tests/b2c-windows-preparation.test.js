const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { inspect, TARGET, BACKEND } = require('../scripts/inspect-b2c-windows-release');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function fixture(t, { separate = false, drift = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'b2c-inspection-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const candidateRoot = path.join(root, 'candidate'), runtimeRoot = path.join(root, 'runtime'), courierSnapshot = separate ? path.join(root, 'courier') : runtimeRoot;
  const put = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
  const sources = {};
  for (const file of BACKEND) {
    put(path.join(candidateRoot, file), 'candidate\r\n');
    put(path.join(runtimeRoot, file), drift ? 'unreviewed\n' : 'baseline\r\n');
    if (separate) put(path.join(courierSnapshot, file), 'baseline\n');
    sources[file] = hash(fs.readFileSync(path.join(courierSnapshot, file)));
  }
  put(path.join(runtimeRoot, 'service/environment.json'), JSON.stringify({ HDWORK2_PUBLIC_ORIGIN: 'https://hdwork2.yoloo.space', HDWORK2_SHARED_GROUPS_ENABLED: 'true' }));
  const config = { version: 1, kind: 'HDWORK2_COURIER_AUTOSTART', ownerSid: 'S-1-5-21-123', snapshot: courierSnapshot, sourceHashes: sources };
  const courierConfig = path.join(root, 'autostart/config.json'); put(courierConfig, JSON.stringify(config));
  const metadata = { candidateRoot, runtimeRoot, courierConfig, configSha256: hash(fs.readFileSync(courierConfig)), ownerSid: config.ownerSid, webProcessVerified: true };
  const gitCommand = (_root, args) => {
    if (args[0] === 'status' || args[0] === 'merge-base') return '';
    if (args[0] === 'diff') return 'scripts/inspect-b2c-windows-release.js\n';
    if (args[0] === 'rev-parse') return TARGET;
    if (args[0] === 'show') return args[1].startsWith(TARGET) ? 'candidate\n' : 'baseline\n';
    throw Error('Unexpected Git inspection');
  };
  let probes = 0;
  const probeFrontend = async (snapshot, _env, dist) => { probes++; assert.equal(snapshot, runtimeRoot); assert.equal(dist, path.join(runtimeRoot, 'frontend/dist')); return { status: 'BASELINE_FRONTEND_PASS', fixture: true }; };
  return { root, metadata, gitCommand, probeFrontend, get probes() { return probes; } };
}
test('shared snapshot pin overlap is reported without changing source/config or reading secrets', async t => {
  const f = fixture(t), before = fs.readFileSync(f.metadata.courierConfig);
  const result = await inspect(f.metadata, f);
  assert.equal(result.sameWebAndCourierSnapshot, true);
  assert.deepEqual(result.pinnedChangedFiles, BACKEND);
  assert.ok(result.blockers.includes('IN_PLACE_WEB_UPDATE_WOULD_BREAK_COURIER_PINS'));
  assert.equal(result.changedBackendFiles.every(row => row.runtimeState === 'BASELINE_MATCH' && row.courierPinMatchesFile), true);
  assert.equal(result.runtimeChanged, false); assert.equal(result.credentialsAccessed, false); assert.equal(result.deploymentReady, false);
  assert.deepEqual(fs.readFileSync(f.metadata.courierConfig), before);
  assert.equal(f.probes, 1);
  // No secrets.dpapi, DB driver, frontend build or service exists in this fixture.
});
test('separate snapshots do not imply readiness or require changes to Courier pins', async t => {
  const f = fixture(t, { separate: true });
  const result = await inspect(f.metadata, f);
  assert.equal(result.sameWebAndCourierSnapshot, false);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.deploymentReady, false);
});
test('unknown source drift is visible; task config hash mismatch stops before health', async t => {
  const f = fixture(t, { drift: true });
  const result = await inspect(f.metadata, f);
  assert.equal(result.changedBackendFiles.every(row => row.runtimeState === 'UNKNOWN_DRIFT'), true);
  assert.ok(result.blockers.some(code => code.startsWith('RUNTIME_SOURCE_DRIFT:')));
  await assert.rejects(inspect({ ...f.metadata, configSha256: '0'.repeat(64) }, f), /COURIER_CONFIG_HASH_MISMATCH/);
  assert.equal(f.probes, 1);
});
test('dirty or changed application candidate is rejected before accessing runtime files', async t => {
  const f = fixture(t);
  await assert.rejects(inspect(f.metadata, { ...f, gitCommand: () => 'dirty' }), /CANDIDATE_WORKTREE_NOT_CLEAN/);
  await assert.rejects(inspect(f.metadata, { ...f, gitCommand: (root, args) => args[0] === 'diff' ? 'src/operations/policy.js\n' : f.gitCommand(root, args) }), /APPLICATION_DIFFERS_FROM_APPROVED_CANDIDATE/);
  assert.equal(f.probes, 0);
});
test('Windows wrapper exposes inspection only and has no service, credential, migration or apply operation', () => {
  const script = fs.readFileSync('scripts/inspect-b2c-windows-release.ps1', 'utf8');
  assert.match(script, /Get-ScheduledTask/); assert.match(script, /Get-CimInstance/);
  assert.doesNotMatch(script, /(?:Start|Stop|Set|Enable|Disable|Register|Unregister)-ScheduledTask|Restart-Service|ProtectedData|Unprotect|Set-Content|Copy-Item|Remove-Item|ConfirmApply|ApproveFrontendOnly/);
});
test('a Courier source pin mismatch is reported without rewriting the pinned file or config', async t => {
  const f = fixture(t, { separate: true });
  const configBytes = fs.readFileSync(f.metadata.courierConfig);
  const cfg = JSON.parse(configBytes);
  const file = path.join(cfg.snapshot, BACKEND[0]);
  fs.writeFileSync(file, 'unexpected source');
  const result = await inspect(f.metadata, f);
  assert.ok(result.blockers.includes('COURIER_SOURCE_PIN_DRIFT:' + BACKEND[0]));
  assert.equal(fs.readFileSync(file, 'utf8'), 'unexpected source');
  assert.deepEqual(fs.readFileSync(f.metadata.courierConfig), configBytes);
});
test('TLS bypass is rejected before any certificate read or network probe', async () => {
  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  try {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    await assert.rejects(require('../scripts/inspect-b2c-windows-release').probe('/missing', {}, '/missing'), /TLS_BYPASS_REJECTED/);
  } finally { if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED; else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous; }
});
test('inspection accepts metadata only, rejects missing process evidence and does not echo unknown input', async t => {
  const f = fixture(t);
  await assert.rejects(inspect({ ...f.metadata, password: 'synthetic-never-logged' }, f), error => error.message === 'INSPECTION_INPUT_REJECTED');
  await assert.rejects(inspect({ ...f.metadata, webProcessVerified: false }, f), /INSPECTION_INPUT_REJECTED/);
  assert.equal(f.probes, 0);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const {topology} = require('../src/config/production-topology');
const {inspect} = require('../scripts/hdwork2-control');
const {validateProtectedBundle} = require('../src/config/protected-service-bundle');
const validators = require('../scripts/office-web-service');
const config = () => ({version: 1, environment: 'production', repository: 'repo', webSnapshot: 'runtime',
  routingReview: 'routing.json', apiOrigin: 'https://synthetic.example', bot: {telegramId: '123456789',
    internalId: 'synthetic-prod', username: 'SyntheticBot', taskName: 'HDWork2-Courier', legacyNamespaceReviewed: false}});
const bundle = () => ({authPassword: 'synthetic-auth', readPassword: 'synthetic-read', signingSecret: 's'.repeat(32),
  writePassword: 'synthetic-write', testingWritePassword: 'synthetic-trial', testingTelegramToken: '123456789:' + 'a'.repeat(35)});
test('disabling trial preserves encrypted-bundle shape without allowing unknown credentials or unapproved writer', () => {
  const value = bundle(), before = structuredClone(value), env = {HDWORK2_SERVICE_AUTH_POLICY: 'operational-write', HDWORK2_TESTING_SOLVER_ENABLED: 'false'};
  assert.equal(validateProtectedBundle(value, env, validators), value);
  assert.deepEqual(value, before);
  const base = {...value}; delete base.testingTelegramToken; delete base.testingWritePassword;
  assert.equal(validateProtectedBundle(base, env, validators), base);
  assert.throws(() => validateProtectedBundle(value, {}, validators));
  assert.throws(() => validateProtectedBundle({...value, unrelatedToken: 'synthetic'}, env, validators));
  delete value.testingWritePassword;
  assert.throws(() => validateProtectedBundle(value, env, validators));
});
test('active trial still requires both valid trial secrets; normal bundles stay strictly validated', () => {
  const env = {HDWORK2_SERVICE_AUTH_POLICY: 'operational-write', HDWORK2_TESTING_SOLVER_ENABLED: 'true'};
  assert.equal(validateProtectedBundle(bundle(), env, validators).writePassword, 'synthetic-write');
  for (const change of [v => delete v.testingTelegramToken, v => v.testingTelegramToken = 'invalid', v => v.testingWritePassword = '', v => v.signingSecret = 'short']) {
    const v = bundle(); change(v); assert.throws(() => validateProtectedBundle(v, env, validators));
  }
});
test('protected launcher boots with dormant trial pair without initializing trial sender and clears all secrets', async () => {
  const vm = require('node:vm');
  const secrets = bundle();
  const env = {HDWORK2_PUBLIC_ORIGIN: 'https://hdwork2.yoloo.space', HDWORK2_EDGE_AUTH_MODE: 'application-session',
    HDWORK2_SERVICE_AUTH_POLICY: 'operational-write', HDWORK2_TESTING_SOLVER_ENABLED: 'false'};
  let trialStarted = false, appStarted = false;
  const pools = {status: () => ({}), initializeWithSecrets: async () => {}, close: async () => {}};
  const dependencies = {
    'node:fs': {readFileSync: () => JSON.stringify(env), writeFileSync: () => {}},
    'node:path': path,
    '../src/config/persistent-auth': {validatePersistentAuth: () => {}},
    '../src/operations/testing-solver-scope': require('../src/operations/testing-solver-scope'),
    './office-web-service': {...validators, bootstrap: async (stream, {validate}) => validate(secrets)},
    '../src/config/protected-service-bundle': {validateProtectedBundle},
    '../src/config/api-only-startup': {validateApiOnlyConfig: () => {}},
    '../src/config/database': {end: async () => {}},
    '../src/access/http': {service: () => {}},
    '../src/config/operational-pools': pools,
    '../src/config/testing-solver-runtime': {initialize: async () => { trialStarted = true; }, close: async () => {}},
    '../local-web-server': {startLocalWeb: async () => { appStarted = true; return {close: async () => {}}; }}
  };
  const mod = {exports: {}};
  const fakeRequire = name => {
    if (!Object.hasOwn(dependencies, name)) throw Error('Unexpected dependency');
    return dependencies[name];
  };
  fakeRequire.main = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../scripts/protected-web-service.js'), 'utf8'), {
    module: mod, require: fakeRequire, __dirname: path.join(__dirname, '../scripts'),
    process: {env: {}, stdin: {once: () => {}, destroy: () => {}}, once: () => {}}, console
  });
  await mod.exports.run();
  assert.equal(appStarted, true);
  assert.equal(trialStarted, false);
  assert.ok(Object.values(secrets).every(value => value === ''));
});
test('production topology has no defaults, no inline secrets and explicit legacy namespace review', () => {
  assert.equal(topology(config()).apiOrigin, 'https://synthetic.example');
  for (const change of [v => v.environment = 'testing', v => v.token = 'synthetic', v => v.bot.token = 'synthetic',
    v => v.apiOrigin = 'https://user:password@synthetic.example', v => v.bot.taskName = 'HDWork2-Testing',
    v => v.bot.telegramId = 123456789]) {
    const v = config(); change(v); assert.throws(() => topology(v));
  }
  const v = config(); v.bot.internalId = 'existing-testing-namespace';
  assert.throws(() => topology(v), /NAMESPACE_REVIEW/);
  v.bot.legacyNamespaceReviewed = true;
  assert.equal(topology(v).bot.internalId, 'existing-testing-namespace');
});
function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hdwork-control-'));
  const write = (file, bytes) => { const target = path.join(root, file); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, bytes); };
  const git = args => cp.execFileSync('git', args, {cwd: path.join(root, 'repo'), stdio: 'pipe'});
  try {
    write('repo/src/config/operational-grants.js', 'module.exports={};\n');
    write('repo/src/module.js', 'module.exports=42;\n');
    write('repo/database/manual/013_fixture.sql', '-- synthetic only\n');
    write('repo/package.json', '{}');
    git(['init', '-q']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.invalid']);
    git(['add', '.']); git(['commit', '-qm', 'synthetic']);
    fs.cpSync(path.join(root, 'repo'), path.join(root, 'runtime'), {recursive: true, filter: p => !p.includes('.git')});
    write('runtime/service/environment.json', JSON.stringify({HDWORK2_PUBLIC_ORIGIN: 'https://synthetic.example',
      HDWORK2_LIVE_CHAT_ENABLED: 'true', HDWORK2_TESTING_SOLVER_ENABLED: 'false', PASSWORD: 'DO_NOT_PRINT_SYNTHETIC'}));
    write('config.json', JSON.stringify(config()));
    const targets = ['TIAL', 'LOGIC'].map((category, i) => ({botId: 'synthetic-prod', botUsername: 'SyntheticBot', category,
      profile: i ? 'SOLVER1' : 'TIAL1', chatId: '-10012345' + i, threadId: null, verified: true,
      verifiedBy: 'fixture', verifiedAt: '2020-01-01T00:00:00Z', evidence: 'synthetic fixture'}));
    write('routing.json', JSON.stringify({version: 1, environment: 'production', newBotIsolationConfirmed: true, targets}));
    run({root, write, file: path.join(root, 'config.json'), git});
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
}
test('one command detects runtime drift and hashes migrations without claiming production integration or changing files', () => fixture(f => {
  const envPath = path.join(f.root, 'runtime/service/environment.json'), before = fs.readFileSync(envPath);
  const result = inspect(f.file, 'plan');
  assert.equal(result.status, 'LOCAL_CONSISTENCY_PASS');
  assert.equal(result.productionIntegrationVerified, false);
  assert.equal(result.activationReady, false);
  assert.ok(Object.values(result.health).every(v => v === 'UNKNOWN'));
  assert.equal(result.release.automaticApplySupported, false);
  assert.equal(result.migrations.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /DO_NOT_PRINT_SYNTHETIC/);
  assert.deepEqual(fs.readFileSync(envPath), before);
  f.write('runtime/src/module.js', 'locally changed runtime\n');
  const drift = inspect(f.file);
  assert.equal(drift.status, 'BLOCKED');
  assert.deepEqual(drift.source.drift, [{file: 'src/module.js', status: 'DIFFERENT'}]);
}));
test('dirty repository, active trial, wrong identity, links and invalid mode fail closed', () => fixture(f => {
  f.write('repo/src/module.js', 'dirty\n');
  assert.equal(inspect(f.file).repository.clean, false);
  const env = JSON.parse(fs.readFileSync(path.join(f.root, 'runtime/service/environment.json')));
  env.HDWORK2_TESTING_SOLVER_ENABLED = 'true';
  f.write('runtime/service/environment.json', JSON.stringify(env));
  assert.ok(inspect(f.file).blockers.includes('TRIAL_OVERLAY_STILL_ENABLED'));
  const c = config(); c.bot.internalId = 'different-prod'; f.write('config.json', JSON.stringify(c));
  assert.throws(() => inspect(f.file), /IDENTITY_MISMATCH/);
  f.write('config.json', JSON.stringify(config()));
  fs.unlinkSync(path.join(f.root, 'runtime/src/module.js'));
  fs.symlinkSync(path.join(f.root, 'repo/src/module.js'), path.join(f.root, 'runtime/src/module.js'));
  assert.throws(() => inspect(f.file), /UNSAFE_CONTROL_INPUT/);
  assert.throws(() => inspect(f.file, 'apply'), /MODE_REJECTED/);
}));
test('shared operator JSON reader accepts Windows UTF-16LE and rejects invalid input', () => {
  const {operatorJson} = require('../src/config/operator-json');
  assert.deepEqual(operatorJson(Buffer.concat([Buffer.from([255,254]), Buffer.from('{"a":1}', 'utf16le')])), {a: 1});
  assert.throws(() => operatorJson(Buffer.from('not json')));
});

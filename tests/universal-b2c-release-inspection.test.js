const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { runtime, schema, TARGET, FILES } = require('../scripts/inspect-universal-b2c-release');
const { hash } = require('../scripts/courier-task-runner');
function runtimeFixture() {
  const root = path.resolve('/synthetic-universal'), auto = path.join(root, 'autostart');
  const input = { candidateRoot: path.join(root, 'candidate'), runtimeRoot: path.join(root, 'web'), courierConfig: path.join(auto, 'config.json'), configSha256: 'a'.repeat(64), ownerSid: 'S-1-5-21-123', webProcessVerified: true };
  const cfg = { ownerSid: input.ownerSid, snapshot: path.join(root, 'courier'), productionPlan: path.join(root, 'plan.json'), productionPlanSha256: 'b'.repeat(64), sourceHashes: Object.fromEntries(FILES.map(file => [file, 'c'.repeat(64)])) };
  const files = new Map(), gitCalls = [];
  const env = { HDWORK2_SHARED_GROUPS_ENABLED: 'true' };
  files.set(path.join(input.runtimeRoot, 'service/environment.json'), Buffer.from(JSON.stringify(env)));
  files.set(cfg.productionPlan, Buffer.from(JSON.stringify({ routingMode: 'database', activationNotBefore: '2026-11-10T13:20:35.278Z' })));
  const wrapper = Buffer.from('synthetic-owned-wrapper'), runner = Buffer.from('synthetic-owned-runner');
  files.set(path.join(auto, 'run-owner.ps1'), wrapper); files.set(path.join(auto, 'courier-task-runner.js'), runner);
  files.set(path.join(auto, 'autostart.review.json'), Buffer.from(JSON.stringify({ ownerSid: input.ownerSid, configSha256: input.configSha256, taskName: 'HDWork2-LiveChat-Courier', wrapperSha256: hash(wrapper), runnerSha256: hash(runner) })));
  for (const file of FILES) { files.set(path.join(input.runtimeRoot, file), Buffer.from('old-web')); files.set(path.join(cfg.snapshot, file), Buffer.from('old-courier')); }
  const deps = { readFile: file => { assert.ok(files.has(file), file); return files.get(file); }, loadConfiguration: () => cfg, validatePlan: value => value,
    git: (_exe, args) => { gitCalls.push(args); return Buffer.from('candidate'); }, probe: async () => ({ status: 'SYNTHETIC_TLS_PASS', indexSha256: 'd'.repeat(64) }) };
  return { input, cfg, files, env, deps, gitCalls };
}
test('runtime inspection handles separate snapshots and preserves pinned launcher/plan; Git provenance is explicit', async () => {
  const f = runtimeFixture(), result = await runtime(f.input, f.deps);
  assert.equal(result.report.sharedGroupsWeb, true); assert.equal(result.report.courierRoutingMode, 'database');
  assert.equal(result.report.courierLauncherVerified, true); assert.equal(result.report.runtimeChanged, false);
  assert.equal(result.report.files.length, 3); assert.ok(result.report.files.every(row => !row.webTargetMatch && !row.courierTargetMatch && row.pinnedByCourier));
  assert.ok(f.gitCalls[0].includes(TARGET)); assert.equal(JSON.stringify(result.report).includes('synthetic-owned-wrapper'), false);
});
test('runtime drift, plaintext environment and changed owner fail before protected reader access', async () => {
  let f = runtimeFixture(); f.cfg.ownerSid = 'S-1-5-21-999'; await assert.rejects(runtime(f.input, f.deps), /COURIER_OWNER_MISMATCH/);
  f = runtimeFixture(); f.files.set(path.join(f.input.runtimeRoot, 'service/environment.json'), Buffer.from(JSON.stringify({ DB_PASSWORD: 'do-not-echo' })));
  await assert.rejects(runtime(f.input, f.deps), /PLAINTEXT_ENVIRONMENT_REJECTED/);
  f = runtimeFixture(); f.files.set(path.join(path.dirname(f.input.courierConfig), 'run-owner.ps1'), Buffer.from('changed'));
  await assert.rejects(runtime(f.input, f.deps), /COURIER_LAUNCHER_REVIEW_CHANGED/);
});
function databaseFixture() {
  const env = { HDWORK2_SHARED_GROUPS_ENABLED: 'true', HDWORK2_LIVE_CHAT_ENABLED: 'true', HDWORK2_SYSTEM_MONITORING_ENABLED: 'true', OP_READ_ENABLED: 'true', OP_READ_DB_USER: 'hdwork_ops_read', OP_READ_DB_NAME: 'hdwork2', OP_READ_DB_HOST: '127.0.0.1', OP_READ_DB_PORT: '3306' };
  const state = { closed: false, identity: 'hdwork_ops_read@localhost', grants: Object.entries(require('../src/config/operational-grants').policies.chatRead).map(([table, permissions]) => ({ g: `GRANT ${permissions.join(', ')} ON hdwork2.${table} TO 'fixture'@'localhost'` })),
    columns: [{ name: 'category' }, { name: 'group_name', type: 'varchar', maximumLength: 100, nullable: 'NO' }, { name: 'blocked_before', type: 'datetime', precision: 3, nullable: 'YES' }], checks: [{ name: 'hd2_mapping_category', clause: "category IN ('TIAL','LOGIC','ALL')" }] };
  const queries = [], rows = [{ id: 'synthetic', category: 'TIAL', profile: 'TIAL1', chat_id: '-1001', thread_id: null, enabled: 1, verified: 1, version: 0 }];
  const c = { async beginTransaction() { queries.push('BEGIN'); }, async commit() { queries.push('COMMIT'); }, async end() { state.closed = true; }, async query(sql, params) {
    queries.push(sql);
    if (sql.startsWith('SELECT CURRENT_USER')) return [[{ account: state.identity, db: 'hdwork2' }]];
    if (sql === 'SHOW GRANTS FOR CURRENT_USER') return [state.grants];
    if (sql === 'SET TRANSACTION READ ONLY') return [{}];
    if (sql.includes('information_schema.COLUMNS')) return [state.columns];
    if (sql.includes('information_schema.TABLE_CONSTRAINTS')) return [state.checks];
    if (sql.includes('FROM hd2_system_mappings')) { assert.deepEqual(params, ['synthetic-bot']); return [rows]; }
    if (sql.includes('FROM hd2_courier_workers')) return [[{ expires_ms: 2000 }]];
    assert.fail(sql);
  } };
  const args = { env, readPassword: 'synthetic-private-read-only', botId: 'synthetic-bot', now: () => 1000, connect: async options => { assert.equal(options.user, 'hdwork_ops_read'); assert.equal(options.multipleStatements, false); return c; } };
  return { args, state, queries, rows };
}
test('native reader checks existing 014 schema and effective coverage without writes, orders, queues or exposed destinations', async () => {
  const f = databaseFixture(), result = await schema(f.args);
  assert.equal(result.schemaCompatible, true); assert.equal(result.effectiveB2CCoverage, true); assert.equal(result.courierLeaseActive, true); assert.equal(result.sqlWrites, false);
  assert.equal(f.state.closed, true); assert.equal(JSON.stringify(result).includes('synthetic-private'), false); assert.equal(JSON.stringify(result).includes('-1001'), false);
  assert.ok(f.queries.every(sql => /^(SELECT|SHOW GRANTS|SET TRANSACTION READ ONLY|BEGIN$|COMMIT$)/.test(sql)));
  assert.ok(f.queries.every(sql => !/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|hd2_orders|hd2_courier_outbox)\b/i.test(sql)));
});
test('missing migration is reported incompatible; partial migration and changed column types block compatibility', async () => {
  let f = databaseFixture(); f.state.columns = [{ name: 'category' }]; f.state.checks = [{ name: 'hd2_system_mappings_chk_1', clause: "category IN ('TIAL','LOGIC')" }];
  assert.equal((await schema(f.args)).schemaCompatible, false);
  f = databaseFixture(); f.state.columns.pop(); await assert.rejects(schema(f.args), /PARTIAL_OR_UNEXPECTED_MIGRATION_014/); assert.equal(f.state.closed, true);
  f = databaseFixture(); f.state.columns[2].precision = 0; assert.equal((await schema(f.args)).schemaCompatible, false);
});
test('wrong DB account or excessive grants stop before metadata and always close the connection', async () => {
  let f = databaseFixture(); f.state.identity = 'root@localhost'; await assert.rejects(schema(f.args), /NATIVE_READ_IDENTITY_MISMATCH/); assert.equal(f.state.closed, true); assert.equal(f.queries.length, 1);
  f = databaseFixture(); f.state.grants = [{ g: "GRANT ALL PRIVILEGES ON *.* TO 'fixture'@'localhost'" }]; await assert.rejects(schema(f.args), /NATIVE_READ_GRANTS_REJECTED/); assert.equal(f.state.closed, true); assert.equal(f.queries.length, 2);
});
test('Windows inspection has no task/runtime mutation and sends only native reader secret via owned stdin', () => {
  const ps = fs.readFileSync(path.join(__dirname, '../scripts/inspect-universal-b2c-release.ps1'), 'utf8');
  assert.doesNotMatch(ps, /(?:Start|Stop|Set|Register|Disable|Enable)-ScheduledTask|Invoke-WebRequest|api\.telegram|authPassword|writePassword|signingSecret/);
  assert.match(ps, /RedirectStandardInput=\$true/); assert.match(ps, /\$inputMetadata\.Remove\('readPassword'\)/); assert.match(ps, /ReadDatabaseMetadata/);
});

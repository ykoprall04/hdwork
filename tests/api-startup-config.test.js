const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { validateApiOnlyConfig, stagingOptions } = require('../src/config/api-only-startup');
const env = { DB_NAME: 'hdwork2', DB_HOST: 'dummy-main', DB_USER: 'dummy_main', DB_PASSWORD: 'dummy_password', JWT_SECRET: 'dummy_secret', FRONTEND_ORIGINS: 'https://web.example' };
const staging = { B2C_STAGING_ENABLED: 'true', B2C_STAGING_DB_HOST: 'dummy-stage', B2C_STAGING_DB_USER: 'dummy_reader', B2C_STAGING_DB_PASSWORD: 'dummy_stage_password' };
test('API-only requires hdwork2, keeps staging disabled by default, validates ports and required config', () => {
  assert.equal(validateApiOnlyConfig(env).database, 'hdwork2'); assert.equal(validateApiOnlyConfig(env).staging, null);
  for (const patch of [{ DB_NAME: 'hd_b2c' }, { DB_NAME: 'legacy' }, { DB_NAME: undefined }, { DB_NAME: 'hdwork2 ' }, { PORT: '0' }, { DB_PORT: '3306junk' }, { DB_USER: '' }, { JWT_SECRET: '' }, { FRONTEND_ORIGINS: '*' }, { B2C_STAGING_ENABLED: 'TRUE' }]) {
    assert.throws(() => validateApiOnlyConfig({ ...env, ...patch }));
  }
});
test('enabled staging has independent credentials/schema and never becomes main database', () => {
  const config = validateApiOnlyConfig({ ...env, ...staging });
  assert.equal(config.database, 'hdwork2'); assert.equal(config.staging.database, 'hd_b2c'); assert.equal(config.staging.multipleStatements, false);
  for (const patch of [{ B2C_STAGING_DB_USER: env.DB_USER }, { B2C_STAGING_DB_USER: 'root' }, { B2C_STAGING_DB_PASSWORD: '' }, { B2C_STAGING_DB_NAME: 'hdwork2' }, { B2C_STAGING_DB_PORT: '-1' }]) assert.throws(() => validateApiOnlyConfig({ ...env, ...staging, ...patch }));
});
function runEntry(config, cli = false, listenError = false) {
  const module = { exports: {} }, imports = [], logs = [], listeners = [];
  function requireMock(name) {
    imports.push(name);
    if (name === './src/config/api-only-startup') return { validateApiOnlyConfig: () => validateApiOnlyConfig(config) };
    if (name === 'dotenv') return { config() {} };
    if (name === './src/api-only-app') return { createApiOnlyApp: () => ({}) };
    if (name === 'node:http') return { createServer() { return { once(_event, callback) { this.error = callback; }, listen(port, host, ready) { listeners.push([port, host]); if (listenError) this.error(Error('password=dummy_password host.private')); else ready(); } }; } };
    throw Error('forbidden dependency');
  }
  requireMock.main = cli ? module : {};
  const process = { env: config, exitCode: 0 };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../api-only-server.js'), 'utf8'), { module, require: requireMock, process, console: { log: text => logs.push(text), error: text => logs.push(text) } });
  return { ...module.exports, imports, logs, process, listeners };
}
test('bad startup config fails before app/HTTP/DB import; import itself is inert', async () => {
  const f = runEntry({ ...env, DB_NAME: 'legacy' }); assert.deepEqual(f.imports, []);
  await assert.rejects(f.startApiOnly()); assert.deepEqual(f.imports, ['./src/config/api-only-startup']); assert.deepEqual(f.listeners, []);
});
test('valid startup binds loopback and never imports operational background dependencies', async () => {
  const f = runEntry(env); await f.startApiOnly();
  assert.deepEqual(f.listeners, [[3090, '127.0.0.1']]);
  assert.deepEqual(f.imports, ['./src/config/api-only-startup', 'node:http', './src/api-only-app']);
});
test('CLI config/listen failures exit safely with no secret-bearing error details', async () => {
  for (const f of [runEntry({ ...env, DB_NAME: 'legacy' }, true), runEntry(env, true, true)]) {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.process.exitCode, 1); assert.equal(f.logs.length, 1);
    assert.doesNotMatch(f.logs.join(' '), /dummy_password|host.private|dummy_secret/);
  }
});
function readerFixture(failAt) {
  const events = [], pools = [], query = 'SELECT `id` FROM `hd_b2c`.`sheet_import_test` WHERE `sumber_tab` = ?';
  const module = { exports: {} };
  const stageEnv = { ...env, ...staging };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/config/b2c-staging-database.js'), 'utf8'), {
    module, process: { env: stageEnv },
    require(name) {
      if (name === './api-only-startup') return { stagingOptions };
      assert.equal(name, 'mysql2/promise');
      return { createPool(options) { pools.push(options); return { async getConnection() { events.push('get'); if (failAt === 'get') throw Error('mock'); return { async query(sql) { events.push(sql); if (failAt === 'begin') throw Error('mock'); }, async execute(sql, values) { events.push('select'); assert.equal(sql, query); assert.deepEqual(values, ['Orders']); if (failAt === 'select') throw Error('mock'); return [[{ id: 'dummy' }]]; }, async rollback() { events.push('rollback'); if (failAt === 'rollback') throw Error('mock'); }, release() { events.push('release'); } }; } }; } };
    },
  });
  return { api: module.exports, events, pools, query, stageEnv };
}
test('staging exposes execute only and uses read-only transaction with rollback/release', async () => {
  const f = readerFixture(); const reader = f.api.getPool(); assert.deepEqual(Object.keys(reader), ['execute']); assert.equal(f.pools.length, 0);
  await reader.execute(f.query, ['Orders']); assert.equal(f.pools[0].database, 'hd_b2c'); assert.equal(f.pools[0].user, 'dummy_reader');
  assert.deepEqual(f.events, ['get', 'START TRANSACTION READ ONLY', 'select', 'rollback', 'release']);
});
test('staging rejects writes/other tables/disabled config without making a pool', async () => {
  const f = readerFixture();
  for (const sql of ['UPDATE orders SET status=1', 'SELECT * FROM users']) await assert.rejects(f.api.getPool().execute(sql, []));
  f.stageEnv.B2C_STAGING_ENABLED = 'false'; assert.throws(() => f.api.getPool()); assert.equal(f.pools.length, 0);
});
test('read-only connection failures always release acquired connections', async () => {
  const unavailable = readerFixture('get'); await assert.rejects(unavailable.api.getPool().execute(unavailable.query, ['Orders'])); assert.deepEqual(unavailable.events, ['get']);
  for (const stage of ['begin', 'select', 'rollback']) { const f = readerFixture(stage); await assert.rejects(f.api.getPool().execute(f.query, ['Orders'])); assert.equal(f.events.at(-1), 'release'); }
});
test('npm start legacy is unchanged and explicit API-only script points to dedicated entry', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  assert.equal(pkg.scripts.start, 'node server.js'); assert.equal(pkg.scripts['start:api'], 'node api-only-server.js');
});

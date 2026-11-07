const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createStagingReader, validateQuery } = require('../src/adapters/b2c-staging');
const columns = Object.fromEntries(['source', 'source_key', 'order_date', 'status', 'sto', 'sc_in', 'inet'].map(key => [key, key]));
function fixture(rows = []) {
  const calls = [];
  const read = createStagingReader({ columns, identityKey: 'x'.repeat(32), execute: async (...args) => { calls.push(args); return [rows]; } });
  return { read, calls };
}
const row = { source: 'Orders', source_key: 'dummy-uuid-1', order_date: '2026-11-07', status: 'MENUNGGU', sto: 'DEMO', sc_in: 'SC-DEMO', inet: 'INET-DEMO', password: 'must-not-project' };
test('maps all three tabs and queries only the allowlisted staging table with SELECT', async () => {
  for (const [module, source] of Object.entries({ TIAL: 'Orders', LOGIC_PSB: 'solver', LOGIC_MO: 'MO' })) {
    const f = fixture([{ ...row, source }]); const result = await f.read({ module });
    assert.equal(f.calls[0][1][0], source);
    assert.match(f.calls[0][0], /^SELECT .* FROM `hd_b2c`.`sheet_import_test` WHERE/);
    assert.equal(result.data[0].module, module); assert.equal(result.readOnly, true);
    assert.equal(result.source, 'MYSQL_STAGING'); assert.equal(result.data[0].password, undefined);
    assert.equal(result.data[0].source_key, undefined);
  }
});
test('filters are parameterized, including literal wildcard search and pagination', async () => {
  const f = fixture(); const attack = "%' OR 1=1 --";
  await f.read({ module: 'TIAL', date: '2026-11-07', status: 'DONE', sto: 'DEMO', q: attack, page: '2', limit: '10' });
  assert.deepEqual(f.calls[0][1], ['Orders', '2026-11-07', 'DONE', 'DEMO', attack, attack, 11, 10]);
  assert.ok(!f.calls[0][0].includes(attack));
});
test('rejects bad module/date/pagination and unsafe configured identifiers before SQL', () => {
  for (const query of [{ module: ['TIAL'] }, { date: ['2026-11-07'] }, { module: 'LOGIC' }, { date: '2026-02-30' }, { page: '-1' }, { limit: '101' }, { sto: ['X'] }]) assert.throws(() => validateQuery(query));
  assert.throws(() => createStagingReader({ columns: { ...columns, inet: 'inet;DELETE' }, identityKey: 'x'.repeat(32) }));
});
test('identity is stable across edits/reorder, source-specific and does not expose source key', async () => {
  const a = await fixture([row]).read({});
  const b = await fixture([{ ...row, status: 'DONE', sc_in: 'EDITED' }]).read({});
  const c = await fixture([{ ...row, source: 'MO' }]).read({ module: 'LOGIC_MO' });
  assert.equal(a.data[0].id, b.data[0].id); assert.notEqual(a.data[0].id, c.data[0].id);
  assert.match(a.data[0].id, /^stg_[0-9a-f]{64}$/);
});
test('requires immutable source key, refuses duplicate identity and computes hasMore', async () => {
  await assert.rejects(fixture([{ ...row, source_key: '' }]).read({}));
  await assert.rejects(fixture([row, row]).read({}));
  const result = await fixture([row, { ...row, source_key: 'other' }]).read({ limit: 1 });
  assert.equal(result.data.length, 1); assert.equal(result.hasMore, true);
});
test('controller denies unscoped roles and disabled staging without loading database', async () => {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/controllers/b2c-staging.controller.js'), 'utf8'), { module, process: { env: {} }, require(name) { if (name === '../adapters/tial-staging') return {}; if (name === '../adapters/b2c-staging') return { validateQuery, createStagingReader }; throw new Error('DB must not load'); } });
  for (const [role, expected] of [['HD', 403], ['ADMIN', 403], ['SUPER_ADMIN', 503]]) {
    const res = { set() {}, status(code) { assert.equal(code, expected); return this; }, json() {} };
    await module.exports.list({ user: { role }, query: {} }, res);
  }
});

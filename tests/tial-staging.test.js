const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTialReader } = require('../src/adapters/tial-staging');
const { check } = require('../scripts/check-tial-staging-readonly');
const data = [
  { source_key: '9007199254740993', order_date: '2026-11-07', status: 'MENUNGGU', sto: 'DEMO-A', sc_in: 'SC-DEMO', inet: 'INET-ONE', chat_reference: '-1001234567890' },
  { source_key: '12', order_date: '2026-11-07', status: 'DONE', sto: 'DEMO-B', sc_in: 'SC-DEMO', inet: 'INET-TWO', chat_reference: '-1001234567890' },
  { source_key: '11', order_date: '2026-11-06', status: 'DONE', sto: 'DEMO-A', sc_in: 'OTHER', inet: 'INET-THREE', chat_reference: '' },
];
function fixture(extra = {}) {
  const calls = [];
  const read = createTialReader({ identityKey: 'dummy'.repeat(8), datasetId: 'synthetic-generation-1', stoKey: 'STO_DUMMY', ...extra, execute: async (sql, values) => {
    calls.push([sql, values]); let i = 1;
    const date = sql.includes(' + 25200') && sql.includes("%Y-%m-%d') = ?") ? values[i++] : '';
    const status = sql.includes('$\."STATUS"\')) = ?') ? values[i++] : '';
    const sto = sql.includes('$\."STO_DUMMY"\')) = ?') ? values[i++] : '';
    const q = sql.includes('LOCATE') ? values[i++] : ''; if (q) i++;
    const [limit, offset] = values.slice(-2);
    return [data.filter(row => (!date || row.order_date === date) && (!status || row.status === status) && (!sto || row.sto === sto) && (!q || row.sc_in.includes(q) || row.inet.includes(q))).slice(offset, offset + limit)];
  } });
  return { read, calls };
}
test('confirmed TIAL SQL uses JSON keys and schema, never row number or SELECT payload', async () => {
  const f = fixture(); const result = await f.read({}); const sql = f.calls[0][0];
  for (const name of ['sumber_tab', 'data_json', 'created_at', 'SC/IN', 'NO INET/TELP', 'STATUS', 'Message ID']) assert.ok(sql.includes(name));
  assert.match(sql, /CAST\(`id` AS CHAR\)/); assert.ok(!sql.includes('nomor_baris')); assert.ok(!sql.includes(' AS payload'));
  assert.equal(result.identityScope, 'staging_row'); assert.equal(result.dateBasis, 'import_created_at_jakarta');
  assert.equal(result.data[0].telegram_chat_id, '-1001234567890'); assert.equal(result.data[0].telegram_message_id, null);
  assert.equal(result.data[0].telegram_thread_id, null); assert.equal(result.data[0].reference_verified, false);
});
test('same SC/IN preserves distinct staging IDs; row changes do not create business identity', async () => {
  const f = fixture(); const result = await f.read({});
  assert.equal(result.data[0].scIn, result.data[1].scIn); assert.notEqual(result.data[0].id, result.data[1].id);
  assert.equal(result.data[0].id, (await f.read({})).data[0].id);
  const other = await fixture({ datasetId: 'synthetic-generation-2' }).read({});
  assert.notEqual(result.data[0].id, other.data[0].id);
});
test('synthetic import date, source status, configured STO and SC/INET search filter with bound values', async () => {
  const f = fixture();
  const result = await f.read({ date: '2026-11-07', status: 'DONE', sto: 'DEMO-B', q: 'INET-TWO' });
  assert.deepEqual(f.calls[0][1], ['Orders', '2026-11-07', 'DONE', 'DEMO-B', 'INET-TWO', 'INET-TWO', 26, 0]);
  assert.equal(result.data.length, 1); assert.equal(result.data[0].inet, 'INET-TWO');
  assert.equal((await f.read({ date: '2026-11-05' })).data.length, 0);
  assert.equal((await f.read({ q: 'SC-DEMO' })).data.length, 2);
});
test('pagination has deterministic tie break and lookahead, with no dedup by SC/IN', async () => {
  const f = fixture(); const a = await f.read({ limit: 1 }), b = await f.read({ page: 2, limit: 1 }), c = await f.read({ page: 3, limit: 1 });
  assert.equal(a.hasMore, true); assert.equal(b.hasMore, true); assert.equal(c.hasMore, false);
  assert.notEqual(a.data[0].id, b.data[0].id); assert.match(f.calls[0][0], /ORDER BY `created_at` DESC, `id` DESC LIMIT \? OFFSET \?/);
});
test('unconfirmed STO is null and requested filtering fails before executing; bad dates rejected', async () => {
  const f = fixture({ stoKey: undefined }); await f.read({}); assert.ok(f.calls[0][0].includes('NULL AS sto'));
  await assert.rejects(f.read({ sto: 'DEMO' }), /belum dikonfirmasi/); assert.equal(f.calls.length, 1);
  await assert.rejects(f.read({ date: '2026-02-30' }));
});
const env = { B2C_STAGING_DB_HOST: 'dummy', B2C_STAGING_DB_PORT: '3306', B2C_STAGING_DB_USER: 'dummy', B2C_STAGING_DB_PASSWORD: 'dummy', B2C_STAGING_IDENTITY_KEY: 'dummy'.repeat(8), B2C_TIAL_DATASET_ID: 'sandbox' };
test('standalone read-only check uses read-only transaction, sanitized summary and closes connection', async () => {
  const events = [], output = [];
  await check({ env, connect: async () => ({ query: async sql => events.push(sql), execute: async sql => { assert.match(sql, /^SELECT /); return [[data[0]]]; }, rollback: async () => events.push('rollback'), end: async () => events.push('end') }), output: text => output.push(text) });
  assert.deepEqual(events, ['START TRANSACTION READ ONLY', 'rollback', 'end']);
  assert.equal(JSON.parse(output[0]).sampled, 1); assert.ok(!output[0].includes('SC-DEMO')); assert.ok(!output[0].includes('-100'));
});
test('standalone check cleans up on SQL failure without printing rows or secrets', async () => {
  const events = [];
  await assert.rejects(check({ env, connect: async () => ({ query: async () => {}, execute: async () => { throw Error('mock'); }, rollback: async () => events.push('rollback'), end: async () => events.push('end') }), output: () => assert.fail('must not print') }));
  assert.deepEqual(events, ['rollback', 'end']);
});

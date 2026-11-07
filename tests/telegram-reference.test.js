const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTelegramReference: normalize } = require('../src/adapters/telegram-reference');
const { createStagingReader } = require('../src/adapters/b2c-staging');
const groups = { TIAL: { source_bot: 'dummy_tial', separator: ':' }, LOGIC_PSB: { source_bot: 'dummy_psb', chat_id: '-1001234567890' }, LOGIC_MO: { source_bot: 'dummy_mo', chat_id: '-1009876543210' } };
test('confirmed TIAL chat-only contract rejects composite IDs even with separator config', () => {
  const result = normalize('TIAL', { 'Message ID': '-1001234567890:42' }, groups);
  assert.equal(result.telegram_chat_id, null); assert.equal(result.telegram_message_id, null);
  assert.equal(result.reference_verified, false); assert.equal(result.telegram_thread_id, null);
  assert.equal(normalize('TIAL', { 'Message ID': '-1001234567890:42' }).telegram_message_id, null);
});
test('TIAL chat-only reference never invents a message ID', () => {
  const result = normalize('TIAL', { 'Message ID': '-1001234567890' }, groups);
  assert.equal(result.telegram_chat_id, '-1001234567890'); assert.equal(result.telegram_message_id, null);
  assert.ok(result.reference_issues.includes('message_id_missing'));
});
test('empty and malformed TIAL composite references fail closed', () => {
  for (const raw of ['', null, undefined, '-1001234567890:0', '-1001234567890:42:99', ' -1001234567890:42', '-1001234567890:42.5', '1e8:42', '-1001234567890:2147483648']) {
    const result = normalize('TIAL', { 'Message ID': raw }, groups);
    assert.equal(result.telegram_message_id, null); assert.equal(result.reference_verified, false);
  }
});
test('PSB and MO read their exact JSON keys and one configured group each', () => {
  const psb = normalize('LOGIC_PSB', { 'Message ID': 42 }, groups);
  const mo = normalize('LOGIC_MO', { MSG_ID: '42' }, groups);
  assert.equal(psb.telegram_chat_id, groups.LOGIC_PSB.chat_id);
  assert.equal(mo.telegram_chat_id, groups.LOGIC_MO.chat_id);
  assert.notEqual(psb.source_bot, mo.source_bot);
  assert.equal(psb.telegram_message_id, '42'); assert.equal(mo.telegram_message_id, '42');
  assert.equal(normalize('LOGIC_MO', { 'Message ID': '42' }, groups).telegram_message_id, null);
});
test('missing MO references and invalid numeric IDs never resolve to zero/General', () => {
  for (const raw of ['', null, undefined, 0, -1, 1.5, '1e3', '001', ' 42', '42 ', '2147483648', {}, true]) {
    const result = normalize('LOGIC_MO', { MSG_ID: raw }, groups);
    assert.equal(result.telegram_message_id, null); assert.equal(result.telegram_thread_id, null);
    assert.equal(result.reference_verified, false);
  }
});
test('missing or array group config is never guessed from another module', () => {
  assert.equal(normalize('LOGIC_PSB', { 'Message ID': '42' }).telegram_chat_id, null);
  const result = normalize('LOGIC_PSB', { 'Message ID': '42' }, { LOGIC_PSB: { chat_id: ['-1001234567890'] } });
  assert.equal(result.telegram_chat_id, null);
});
test('historical messages remain unverified even with config or forged payload verification', () => {
  const result = normalize('LOGIC_MO', { MSG_ID: '42', message_thread_id: 0, reference_verified: true }, { LOGIC_MO: { ...groups.LOGIC_MO, reference_verified: true, thread_id: 0 } });
  assert.equal(result.reference_verified, false); assert.equal(result.telegram_thread_id, null);
  assert.ok(result.reference_issues.includes('historical_reference_unverified'));
});
function reader(rows, fieldsOverride) {
  let sql;
  const fields = Object.fromEntries(['order_date', 'status', 'sto', 'sc_in', 'inet'].map(key => [key, key]));
  return { read: createStagingReader({ columns: { source: 'tab_name', source_key: 'stable_uuid', payload: 'data_json' }, jsonFields: { TIAL: { ...fields, ...fieldsOverride } }, telegramGroups: groups, identityKey: 'dummy'.repeat(8), execute: async (statement) => { sql = statement; return [rows]; } }), sql: () => sql };
}
const row = { source: 'Orders', source_key: 'uuid-a', order_date: '2026-11-07', payload: JSON.stringify({ 'Message ID': '-1001234567890', customer: 'not-for-dto' }) };
test('JSON reader extracts allowlisted fields and projects normalized references only', async () => {
  const f = reader([row]); const result = await f.read({ date: '2026-11-07' });
  assert.match(f.sql(), /JSON_UNQUOTE\(JSON_EXTRACT\(`data_json`/);
  assert.equal(result.data[0].telegram_chat_id, '-1001234567890'); assert.equal(result.data[0].telegram_message_id, null); assert.equal(result.data[0].payload, undefined);
  assert.equal(result.data[0].customer, undefined); assert.equal(result.data[0].reference_verified, false);
});
test('separate submissions sharing Telegram reference keep separate order identity', async () => {
  const result = await reader([row, { ...row, source_key: 'uuid-b' }]).read({});
  assert.notEqual(result.data[0].id, result.data[1].id);
  assert.equal(result.data[0].telegram_message_id, result.data[1].telegram_message_id);
  await assert.rejects(reader([row, row]).read({}), /tidak unik/);
});
test('rejects malformed payload and untrusted JSON key config', async () => {
  await assert.rejects(reader([{ ...row, payload: '{bad' }]).read({}), /JSON/);
  await assert.rejects(reader([{ ...row, payload: '[]' }]).read({}), /JSON/);
  await assert.rejects(reader([row], { status: "x') OR 1=1 --" }).read({}), /Pemetaan/);
});

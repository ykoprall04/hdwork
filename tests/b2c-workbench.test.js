const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { transition } = require('../src/operations/policy');
const { act } = require('../src/operations/mutate');
const { fixture } = require('./helpers/operations-fixture.cjs');
const { reader } = require('../src/operations/read');
const user = { id: 7, name: 'HD Synthetic', role: 'HD', is_active: 1, modules: ['TIAL'] };
const active = { command: 'order', status: 'IN_PROGRESS', owner_user_id: 7, final_user_id: null, duplicate_decision: null, completion_note: null };

test('completion requires explicit confirmation as well as owner and reason guards', () => {
  for (const action of ['DONE', 'FAILED']) {
    for (const confirm of [undefined, false, 'true', 1]) assert.throws(() => transition(active, user, { action, confirm, note: 'Synthetic reason' }), { statusCode: 400 });
    assert.equal(transition(active, user, { action, confirm: true, note: 'Synthetic reason' }).next.status, action);
    assert.throws(() => transition(active, { ...user, id: 8 }, { action, confirm: true, note: 'Synthetic reason' }), { statusCode: 409 });
  }
  assert.throws(() => transition(active, user, { action: 'FAILED', confirm: true, note: '  ' }), { statusCode: 400 });
});
test('escalation requires a reason and keeps status, owner, final fields and timing flags', () => {
  for (const note of [undefined, '', '   ', 12, 'x\x00', 'x'.repeat(2001)]) assert.throws(() => transition(active, user, { action: 'ESCALATE', note }));
  const change = transition(active, user, { action: 'ESCALATE', note: '  Perlu pemeriksaan lanjutan  ' });
  assert.deepEqual(change.next, { resetStart: false, finish: false, clearFinish: false, owner_user_id: 7, final_user_id: null, duplicate_decision: null, completion_note: null, status: 'IN_PROGRESS' });
});
test('escalation policy rejects terminal orders, nonowners, viewers and unrelated grants', () => {
  for (const status of ['WAITING', 'DONE', 'FAILED', 'DUPLICATE']) assert.throws(() => transition({ ...active, status }, user, { action: 'ESCALATE', note: 'Reason' }), { statusCode: 409 });
  assert.throws(() => transition(active, { ...user, id: 8 }, { action: 'ESCALATE', note: 'Reason' }), { statusCode: 409 });
  for (const role of ['ADMIN', 'SUPER_ADMIN', 'SHOW_ONLY']) assert.throws(() => transition(active, { ...user, role }, { action: 'ESCALATE', note: 'Reason' }), { statusCode: 403 });
  assert.throws(() => transition(active, { ...user, modules: ['REQ'] }, { action: 'ESCALATE', note: 'Reason' }), { statusCode: 403 });
});
test('escalation commits exactly one audit and routed Courier reply across duplicate HTTP submissions', async () => {
  const { pool, id } = fixture();
  Object.assign(pool.state.order, { status: 'IN_PROGRESS', owner_user_id: 7, started_at: '2026-11-11T01:00:00Z', finished_at: null });
  const body = { requestId: randomUUID(), version: 0, action: 'ESCALATE', note: 'Synthetic escalation' };
  const [first, second] = await Promise.all([act(pool, 'session', 7, id, body), act(pool, 'session', 7, id, body)]);
  assert.deepEqual(first, second);
  assert.equal(pool.state.order.status, 'IN_PROGRESS');
  assert.equal(pool.state.order.started_at, '2026-11-11T01:00:00Z');
  assert.equal(pool.state.order.finished_at, null);
  assert.equal(pool.state.order.owner_user_id, 7);
  assert.equal(pool.state.order.version, 1);
  assert.equal(pool.state.audit.length, 1);
  assert.equal(pool.state.audit[0][2], 'ESCALATE');
  assert.equal(JSON.parse(pool.state.audit[0][6]).note, body.note);
  assert.equal(pool.state.outbox.length, 1);
  const payload = JSON.parse(pool.state.outbox[0].payload);
  assert.equal(payload.chat_id, '-1007002');
  assert.equal(payload.telegram_thread_id, '11');
  assert.equal(payload.reply_to_message_id, '102');
  assert.equal(payload.thread_mode, 'thread');
  assert.match(payload.text, /Synthetic escalation/);
  await assert.rejects(act(pool, 'session', 7, id, { ...body, note: 'Changed payload' }), { statusCode: 409 });
  assert.equal(pool.state.outbox.length, 1);
});
test('concurrent PICK has one owner, one reply and one accepted request', async () => {
  const { pool, id } = fixture();
  const results = await Promise.allSettled([1, 2].map(userId => act(pool, 'session', userId, id, { requestId: randomUUID(), version: 0, action: 'PICK' })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.statusCode, 409);
  assert.equal(pool.state.order.owner_user_id, 1);
  assert.equal(pool.state.outbox.length, 1);
  assert.equal(pool.state.audit.filter(row => row[2] === 'PICK').length, 1);
  assert.equal(pool.state.audit.filter(row => row[2] === 'ACTION_REJECTED').length, 1);
});
test('original Telegram message is returned unchanged only after a scoped order read', async () => {
  const { pool, id } = fixture();
  pool.state.order.raw_text = '/order\nSC/IN: SYNTHETIC\nCatatan asli\nBaris kedua';
  const result = await reader(pool).detail(id, { id: 7, modules: ['B2B'] });
  assert.equal(result.originalMessage, pool.state.order.raw_text);
  assert.deepEqual(result.capabilities, { escalate: true, completionConfirmation: true });
  let reads = 0;
  const c = { async query() {}, async beginTransaction() {}, async commit() {}, async rollback() {}, release() {}, async execute(sql, params) {
    reads++; assert.ok(sql.includes('access_module IN (?)')); assert.equal(params.at(-1), 'REQ'); return [[]];
  } };
  await assert.rejects(reader({ async getConnection() { return c; } }).detail(id, { id: 8, modules: ['REQ'] }), { statusCode: 404 });
  assert.equal(reads, 1);
});

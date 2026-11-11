const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { fixture } = require('./helpers/operations-fixture.cjs');
const { act } = require('../src/operations/mutate');
const { routes } = require('../src/operations/b2c-readiness');

for (const [command, module] of [['config_psb', 'LOGIC_PSB'], ['mo', 'LOGIC_MO']]) {
  for (const action of ['DONE', 'FAILED', 'ESCALATE']) {
    test(`SOLVER ${command} ${action}: original reply/topic, atomic status/audit and idempotent retry`, async () => {
      const { pool, id } = fixture({ command, module });
      Object.assign(pool.state.order, { status: 'IN_PROGRESS', owner_user_id: 7 });
      const note = action === 'DONE' ? '' : 'Synthetic required reason';
      const body = { requestId: randomUUID(), version: 0, action, note, ...(action !== 'ESCALATE' ? { confirm: true } : {}) };
      const first = await act(pool, 'fixture-session', 7, id, body);
      const retry = await act(pool, 'fixture-session', 7, id, body);
      assert.deepEqual(first, retry);
      assert.equal(pool.state.order.status, action === 'ESCALATE' ? 'IN_PROGRESS' : action);
      assert.equal(pool.state.order.version, 1);
      assert.equal(pool.state.audit.length, 1);
      assert.equal(pool.state.audit[0][2], action);
      assert.equal(JSON.parse(pool.state.audit[0][6]).note, note || null);
      assert.equal(pool.state.outbox.length, 1);
      const reply = JSON.parse(pool.state.outbox[0].payload);
      assert.equal(reply.chat_id, '-1007002');
      assert.equal(reply.reply_to_message_id, '102');
      assert.equal(reply.telegram_thread_id, '11');
      assert.equal(reply.thread_mode, 'thread');
      if (action === 'DONE') assert.equal(reply.text, '✅ Done');
      else assert.ok(reply.text.includes(note));
    });
  }
  for (const action of ['FAILED', 'ESCALATE']) test(`SOLVER ${command} rejects blank ${action} without status/outbox/audit changes`, async () => {
    const { pool, id } = fixture({ command, module });
    Object.assign(pool.state.order, { status: 'IN_PROGRESS', owner_user_id: 7 });
    await assert.rejects(act(pool, 'fixture-session', 7, id, { requestId: randomUUID(), version: 0, action, note: '   ', confirm: true }), { statusCode: 400 });
    assert.equal(pool.state.order.status, 'IN_PROGRESS');
    assert.equal(pool.state.order.version, 0);
    assert.equal(pool.state.outbox.length, 0);
    assert.equal(pool.state.audit.length, 0);
  });
}
test('existing SOLVER1 mapping covers both commands without pretending live delivery is verified', () => {
  const result = routes([{ chatId: '-1007002', threadId: '11', threadMode: 'thread', profile: 'SOLVER1', commands: ['config_psb', 'mo'] }]);
  const logic = result.categories.find(c => c.category === 'LOGIC');
  assert.equal(logic.configured, true);
  assert.deepEqual(logic.missingCommands, []);
  assert.equal(result.liveVerified, false);
  assert.equal(result.categories.find(c => c.category === 'TIAL').configured, false);
});

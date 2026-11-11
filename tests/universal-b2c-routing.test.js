const test = require('node:test');
const assert = require('node:assert/strict');
const { createSystem } = require('../src/system/store');
const { databasePolicy } = require('../src/system/routing');
const { commands, universalB2CGroups } = require('../src/courier/shared-group');
const { createB2CProcessor } = require('../src/b2c-workflow/workflow');
const { MysqlStore } = require('../src/courier/mysql-store');
const { mockPool } = require('./helpers/courier-db');
const readiness = require('../src/operations/b2c-readiness');
const botId = 'synthetic-universal';
const originalCommands = { TIAL1: ['order', 'req'], TIAL2: ['order', 'req'], SOLVER1: ['config_psb', 'mo'], ALL: commands };
function mappingPool(rows) {
  return { async execute(sql, params) {
    assert.match(sql, /enabled=TRUE AND verified=TRUE/);
    const matches = rows.filter(r => r.bot_id === params[0] && r.enabled && r.verified);
    if (sql.includes('blocked_before')) return [matches.filter(r => r.chat_id === params[1] && r.thread_id === params[2] && (!r.blocked_before || r.blocked_before < params[3]))];
    return [matches];
  } };
}
function row(profile, threadId = null) { return { bot_id: botId, id: profile, category: profile === 'ALL' ? 'ALL' : profile === 'SOLVER1' ? 'LOGIC' : 'TIAL', profile, chat_id: '-1001', thread_id: threadId, enabled: true, verified: true }; }
function text(command, ref = 'X-AO1') { return { order: `/order\nSC/IN:${ref}\nNO INET:000123\nSN ONT:SN1\nSTO:ABC\nKETERANGAN:test\nNIK:SYNTHETIC`, req: '/req Synthetic request', config_psb: `/config_psb\nORDER ID:${ref}\nSTO:ABC`, mo: `/MO\nSC/IN:${ref}\nSTO:ABC` }[command]; }
function envelope(command, index, target) { return { version: 1, bot_id: botId, update_id: String(index), event: { kind: 'message', chat_id: target.chat_id, telegram_thread_id: target.thread_id, message_id: String(index + 10), reply_to_message_id: null, sender_id: '9', timestamp: 1700000000, text: text(command), attachments: [] } }; }

for (const profile of Object.keys(originalCommands)) for (const threadId of [null, '12']) {
  test(`${profile}/${threadId || 'non_topic'}: all four B2C commands, correct dashboard modules, replay and original reply isolation`, async () => {
    const target = row(profile, threadId), before = structuredClone(target), readPool = mappingPool([target]);
    const system = createSystem({ readPool, writePool: null, sharedGroups: true });
    const policy = databasePolicy({ system, botId, botUsername: 'SyntheticUniversalBot' });
    const pool = mockPool(), store = new MysqlStore({ pool, botId, orderedInbox: true });
    const config = await policy.workflow({ enabled: true, webOnly: true, botId, botUsername: 'SyntheticUniversalBot', identityKey: 'synthetic-universal-identity-key-000000', dedupeBy: 'sc_in', actors: [] });
    const processor = createB2CProcessor({ store, config });
    for (const [i, command] of ['order', 'req', 'config_psb', 'mo'].entries()) {
      const body = envelope(command, i + 1, target);
      await store.accept(await policy.ingress(body));
      assert.equal(await processor.processNext(), true);
      await store.accept(await policy.ingress(body));
      assert.equal(await processor.processNext(), false);
    }
    if (profile !== 'ALL') for (const command of ['assuren', 'b2b', 'replacement']) {
      const body = envelope('req', 99, target);
      body.event.text = `/${command}\nSC/IN:X-100\nNO INET/TELP:00012345\nSTO:ABC\nTRANSAKSI:PERBAIKAN\nKETERANGAN:fixture`;
      await assert.rejects(policy.ingress(body), { statusCode: 400 });
    }
    const orders = [...pool.state.orders.values()];
    assert.equal(orders.length, 4);
    assert.deepEqual(orders.map(o => o.module), ['TIAL', 'TIAL', 'LOGIC_PSB', 'LOGIC_MO']);
    assert.deepEqual(orders.map(o => require('../src/operations/policy').moduleOf(o)), ['TIAL', 'REQ', 'LOGIC_PSB', 'LOGIC_MO']);
    assert.equal(pool.state.audit.length, 4);
    const connection = { async execute(sql, params) {
      if (sql.includes('hd2_system_mappings')) return readPool.execute(sql, params);
      assert.deepEqual(params.slice(0, 2), [botId, target.chat_id]);
      return [orders.filter(o => o.bot_id === params[0] && o.chat_id === params[1] && o.message_id === params[2])];
    } };
    for (const order of orders) {
      assert.equal(order.chat_id, target.chat_id); assert.equal(order.thread_id, threadId);
      const reply = { method: 'sendMessage', chat_id: order.chat_id, telegram_thread_id: threadId, thread_mode: threadId === null ? 'non_topic' : 'thread', reply_to_message_id: order.message_id, text: 'Synthetic reply' };
      assert.equal(await policy.outgoing(reply, connection), true);
      assert.equal(await policy.outgoing({ ...reply, reply_to_message_id: '999' }, connection), false);
      assert.equal(await policy.outgoing({ ...reply, chat_id: '-999' }, connection), false);
      assert.equal(await policy.outgoing({ ...reply, telegram_thread_id: threadId === null ? '13' : null }, connection), false);
    }
    assert.deepEqual(target, before); // No migration/update of stored mapping or history.
    const groups = await system.routing(botId);
    assert.equal(readiness.routes(groups).configured, true);
  });
}
test('shared projection preserves ASSUREN/B2B/REPLACEMENT and ALL command lists; legacy mode remains pinned', async () => {
  for (const invalid of [null, {}, '', false]) assert.throws(() => universalB2CGroups(invalid));
  assert.deepEqual(universalB2CGroups([]), []);
  const workspaces = ['ASSUREN', 'B2B', 'REPLACEMENT'].map((profile, i) => ({ chatId: String(-2000 - i), threadId: null, threadMode: 'non_topic', profile, commands: [profile.toLowerCase()] }));
  assert.deepEqual(universalB2CGroups(workspaces), workspaces);
  const all = { chatId: '-3000', threadId: null, threadMode: 'non_topic', profile: 'ALL', commands: ['req'] };
  assert.deepEqual(universalB2CGroups([all]), [all]); // Explicit existing ALL restrictions are not broadened to other workspaces.
  const legacy = createSystem({ readPool: mappingPool([row('SOLVER1')]), writePool: null, sharedGroups: false });
  const groups = await legacy.routing(botId);
  assert.equal(groups[0].profile, 'SOLVER1'); assert.deepEqual(groups[0].commands, ['config_psb', 'mo']);
  const policy = databasePolicy({ system: legacy, botId, botUsername: 'SyntheticUniversalBot', expectedGroups: groups });
  await assert.rejects(policy.ingress(envelope('order', 1, row('SOLVER1'))), { statusCode: 400 });
});
test('unverified/disabled/foreign bot/chat/topic and pre-cutoff events remain rejected; routing drift still fails closed', async () => {
  const targets = [row('TIAL1'), { ...row('SOLVER1'), chat_id: '-1002', enabled: false }, { ...row('ALL'), chat_id: '-1003', verified: false }];
  const system = createSystem({ readPool: mappingPool(targets), writePool: null, sharedGroups: true });
  const policy = databasePolicy({ system, botId, botUsername: 'SyntheticUniversalBot' });
  for (const target of [targets[1], targets[2], { ...targets[0], chat_id: '-999' }, { ...targets[0], thread_id: '99' }]) await assert.rejects(policy.ingress(envelope('req', 1, target)), { statusCode: 403 });
  await assert.rejects(policy.ingress({ ...envelope('req', 1, targets[0]), bot_id: 'foreign-bot' }));
  targets[0].blocked_before = 1700000000;
  await assert.rejects(policy.ingress(envelope('req', 1, targets[0])), { statusCode: 403 });
  const pinned = databasePolicy({ system, botId, botUsername: 'SyntheticUniversalBot', expectedGroups: [] });
  await assert.rejects(pinned.configuration(), /Production routing drift/);
});
test('readiness uses effective shared routing without rewriting the legacy mapping', async () => {
  const stored = row('TIAL1'), before = structuredClone(stored);
  const pool = { async execute(sql) {
    if (sql.includes('hd2_system_mappings')) return [[stored]];
    assert.match(sql, /SELECT bot_id,expires_ms FROM hd2_courier_workers/);
    return [[{ bot_id: botId, expires_ms: 2000 }]];
  } };
  const legacy = await readiness.snapshot({ pool, writerAvailable: true, now: () => 1000, sharedGroups: false });
  assert.equal(legacy.categories.find(c => c.category === 'LOGIC').configured, false);
  const universal = await readiness.snapshot({ pool, writerAvailable: true, now: () => 1000, sharedGroups: true });
  assert.equal(universal.configured, true); assert.equal(universal.readyForControlledTest, true);
  assert.equal(universal.telegramDeliveryVerified, false);
  assert.deepEqual(stored, before);
});
test('universal SOLVER reception keeps full-history TIAL deduplication across groups', async () => {
  const targets = [row('TIAL1'), { ...row('SOLVER1'), chat_id: '-1002' }];
  const system = createSystem({ readPool: mappingPool(targets), writePool: null, sharedGroups: true });
  const policy = databasePolicy({ system, botId, botUsername: 'SyntheticUniversalBot' });
  const pool = mockPool(), store = new MysqlStore({ pool, botId, orderedInbox: true });
  const config = await policy.workflow({ enabled: true, webOnly: true, botId, botUsername: 'SyntheticUniversalBot', identityKey: 'synthetic-universal-identity-key-000000', dedupeBy: 'sc_in', actors: [] });
  const processor = createB2CProcessor({ store, config });
  for (const [i, target] of targets.entries()) {
    await store.accept(await policy.ingress(envelope('order', i + 1, target)));
    assert.equal(await processor.processNext(), true);
  }
  const [original, duplicate] = [...pool.state.orders.values()];
  assert.equal(original.status, 'WAITING'); assert.equal(original.duplicate_of, null);
  assert.equal(duplicate.status, 'DUPLICATE'); assert.equal(duplicate.duplicate_of, original.id);
  assert.equal(duplicate.chat_id, '-1002'); assert.equal(duplicate.message_id, '12');
  assert.equal(pool.state.audit.length, 2);
});

const test = require('node:test'), assert = require('node:assert/strict');
const { create } = require('../src/operations/create');
const { filters, where, transition } = require('../src/operations/policy');
const { isWebOrder, modules } = require('../src/operations/modules');
const { checkDatabase } = require('../src/config/local-database-check');
const requestId = 'b9497048-7443-4384-946b-a564e763d410';

test('manual order creation is retired across all workspace modules', async () => {
 for(const module of modules)await assert.rejects(create(null,null,null,{requestId,module,reference:'REF',description:'Work'}),{statusCode:403});
});

test('workspace filters and live scopes preserve module authorization and only include explicit web origins', () => {
  for (const module of ['ASSUREN', 'B2B', 'REPLACEMENT']) {
    const user = { id: 1, modules: [module] }, f = filters({ area: module }, user);
    assert.deepEqual(f.allowed, [module]); assert.match(where(f, user).sql, /o.bot_id='web-local'/);
    assert.deepEqual(filters({ area: 'B2C' }, user).allowed, []);
    assert.deepEqual(filters({ area: module }, { ...user, modules: ['TIAL'] }).allowed, []);
    const order = { bot_id: 'web-local', chat_id: 'web', command: null, module, status: 'WAITING' };
    assert.equal(isWebOrder(order), true);
    assert.equal(isWebOrder({ ...order, bot_id: 'other' }), false);
    assert.equal(transition(order, { ...user, name: 'HD', role: 'HD', is_active: 1 }, { action: 'PICK' }).next.status, 'IN_PROGRESS');
  }
});
test('database check rejects an unexpected database and incomplete metadata without writes', async () => {
  await assert.rejects(checkDatabase({ query: async () => [[{ name: 'hd_b2c' }]] }));
  const calls = [];
  await assert.rejects(checkDatabase({ query: async sql => { calls.push(sql); return sql.includes('DATABASE() AS') ? [[{ name: 'hdwork2' }]] : [[]]; } }));
  assert.equal(calls.length, 2); for (const sql of calls) assert.match(sql, /^SELECT /);
});

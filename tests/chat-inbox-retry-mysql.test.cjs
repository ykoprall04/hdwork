const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const {start} = require('./helpers/temporary-courier-mysql.cjs');
const {MysqlStore} = require('../src/courier/mysql-store');
const {createB2CProcessor} = require('../src/b2c-workflow/workflow');

test('ordered inbox resumes existing retries and preserves late ACK and valid chat replies', async () => {
  const f = await start(os.tmpdir());
  try {
    await f.c.query('CREATE DATABASE hdwork2');
    await f.c.query('USE hdwork2');
    const {migrationStatements} = require('../ops/mysql/disposable-guard');
    const {schemaStatements} = require('./helpers/e2e-contracts.cjs');
    for (const sql of [...migrationStatements(), ...schemaStatements(), ...schemaStatements(['013_hdwork2_live_chat.sql'])]) {
      await f.c.query(sql);
    }
    const botId = 'synthetic-chat';
    const chatId = '-100123';
    const group = {chatId, threadId:'7', threadMode:'thread', module:'LOGIC_MO', commandProfile:'ALL', allowedCommands:['mo']};
    let now = Date.now();
    const store = new MysqlStore({pool:f.pool, botId, orderedInbox:true, now:()=>now, env:{}});
    const processor = createB2CProcessor({store, config:{
      botId, botUsername:'SyntheticChatBot', identityKey:'synthetic-chat-key-for-mysql-test',
      enabled:true, chatEnabled:true, webOnly:true, dedupeBy:'sc_in', groups:[group], actors:[]
    }});
    const submit = async (id, text, parent = null) => (await store.accept({
      version:1, bot_id:botId, update_id:id, event:{
        kind:'message', chat_id:chatId, message_id:id, telegram_thread_id:'7', sender_id:'9',
        reply_to_message_id:parent, timestamp:Math.floor(Date.now()/1000), text, attachments:[]
      }
    })).receipt_id;
    const state = async id => (await f.pool.execute(
      'SELECT state,attempts,last_error_code FROM hd2_courier_inbox WHERE id=?', [id]
    ))[0][0];
    const chatCount = async id => (await f.pool.execute(
      'SELECT COUNT(*) AS n FROM hd2_chat_messages WHERE telegram_message_id=? AND reply_to_id IS NOT NULL', [id]
    ))[0][0].n;

    const orphan = await submit('100', 'Synthetic unmatched reply', '99');
    const mo = await submit('101', '/MO\nSC/IN:TEST-AOi3\nTIPE TRANSAKSI:MO\nKETERANGAN:test\nNIK:TEST\nSTO:ABC');
    // Schedule a retry using the old handler outcome, without editing the inbox row.
    await assert.rejects(store.processNext(()=>{throw Error('Legacy unmatched anchor');}), {statusCode:503});
    assert.equal(await processor.processNext(),false);
    assert.deepEqual(await state(orphan),{state:'PENDING', attempts:1, last_error_code:'HANDLER_FAILED'});
    assert.equal((await state(mo)).attempts,0);
    now += 2000;
    assert.equal(await processor.processNext(),true);
    assert.equal((await state(orphan)).state,'IGNORED');
    assert.equal((await state(mo)).state,'PENDING');
    const [[audit]] = await f.pool.execute('SELECT action FROM hd2_audit WHERE inbox_id=?',[orphan]);
    assert.equal(audit.action,'UNKNOWN_REPLY_ANCHOR');
    assert.equal(await chatCount('100'),0);
    assert.equal(await processor.processNext(),true);
    assert.equal((await state(mo)).state,'PROCESSED');
    const [[order]] = await f.pool.execute("SELECT command FROM hd2_orders WHERE message_id='101'");
    assert.equal(order.command,'mo');
    const [delivery] = await store.claim();
    assert.equal(delivery.payload.reply_to_message_id,'101');

    const beforeAck = await submit('104','Synthetic reply before ACK','103');
    await assert.rejects(processor.processNext(),{statusCode:503});
    assert.equal((await state(beforeAck)).state,'PENDING');
    await store.settle(delivery.delivery_id,{lease_token:delivery.lease_token,result:'sent',telegram_message_id:'103'});
    now += 2000;
    assert.equal(await processor.processNext(),true);
    assert.equal(await chatCount('104'),1);

    const validReply = await submit('105','Synthetic reply to original order','101');
    store.pool = {async getConnection(){
      const c = await f.pool.getConnection();
      return {
        execute(sql,...params){
          if(sql.startsWith('SELECT * FROM hd2_orders WHERE bot_id='))return c.query('SELECT * FROM missing_fixture_table');
          return c.execute(sql,...params);
        },
        beginTransaction:()=>c.beginTransaction(), commit:()=>c.commit(),
        rollback:()=>c.rollback(), release:()=>c.release()
      };
    }};
    try {
      await assert.rejects(processor.processNext(),{statusCode:503});
    } finally {
      store.pool = f.pool;
    }
    assert.deepEqual(await state(validReply),{state:'PENDING', attempts:1, last_error_code:'HANDLER_FAILED'});
    assert.equal(await chatCount('105'),0);
    now += 2000;
    assert.equal(await processor.processNext(),true);
    assert.equal((await state(validReply)).state,'PROCESSED');
    assert.equal(await chatCount('105'),1);
  } finally {
    await f.stop();
  }
});

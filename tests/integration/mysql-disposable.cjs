// NOT a default test suite. No driver import/network unless explicitly opted in.
const assert = require('node:assert/strict');
const { config, verifyTarget, migrationStatements } = require('../../ops/mysql/disposable-guard');
async function exercise(pool) {
  const { MysqlStore } = require('../../src/courier/mysql-store');
  const { createB2CProcessor } = require('../../src/b2c-workflow/workflow');
  const { createOrderReader } = require('../../src/b2c-read/orders');
  let now=1000;
  const botId='disposable',store=new MysqlStore({pool,botId,now:()=>now,maxAttempts:2});
  const event=(update,message,text,reply=null)=>({version:1,bot_id:botId,update_id:String(update),event:{kind:'message',chat_id:'-100123',message_id:String(message),telegram_thread_id:null,sender_id:'9',reply_to_message_id:reply,timestamp:1700000000,text,attachments:[]}});
  const workflow=createB2CProcessor({store,config:{enabled:true,botId,identityKey:'synthetic-disposable-identity-key-only',dedupeBy:'both',groups:[{module:'TIAL',chatId:'-100123',threadId:null,threadMode:'non_topic'}],actors:[{id:'9',name:'Synthetic HD'}]}});
  await assert.rejects(pool.execute("INSERT INTO hd2_orders (id,bot_id,module,business_day,chat_id,message_id,status) VALUES ('00000000-0000-4000-8000-000000000099','disposable','TIAL','2026-01-01','-100123','99','INVALID_STATUS')"),error=>error.errno===1452);
  const data='SC/IN: SC-SYNTHETIC\nINET: 000000000001';
  const original=event(1,10,data);
  const receipt=await store.accept(original);
  assert.equal((await new MysqlStore({pool,botId}).accept(original)).receipt_id,receipt.receipt_id);
  await assert.rejects(store.accept(event(1,10,'SC/IN: DIFFERENT')),{statusCode:409});
  await store.accept(event(2,11,data));
  // Real locks / daily reservation contention; failed inbox transactions are retried.
  await Promise.allSettled([workflow.processNext(),workflow.processNext()]);
  now+=10000;
  for(let i=0;i<4;i++)await workflow.processNext();
  const [[counts]]=await pool.query("SELECT COUNT(*) AS total,SUM(status='DUPLICATE') AS duplicates FROM hd2_orders");
  assert.equal(Number(counts.total),2);assert.equal(Number(counts.duplicates),1);
  // Determine canonical anchor rather than relying on UUID tie ordering.
  const [[canonical]]=await pool.query("SELECT message_id FROM hd2_orders WHERE status='WAITING'");
  await store.accept(event(3,20,'PROSES CEK',canonical.message_id));await workflow.processNext();
  await store.accept(event(4,21,'DONE',canonical.message_id));await workflow.processNext();
  const view=await createOrderReader(pool).list({module:'TIAL'});
  assert.equal(view.data.filter(o=>o.status==='DONE').length,1);assert.equal(view.data.length,2);
  const done=view.data.find(o=>o.status==='DONE');assert.equal((await createOrderReader(pool).history(done.id,{})).data.length,3);
  const leases=await store.claim(10);assert.equal(leases.length,2);
  await store.settle(leases[0].delivery_id,{lease_token:leases[0].lease_token,result:'sent',telegram_message_id:'50'});
  assert.equal((await store.settle(leases[0].delivery_id,{lease_token:leases[0].lease_token,result:'sent',telegram_message_id:'50'})).duplicate,true);
  now+=60001;assert.deepEqual(await store.claim(),[]);now+=2000;const [retry]=await store.claim();assert.equal(retry.attempt,2);
  await store.settle(retry.delivery_id,{lease_token:retry.lease_token,result:'failed',error_code:'FORBIDDEN'});
  const [[dead]]=await pool.query('SELECT state FROM hd2_courier_outbox WHERE id=?',[retry.delivery_id]);assert.equal(dead.state,'DEAD');
  await store.accept(event(5,30,data));
  await assert.rejects(store.processNext(async(_e,tx)=>{await tx.enqueue('rollback',{method:'sendMessage',chat_id:'-100123',telegram_thread_id:null,thread_mode:'non_topic',reply_to_message_id:'10',text:'Synthetic rollback'});throw Error('Synthetic rollback');}),{statusCode:503});
  const [[rollback]]=await pool.query("SELECT COUNT(*) AS total FROM hd2_courier_outbox WHERE idem_key='rollback'");assert.equal(Number(rollback.total),0);
  // SKIP LOCKED and conflicting lock acquisition tested using two real sessions.
  const payload={method:'sendMessage',chat_id:'-100123',telegram_thread_id:null,thread_mode:'non_topic',reply_to_message_id:'10',text:'Synthetic lock test'};
  const lockStore=new MysqlStore({pool,botId:'locktest',now:()=>now});
  const a=await lockStore.enqueue('lock-a',payload),b=await lockStore.enqueue('lock-b',payload);
  const c1=await pool.getConnection(),c2=await pool.getConnection();
  try {
    await c1.query('SET SESSION innodb_lock_wait_timeout=2');await c2.query('SET SESSION innodb_lock_wait_timeout=2');
    await c1.beginTransaction();await c1.execute('SELECT id FROM hd2_courier_outbox WHERE id=? FOR UPDATE',[a]);
    const claimed=await lockStore.claim();assert.equal(claimed.length,1);assert.equal(claimed[0].delivery_id,b);
    await c1.rollback();await c1.beginTransaction();await c2.beginTransaction();
    await c1.execute('SELECT id FROM hd2_courier_outbox WHERE id=? FOR UPDATE',[a]);await c2.execute('SELECT id FROM hd2_courier_outbox WHERE id=? FOR UPDATE',[b]);
    const conflict=await Promise.allSettled([c1.execute('UPDATE hd2_courier_outbox SET due_ms=due_ms WHERE id=?',[b]),c2.execute('UPDATE hd2_courier_outbox SET due_ms=due_ms WHERE id=?',[a])]);
    assert.ok(conflict.some(r=>r.status==='rejected' && [1205,1213].includes(r.reason.errno)));
  } finally {await c1.rollback();await c2.rollback();c1.release();c2.release();}
}
async function run({env=process.env,argv=process.argv.slice(2),driverFactory=()=>require('mysql2/promise')}={}) {
  const options=config(env,argv);const statements=migrationStatements();
  const pool=driverFactory().createPool(options);
  try {
    const c=await pool.getConnection();
    try {await verifyTarget(c,options.database);for(const sql of statements)await c.query(sql);} finally {c.release();}
    await exercise(pool);
    return {ok:true,checks:['ddl004','ddl005','idempotency','daily-dedup','workflow-audit','web-read','lease-retry-dead-letter','rollback','skip-locked','lock-conflict']};
  } finally {await pool.end();}
}
if(require.main===module){
  if(process.argv.length===2) console.log('Disposable MySQL integration disabled; no connection attempted.');
  else run().then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('Disposable MySQL integration rejected or failed; inspect isolated test environment privately.');process.exitCode=1;});
}
module.exports={run};

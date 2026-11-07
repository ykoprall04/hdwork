const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { MysqlStore } = require('../src/courier/mysql-store');
const { mockPool } = require('./helpers/courier-db');
const envelope = (update = '1') => ({version:1,bot_id:'sandbox',update_id:update,event:{kind:'message',chat_id:'-100123',message_id:'10',telegram_thread_id:null,sender_id:'9',reply_to_message_id:null,timestamp:1700000000,text:'Synthetic order',attachments:[]}});
const payload = {method:'sendMessage',chat_id:'-100123',telegram_thread_id:null,thread_mode:'non_topic',reply_to_message_id:'10',text:'Synthetic acknowledgement'};
function setup(maxAttempts=5) { let now=1000; const pool=mockPool(); const store=new MysqlStore({pool,botId:'sandbox',now:()=>now,maxAttempts}); return {pool,store,advance:ms=>{now+=ms;}}; }
test('persistent inbox/outbox survives store recreation and rejects conflicting replay',async()=>{
 const {pool,store}=setup(); const first=await store.accept(envelope());
 const restarted=new MysqlStore({pool,botId:'sandbox'});
 assert.equal((await restarted.accept(envelope())).receipt_id,first.receipt_id);
 assert.equal((await restarted.accept(envelope())).duplicate,true);
 await assert.rejects(store.accept({...envelope(),event:{...envelope().event,text:'Changed'}}),{statusCode:409});
 const id=await store.enqueue('event:1',payload); assert.equal(await restarted.enqueue('event:1',payload),id);
 await assert.rejects(store.enqueue('event:1',{...payload,text:'Changed'}),{statusCode:409});
 assert.equal(pool.state.inbox.length,1); assert.equal(pool.state.outbox.length,1);
});
test('concurrent claim has one lease, stale acknowledgements rejected and successful ACK idempotent',async()=>{
 const {pool,store}=setup(); await store.enqueue('x',payload);
 const claims=(await Promise.all([store.claim(),store.claim()])).flat(); assert.equal(claims.length,1);
 const lease=claims[0]; await assert.rejects(store.settle(lease.delivery_id,{lease_token:'wrong',result:'sent',telegram_message_id:'20'}),{statusCode:409});
 const ack={lease_token:lease.lease_token,result:'sent',telegram_message_id:'20'};
 assert.equal((await store.settle(lease.delivery_id,ack)).duplicate,false);
 assert.equal((await store.settle(lease.delivery_id,ack)).duplicate,true);
 assert.equal(pool.state.outbox[0].state,'SENT');
});
test('expired leases recover with backoff and bounded attempts reach dead-letter',async()=>{
 const {pool,store,advance}=setup(2); await store.enqueue('x',payload); const [first]=await store.claim();
 advance(60001); assert.deepEqual(await store.claim(),[]); advance(2000);
 const [second]=await store.claim(); assert.equal(second.attempt,2);
 await assert.rejects(store.settle(first.delivery_id,{lease_token:first.lease_token,result:'sent',telegram_message_id:'20'}),{statusCode:409});
 advance(60001); assert.deepEqual(await store.claim(),[]); assert.equal(pool.state.outbox[0].state,'DEAD');
});
test('retry-after delays delivery; permanent failure enters dead-letter',async()=>{
 const {pool,store,advance}=setup(); await store.enqueue('x',payload); const [first]=await store.claim();
 await store.settle(first.delivery_id,{lease_token:first.lease_token,result:'retry',error_code:'RATE_LIMIT',retry_after:30});
 advance(29999); assert.deepEqual(await store.claim(),[]); advance(1); const [next]=await store.claim();
 await store.settle(next.delivery_id,{lease_token:next.lease_token,result:'failed',error_code:'FORBIDDEN'});
 assert.equal(pool.state.outbox[0].state,'DEAD');
});
test('handler transaction rolls back outbox with inbox and records bounded retry without payload',async()=>{
 const {pool,store,advance}=setup(2); await store.accept(envelope());
 const broken=async(e,tx)=>{await tx.enqueue('atomic',payload); throw Error('Synthetic sensitive detail');};
 await assert.rejects(store.processNext(broken),{statusCode:503});
 assert.equal(pool.state.outbox.length,0); assert.equal(pool.state.inbox[0].attempts,1);
 assert.equal(pool.state.inbox[0].last_error_code,'HANDLER_FAILED'); advance(2000);
 await assert.rejects(store.processNext(broken),{statusCode:503}); assert.equal(pool.state.inbox[0].state,'DEAD');
});
test('successful inbox processing commits outbox atomically, only once',async()=>{
 const {pool,store}=setup(); await store.accept(envelope());
 assert.equal(await store.processNext(async(e,tx)=>{await tx.enqueue('atomic',payload);}),true);
 assert.equal(await store.processNext(()=>assert.fail('already processed')),false);
 assert.equal(pool.state.inbox[0].state,'PROCESSED'); assert.equal(pool.state.outbox.length,1);
});
test('store factory fails closed before loading driver and isolates mysql configuration',()=>{
 let options; const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/courier/storage'),'utf8'),{module,require:name=>{
   if(name==='mysql2/promise') return {createPool:config=>{options=config;return {};}};
   if(name==='./mysql-store') return {MysqlStore:class {constructor(config){this.config=config;}}};
   throw Error('Unexpected dependency');
 }});
 const create=module.exports.createStore;
 assert.throws(()=>create({})); assert.equal(options,undefined);
 const env={COURIER_ENABLED:'true',COURIER_STORE:'mysql',COURIER_DB_NAME:'hdwork2',COURIER_DB_HOST:'127.0.0.1',COURIER_DB_USER:'courier_mock',COURIER_DB_PASSWORD:'synthetic-test-only',COURIER_BOT_ID:'sandbox'};
 for(const change of [{COURIER_DB_NAME:'hd_b2c'},{COURIER_DB_USER:'root'},{COURIER_DB_PORT:'70000'},{DB_USER:'courier_mock'}]) assert.throws(()=>create({...env,...change}));
 create(env); assert.equal(options.database,'hdwork2'); assert.equal(options.multipleStatements,false); assert.equal(options.connectionLimit,2);
});
test('migration is manual, namespaced and not wired to any startup',()=>{
 const sql=fs.readFileSync('database/manual/004_hdwork2_courier.sql','utf8');
 assert.match(sql,/USE hdwork2;/); assert.equal([...sql.matchAll(/CREATE TABLE (\w+)/g)].every(m=>m[1].startsWith('hd2_')),true);
 assert.doesNotMatch(sql,/\b(DROP|ALTER)\s+TABLE|GRANT\s/i);
 for(const file of ['api-only-server.js','server.js','src/courier/storage.js']) assert.equal(fs.readFileSync(file,'utf8').includes('004_hdwork2_courier.sql'),false);
});

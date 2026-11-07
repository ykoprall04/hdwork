const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseOrder, parseStatus, jakartaDay } = require('../src/b2c-workflow/parser');
const { validateConfig } = require('../src/b2c-workflow/config');
const { createB2CProcessor } = require('../src/b2c-workflow/workflow');
const { MysqlStore } = require('../src/courier/mysql-store');
const { mockPool } = require('./helpers/courier-db');
const config = () => ({enabled:true,botId:'sandbox',identityKey:'synthetic-key-for-tests-only-00000000',dedupeBy:'both',groups:[{module:'TIAL',chatId:'-100123',threadId:null,threadMode:'non_topic'}],actors:[{id:'9',name:'HD Demo'}]});
function setup(change={}) {
 let now=1000, update=0; const pool=mockPool(); const store=new MysqlStore({pool,botId:'sandbox',now:()=>now});
 const workflow=createB2CProcessor({store,config:{...config(),...change}});
 const event=(message,text,changes={})=>({version:1,bot_id:'sandbox',update_id:String(++update),event:{kind:'message',chat_id:'-100123',message_id:String(message),telegram_thread_id:null,sender_id:'9',reply_to_message_id:null,timestamp:1700000000,text,attachments:[],...changes}});
 const run=async body=>{await store.accept(body);return workflow.processNext();};
 return {pool,store,workflow,event,run,advance:ms=>{now+=ms;}};
}
const order='SC/IN: SC-SYNTHETIC\nNO INET/TELP: 000000000001';
test('narrow parser normalizes labelled references without guessing arbitrary numbers',()=>{
 assert.deepEqual(parseOrder('sc/in: sc-test\r\nINET: 000123'),{sc_in:'SC-TEST',inet:'000123'});
 assert.equal(parseOrder('Customer calls 000123 about SC-TEST'),null);
 for(const text of ['SC/IN: A\nSC/IN: B','INET: 123\nNO INET/TELP: 123','SC/IN:','SC/IN: A B']) assert.equal(parseOrder(text),null);
 assert.deepEqual(parseStatus('PROSES CEK'),{status:'IN_PROGRESS',reason:null});
 assert.deepEqual(parseStatus('GAGAL\nSynthetic reason'),{status:'FAILED',reason:'Synthetic reason'});
 for(const text of ['GAGAL','DONE later','DONE\nextra','CHECK']) assert.equal(parseStatus(text),null);
 assert.equal(jakartaDay(Date.parse('2026-01-01T16:59:59Z')/1000),'2026-01-01');
 assert.equal(jakartaDay(Date.parse('2026-01-01T17:00:00Z')/1000),'2026-01-02');
});
test('configuration disabled by default; requires explicit thread, deduplication and actor mapping',()=>{
 assert.throws(()=>validateConfig());
 for(const change of [{enabled:false},{identityKey:'short'},{dedupeBy:'guess'},{actors:[]},{groups:[{module:'TIAL',chatId:'-100123',threadId:null}]},{groups:[{module:'TIAL',chatId:'-100123',threadId:null,threadMode:'thread'}]}]) assert.throws(()=>validateConfig({...config(),...change}));
 const original=config(); const validated=validateConfig(original); original.groups[0].module='LOGIC_MO'; assert.equal(validated.groups[0].module,'TIAL');
});
test('daily dedup preserves every original order and same SC/IN with different INET is not merged under both policy',async()=>{
 const {pool,event,run}=setup();
 await run(event(10,order)); await run(event(11,order));
 await run(event(12,order.replace('000000000001','000000000002')));
 await run(event(13,order,{timestamp:1700000000+86400}));
 assert.deepEqual(pool.state.orders.map(o=>o.status),['WAITING','DUPLICATE','WAITING','WAITING']);
 assert.equal(pool.state.orders[1].duplicate_of,pool.state.orders[0].id);
 assert.equal(pool.state.orders[3].business_day,'2023-11-16');
 assert.equal(pool.state.keys.length,3); assert.equal(pool.state.audit.length,4);
});
test('SC-only deduplication policy is explicit and module scope separates TIAL / PSB / MO',async()=>{
 const groups=[...config().groups,{module:'LOGIC_PSB',chatId:'-100124',threadId:'5',threadMode:'thread'},{module:'LOGIC_MO',chatId:'-100125',threadId:null,threadMode:'non_topic'}];
 const {pool,event,run}=setup({dedupeBy:'sc_in',groups});
 await run(event(10,order)); await run(event(11,order.replace('000000000001','000000000002')));
 await run(event(12,order,{chat_id:'-100124',telegram_thread_id:'5'}));
 await run(event(13,order,{chat_id:'-100125'}));
 assert.deepEqual(pool.state.orders.map(o=>o.status),['WAITING','DUPLICATE','WAITING','WAITING']);
 assert.deepEqual(pool.state.orders.map(o=>o.module),['TIAL','TIAL','LOGIC_PSB','LOGIC_MO']);
});
test('inbox replay and concurrent processors do not create extra canonical orders',async()=>{
 const {pool,store,workflow,event}=setup(); const original=event(10,order);
 await store.accept(original); await store.accept(original); await store.accept(event(11,order));
 await Promise.all([workflow.processNext(),workflow.processNext()]);
 assert.equal(pool.state.orders.length,2); assert.equal(pool.state.orders.filter(o=>o.status==='WAITING').length,1);
 assert.equal(pool.state.audit.length,2); assert.equal(await workflow.processNext(),false);
});
test('trusted original-anchor replies transition to PROSES CEK and DONE and enqueue explicit direct replies',async()=>{
 const {pool,event,run}=setup(); await run(event(10,order));
 await run(event(20,'PROSES CEK',{reply_to_message_id:'10'}));
 assert.equal(pool.state.orders[0].status,'IN_PROGRESS'); assert.equal(pool.state.orders[0].last_actor_id,'9');
 assert.ok(pool.state.orders[0].started_at);
 await run(event(21,'DONE',{reply_to_message_id:'10'}));
 assert.equal(pool.state.orders[0].status,'DONE'); assert.ok(pool.state.orders[0].finished_at);
 assert.equal(pool.state.outbox.length,2);
 for(const row of pool.state.outbox){const p=JSON.parse(row.payload); assert.equal(p.reply_to_message_id,'10'); assert.equal(p.telegram_thread_id,null); assert.equal(p.thread_mode,'non_topic');}
 assert.equal(JSON.parse(pool.state.outbox[0].payload).text,'🟡 Data di cek HD Demo');
 await run(event(22,'DONE',{reply_to_message_id:'10'})); await run(event(23,'PROSES CEK',{reply_to_message_id:'10'}));
 assert.equal(pool.state.outbox.length,2); assert.equal(pool.state.orders[0].status,'DONE');
});
test('GAGAL requires a reason and records it in audit without echoing sensitive text to Telegram',async()=>{
 const {pool,event,run}=setup(); await run(event(10,order));
 await run(event(20,'GAGAL\nSynthetic reason',{reply_to_message_id:'10'})); assert.equal(pool.state.orders[0].status,'WAITING');
 await run(event(21,'PROSES CEK',{reply_to_message_id:'10'}));
 await run(event(22,'GAGAL',{reply_to_message_id:'10'})); assert.equal(pool.state.orders[0].status,'IN_PROGRESS');
 await run(event(23,'GAGAL\nSynthetic reason',{reply_to_message_id:'10'}));
 assert.equal(pool.state.orders[0].status,'FAILED');
 assert.deepEqual(JSON.parse(pool.state.audit.at(-1).detail),{reason:'Synthetic reason'});
 assert.equal(JSON.parse(pool.state.outbox.at(-1).payload).text,'🔴 GAGAL');
});
test('duplicate anchor, unknown anchor, wrong sender, wrong topic and edits cannot alter workflow',async()=>{
 const {pool,event,run}=setup(); await run(event(10,order)); await run(event(11,order));
 await run(event(20,'PROSES CEK',{reply_to_message_id:'11'}));
 await run(event(21,'PROSES CEK',{reply_to_message_id:'99'}));
 await run(event(22,'PROSES CEK',{reply_to_message_id:'10',sender_id:'8'}));
 await run(event(23,'PROSES CEK',{reply_to_message_id:'10',telegram_thread_id:'5'}));
 await run(event(24,'PROSES CEK',{reply_to_message_id:'10',kind:'edited_message'}));
 assert.deepEqual(pool.state.orders.map(o=>o.status),['WAITING','DUPLICATE']); assert.equal(pool.state.outbox.length,0);
 for(const action of ['DUPLICATE_REPLY_IGNORED','UNKNOWN_REPLY_ANCHOR','UNAUTHORIZED_STATUS_SENDER','UNMAPPED_GROUP_OR_THREAD','EDIT_REQUIRES_REVIEW']) assert.ok(pool.state.audit.some(a=>a.action===action));
});
test('thread routing stays explicit and never treats absent topic as General',async()=>{
 const {pool,event,run}=setup({groups:[{module:'TIAL',chatId:'-100123',threadId:'5',threadMode:'thread'}]});
 await run(event(10,order)); assert.equal(pool.state.orders.length,0);
 await run(event(11,order,{telegram_thread_id:'5'}));
 await run(event(20,'PROSES CEK',{reply_to_message_id:'11',telegram_thread_id:'5'}));
 const payload=JSON.parse(pool.state.outbox[0].payload); assert.equal(payload.telegram_thread_id,'5'); assert.equal(payload.thread_mode,'thread');
});
test('rollback includes order, audit, daily reservation and outbox; retry processes exactly once internally',async()=>{
 const {pool,store,workflow,event,advance}=setup();
 await store.accept(event(10,order)); pool.failAt='INSERT INTO hd2_audit';
 await assert.rejects(workflow.processNext(),{statusCode:503});
 assert.equal(pool.state.orders.length,0); assert.equal(pool.state.keys.length,0); assert.equal(pool.state.audit.length,0);
 pool.failAt=null; advance(2000); await workflow.processNext();
 await store.accept(event(20,'PROSES CEK',{reply_to_message_id:'10'})); pool.failAt='INSERT INTO hd2_courier_outbox';
 await assert.rejects(workflow.processNext(),{statusCode:503}); assert.equal(pool.state.orders[0].status,'WAITING'); assert.equal(pool.state.audit.length,1);
 pool.failAt=null; advance(2000); await workflow.processNext();
 assert.equal(pool.state.orders[0].status,'IN_PROGRESS'); assert.equal(pool.state.outbox.length,1); assert.equal(pool.state.audit.length,2);
});
test('missing identity fields, unlabelled messages and second update of same message never invent orders',async()=>{
 const {pool,event,run}=setup(); await run(event(10,'SC/IN: SC-ONLY')); await run(event(11,'Call 000000000001'));
 assert.equal(pool.state.orders.length,0);
 await run(event(12,order)); await run(event(12,order)); assert.equal(pool.state.orders.length,1);
});
test('workflow remains absent from production and courier entrypoint imports',()=>{
 for(const file of ['api-only-server.js','server.js','courier-api-server.js','src/courier/app.js','src/courier/storage.js']) assert.equal(fs.readFileSync(file,'utf8').includes('b2c-workflow'),false);
});

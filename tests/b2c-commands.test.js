const test=require('node:test'),assert=require('node:assert/strict');
const {parseCommand}=require('../src/b2c-workflow/commands');
const {MysqlStore}=require('../src/courier/mysql-store');
const {createB2CProcessor}=require('../src/b2c-workflow/workflow');
const {mockPool}=require('./helpers/courier-db');
const base='/order\nSC/IN: free PREFIX-AOi123_suffix\nNO INET:000123\nSN ONT: SN1\nSTO:ABC\nKETERANGAN:test\nNIK:TEST';
test('transaction extraction, labels, suffix, required/optional and profile validation',()=>{
 for(const code of ['AOi123','PDAk123','MOk123','DOk123']){
  const raw=`free DGPS123-${code}_ignored-other-AO123`;
  assert.equal(parseCommand(`/config_psb\nOrder ID DSC :${raw}\nSTO:ABC`,'TIAL1').sc_in,`DGPS123-${code}`);
  assert.equal(parseCommand(`/MO\nsc / in:${raw}\nsto:ABC`,'TIAL2').sc_in,code);
 }
 assert.equal(parseCommand(base,'TIAL1').fields['NO VOICE'],null);
 assert.equal(parseCommand(base,'SOLVER1').valid,false);
 for(const name of ['SC/IN','NO INET','SN ONT','STO','KETERANGAN','NIK'])for(const value of ['', ' ', '-']){
  const lines=base.split('\n').filter(s=>!s.startsWith(name+':'));assert.equal(parseCommand(lines.join('\n'),'TIAL1').valid,false);
  assert.equal(parseCommand([...lines,`${name}:${value}`].join('\n'),'TIAL1').valid,false);
 }
 assert.equal(parseCommand(base.replace('AOi123','MOk123'),'TIAL1').valid,false);
 for(const [cmd,label] of [['config_psb','Order ID'],['MO','SC/IN']])for(const field of [label,'STO'])for(const value of ['', ' ', '-'])assert.equal(parseCommand(`/${cmd}\n${field===label?'STO:X':label+':PREFIX-AOi1'}\n${field}:${value}`,'TIAL1').valid,false);
 const request='/req  Isi asli\n  jangan ubah';assert.equal(parseCommand(request,'SOLVER1').original,request);
});
test('full-history cross-chat TIAL dedup, final canonical, repeat commands, replay, concurrency',async()=>{
 const pool=mockPool(),store=new MysqlStore({pool,botId:'sandbox'});
 const workflow=createB2CProcessor({store,config:{enabled:true,botId:'sandbox',identityKey:'synthetic-command-test-key-00000000',dedupeBy:'both',groups:['-1001','-1002'].map((chatId,i)=>({module:'TIAL',chatId,threadId:null,threadMode:'non_topic',commandProfile:i?'TIAL2':'TIAL1'})),actors:[{id:'9',name:'HD Test'}]}});
 const event=(update,text=base)=>({version:1,bot_id:'sandbox',update_id:String(update),event:{kind:'message',chat_id:update%2?'-1001':'-1002',message_id:String(update),telegram_thread_id:null,sender_id:'9',reply_to_message_id:null,timestamp:1700000000+update*86400,text,attachments:[]}});
 await store.accept(event(1));await workflow.processNext();pool.state.orders[0].status='DONE';
 await store.accept(event(2));await store.accept(event(3));await Promise.all([workflow.processNext(),workflow.processNext()]);
 assert.deepEqual(pool.state.orders.map(o=>o.status),['DONE','DUPLICATE','DUPLICATE']);
 assert.equal(pool.state.orders[2].duplicate_of,pool.state.orders[0].id);
 await store.accept(event(3));await workflow.processNext();assert.equal(pool.state.orders.length,3);
 for(const text of ['/config_psb\nOrder ID:PREFIX-AOi123\nSTO:A','/MO\nSC/IN:PREFIX-AOi123\nSTO:A','/req bebas']){
  for(let j=0;j<2;j++){const n=pool.state.inbox.length+1;await store.accept(event(n,text));await workflow.processNext();}
 }
 assert.equal(pool.state.orders.length,9);assert.equal(pool.state.orders.filter(o=>o.status==='WAITING').length,6);
 assert.equal(pool.state.orders[0].raw_text,base);assert.equal(pool.state.orders[0].sender_id,'9');
 await store.accept(event(20,'/order\nSC/IN:bad'));await workflow.processNext();assert.equal(pool.state.orders.length,9);
});

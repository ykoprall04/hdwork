const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {parseCommand,parseLegacyCommand}=require('../src/b2c-workflow/commands');
const {prefix,rejectionText,matchesRejection,matchesLegacyRejection}=require('../src/b2c-workflow/rejection');
const {outbound,digest}=require('../src/courier/contract');
const {createGroupPolicy}=require('../src/courier/groups');
const {MysqlStore}=require('../src/courier/mysql-store');
const {mockPool}=require('./helpers/courier-db');
const order='/order\nSC/IN:TEST-AO1\nSN ONT:-\nTIPE TRANSAKSI:AO\nSTO:BKL\nKETERANGAN:fixture\nNIK:TEST';
const config='/config_psb\nORDER ID:TEST-AO2\nSN ONT BARU:SN1\nKETERANGAN:fixture\nSTO:BKL';
const mo='/MO\nSC/IN:TEST-MO1\nTIPE TRANSAKSI:MO\nSTO:BKL\nKETERANGAN:fixture\nNIK:-';
const group={chatId:'-1001',threadId:null,threadMode:'non_topic',profile:'TIAL1',commands:['order','req','mo','config_psb']};
const policy=()=>createGroupPolicy({botId:'sandbox',botUsername:'SyntheticBot',groups:[group]});
const event=text=>({kind:'message',chat_id:'-1001',message_id:'123',telegram_thread_id:null,reply_to_message_id:null,sender_id:'9',timestamp:1700000000,text,attachments:[]});
const legacyText=text=>{const p=parseLegacyCommand(text,'TIAL1','SyntheticBot');assert.equal(p.valid,false);return prefix+[...new Set(p.errors)].join(', ');};
async function historical(text){
 const pool=mockPool(),store=new MysqlStore({pool,botId:'sandbox',env:{}}),original=event(text),envelope={version:1,bot_id:'sandbox',update_id:'1',event:original};
 const receipt=await store.accept(envelope);const inbox=pool.state.inbox[0];inbox.state='PROCESSED';
 const payload=outbound({method:'sendMessage',chat_id:original.chat_id,telegram_thread_id:null,thread_mode:'non_topic',reply_to_message_id:original.message_id,text:legacyText(text)});
 const row={id:randomUUID(),bot_id:'sandbox',idem_key:`b2c:${receipt.receipt_id}:format-rejected`,payload_hash:digest(payload),payload:JSON.stringify(payload),state:'QUEUED',due_ms:0,attempts:0};pool.state.outbox.push(row);
 return {pool,store,original,envelope,inbox,payload,row};
}
async function allowed(f,payload=f.payload,p=policy()){const c=await f.pool.getConnection();try{return await p.outgoing(payload,c);}finally{c.release();}}
test('frozen legacy rules reproduce historical rejection; current intake remains strict and templates stay current',()=>{
 assert.equal(parseLegacyCommand(config,'TIAL1').valid,false);assert.equal(parseCommand(config,'TIAL1').valid,true);
 const duplicate=config+'\nSERVICE (1P/2P/3P/1P-Voice):1P\nSERVICE:1P\nSERVICE:2P\nTIPE ONT:TEST';assert.equal(parseLegacyCommand(duplicate,'TIAL1').valid,true);assert.equal(parseCommand(duplicate,'TIAL1').valid,false);
 for(const text of [order,config,mo]){const e=event(text),payload={chat_id:e.chat_id,telegram_thread_id:null,reply_to_message_id:e.message_id,text:legacyText(text)};assert.equal(matchesLegacyRejection(payload,e,{profile:'TIAL1'}),true);assert.equal(matchesRejection(payload,e,{profile:'TIAL1'}),false);}
 for(const raw of ['/req','/req   ','/req body\n preserved'])assert.deepEqual(parseLegacyCommand(raw,'TIAL1'),parseCommand(raw,'TIAL1'));
 assert.match(rejectionText(parseCommand(order,'TIAL1')),/Template:\n\/order/);
});
test('each stored legacy B2C rejection authorizes, claims and ACKs once without creating orders or replaying',async()=>{
 for(const raw of [order,config,mo]){
  const f=await historical(raw);assert.equal(await allowed(f),true);const p=policy();
  const [delivery]=await f.store.claim(1,{authorize:(payload,c)=>p.outgoing(payload,c)});assert.ok(delivery);assert.equal(await allowed(f),true);assert.deepEqual(await f.store.claim(1,{authorize:(payload,c)=>p.outgoing(payload,c)}),[]);
  assert.equal(await f.store.authorizeDelivery(delivery.delivery_id,{lease_token:delivery.lease_token},{authorize:(payload,c)=>p.outgoing(payload,c)}),true);
  const ack={lease_token:delivery.lease_token,result:'sent',telegram_message_id:'999'};await f.store.settle(delivery.delivery_id,ack);await f.store.settle(delivery.delivery_id,ack);
  const receipt=await f.store.accept(f.envelope);assert.equal(receipt.duplicate,true);assert.equal(f.pool.state.orders.length,0);assert.equal(f.pool.state.outbox.length,1);assert.equal(f.row.state,'SENT');
 }
});
test('legacy fallback requires committed inbox, exact namespace/hash/payload, pending state and routing',async()=>{
 const f=await historical(order);
 for(const [object,key,value] of [[f.inbox,'state','PENDING'],[f.row,'idem_key','unrelated'],[f.row,'payload_hash','0'.repeat(64)],[f.row,'state','DEAD'],[f.row,'bot_id','other'],[f.row,'payload',JSON.stringify({...f.payload,text:f.payload.text+' forged'})]]){
  const before=object[key];object[key]=value;assert.equal(await allowed(f),false,key);object[key]=before;
 }
 const row=f.pool.state.outbox.pop();assert.equal(await allowed(f),false);f.pool.state.outbox.push(row);
 for(const patch of [{chat_id:'-1002'},{reply_to_message_id:'124'},{telegram_thread_id:'12',thread_mode:'thread'},{text:f.payload.text+' extra'}])assert.equal(await allowed(f,{...f.payload,...patch}),false);
 const disallowed=createGroupPolicy({botId:'sandbox',botUsername:'SyntheticBot',groups:[{...group,commands:['req']}]});assert.equal(await allowed(f,f.payload,disallowed),false);
 const body=JSON.parse(f.inbox.payload);for(const patch of [{kind:'edited_message'},{reply_to_message_id:'99'},{text:order.replace('/order','/order@OtherBot')}]){f.inbox.payload=JSON.stringify({...body,event:{...body.event,...patch}});assert.equal(await allowed(f),false);}f.inbox.payload=JSON.stringify(body);
 assert.equal(await allowed(f),true);assert.equal(f.pool.state.orders.length,0);
});
test('legacy exception cannot enqueue a new rejection or change new processing',async()=>{
 const f=await historical(order);f.pool.state.outbox.length=0;
 const {allocateOrder}=require('../src/courier/fifo-release');const c=await f.pool.getConnection();try{assert.equal(await allocateOrder({execute:(sql,args)=>sql.startsWith('SELECT id FROM hd2_orders')?Promise.resolve([[]]):c.execute(sql,args)},'sandbox',f.payload,`b2c:${f.inbox.id}:format-rejected`),null);}finally{c.release();}
 assert.equal(await allowed(f),false);assert.equal(parseCommand(config,'TIAL1').valid,true);
 const bad=event('/req unchanged');assert.equal(matchesLegacyRejection({...f.payload,text:prefix+'format'},bad,{profile:'TIAL1'}),false);
});
test('historical multiple receipts for one original do not select a SENT predecessor as legacy proof',async()=>{
 const f=await historical(order);f.row.state='SENT';
 const receipt=await f.store.accept({...f.envelope,update_id:'2'});f.pool.state.inbox[1].state='PROCESSED';
 f.pool.state.outbox.push({...f.row,id:randomUUID(),idem_key:`b2c:${receipt.receipt_id}:format-rejected`,state:'QUEUED'});
 assert.equal(await allowed(f),true);assert.equal(f.pool.state.orders.length,0);
});

const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {commands,moduleFor}=require('../src/courier/shared-group');
const {createGroupPolicy}=require('../src/courier/groups');
const {MysqlStore}=require('../src/courier/mysql-store');
const {mockPool}=require('./helpers/courier-db');
const group={chatId:'-1001',threadId:null,threadMode:'non_topic',profile:'ALL',commands};
const bodies=['/order\nSC/IN:X-AO1\nNO INET:000123\nSN ONT:SN1\nSTO:ABC\nKETERANGAN:test\nNIK:SYNTHETIC','/req help','/config_psb\nOrder ID:X-AO2\nSTO:ABC','/mo\nSC/IN:X-MO3\nSTO:ABC',...['assuren','b2b','replacement'].map(c=>`/${c}\nSC/IN:${c}-100\nNO INET/TELP:00012345\nSTO:ABC\nTRANSAKSI:PERBAIKAN\nKETERANGAN:fixture`)];
const envelope=(text,i)=>({version:1,bot_id:'synthetic-all',update_id:String(i+1),event:{kind:'message',chat_id:group.chatId,message_id:String(i+10),telegram_thread_id:null,sender_id:'9',reply_to_message_id:null,timestamp:1700000000,text,attachments:[]}});
test('one shared group processes all seven existing commands into their real modules',async()=>{
 const pool=mockPool(),store=new MysqlStore({pool,botId:'synthetic-all',orderedInbox:true}),policy=createGroupPolicy({botId:store.botId,botUsername:'SyntheticAllBot',groups:[group]});
 const config=await require('../src/system/routing').databasePolicy({system:{async routing(){return [group];}},botId:store.botId,botUsername:'SyntheticAllBot'}).workflow({enabled:true,webOnly:true,botId:store.botId,botUsername:'SyntheticAllBot',identityKey:'synthetic-shared-identity-key-000000',dedupeBy:'sc_in',actors:[]});
 const processor=require('../src/b2c-workflow/workflow').createB2CProcessor({store,config});
 for(const [i,text]of bodies.entries()){await store.accept(policy.ingress(envelope(text,i)));assert.equal(await processor.processNext(),true);}
 const rows=[...pool.state.orders.values()];assert.equal(rows.length,7);for(const row of rows)assert.equal(row.module,moduleFor(row.command));
 for(const text of ['/login anything','/req@AnotherTestBot other','/b2b invalid'])assert.throws(()=>policy.ingress(envelope(text,99)));
});
test('shared group keeps exact chat/topic isolation and B2C readiness coverage',()=>{
 const policy=createGroupPolicy({botId:'synthetic-all',botUsername:'SyntheticAllBot',groups:[group]});
 const e=envelope('/req test',1);assert.throws(()=>policy.ingress({...e,event:{...e.event,telegram_thread_id:'9'}}));assert.throws(()=>policy.ingress({...e,event:{...e.event,chat_id:'-999'}}));assert.equal(require('../src/operations/b2c-readiness').routes([group]).configured,true);
});
test('group metadata validates names and still rejects HD management and arbitrary command lists',()=>{
 const {mapping,admin}=require('../src/system/policy');const input={id:randomUUID(),requestId:randomUUID(),version:0,botId:'synthetic-all',name:'Operasional bersama',category:'ALL',profile:'ALL',chatId:'-1001',threadId:null,enabled:true,verified:true};assert.equal(mapping(input).category,'ALL');
 for(const patch of [{name:''},{name:'x'.repeat(101)},{name:'x\n'},{profile:'SOLVER1'},{commands:['anything']},{verified:false}])assert.throws(()=>mapping({...input,...patch}));assert.throws(()=>admin({role:'HD'}),{statusCode:403});
});
test('empty live routing stops ingress but remains a valid configuration snapshot',async()=>{
 const policy=require('../src/system/routing').databasePolicy({system:{async routing(){return [];}},botId:'synthetic-all',botUsername:'SyntheticAllBot',dispatchAuthorizationRequired:true});assert.deepEqual((await policy.configuration()).groups,[]);await assert.rejects(policy.ingress(envelope('/req hello',1)),{statusCode:503});
});
test('production database routing is explicit and preserves pinned legacy validation by default',()=>{
 const {validate}=require('../src/config/production-courier'),path=require('node:path');const root=path.resolve('/tmp/synthetic-secret-root');const plan={version:1,environment:'production',telegramBotId:'9133904377',botId:'synthetic-all',botUsername:'SyntheticAllBot',port:3091,groups:[group],secretRoot:root,tokenDpapiFile:'.local/courier-secrets/token.dpapi',serviceKeyDpapiFile:'.local/courier-secrets/service.dpapi',identityKeyDpapiFile:'.local/courier-secrets/identity.dpapi',dbPasswordDpapiFile:'.local/courier-secrets/database.dpapi',journalDirectory:path.resolve('/tmp/synthetic-new-journal'),sourceJournalDirectory:path.resolve('/tmp/synthetic-source-journal'),lockDirectory:path.resolve('/tmp/synthetic-lock'),activationNotBefore:'2026-11-10T13:20:35.278Z'};
 assert.throws(()=>validate(plan),/THREE_NON_TOPIC/);assert.equal(validate({...plan,routingMode:'database'}).groups[0].profile,'ALL');assert.throws(()=>validate({...plan,routingMode:'anything'}),/PRODUCTION_ROUTING_MODE_REJECTED/);
});

test('every shared ALL group accepts PSB and uppercase MO into the correct module without a separate SOLVER group',async()=>{
 const groups=[group,{chatId:'-1002',threadId:'12',threadMode:'thread',profile:'ALL',commands}];
 const pool=mockPool(),store=new MysqlStore({pool,botId:'synthetic-all',orderedInbox:true});
 const policy=createGroupPolicy({botId:store.botId,botUsername:'SyntheticAllBot',groups});
 const config=await require('../src/system/routing').databasePolicy({system:{async routing(){return groups;}},botId:store.botId,botUsername:'SyntheticAllBot'}).workflow({enabled:true,webOnly:true,botId:store.botId,botUsername:'SyntheticAllBot',identityKey:'synthetic-shared-identity-key-000000',dedupeBy:'sc_in',actors:[]});
 const processor=require('../src/b2c-workflow/workflow').createB2CProcessor({store,config});
 let index=0;
 for(const target of groups){
  assert.equal(require('../src/operations/b2c-readiness').routes([target]).configured,true);
  for(const text of ['/config_psb\nORDER ID:X-AO2\nSTO:ABC','/MO\nSC/IN:X-MO3\nSTO:ABC']){
   const body=envelope(text,index++);body.event.chat_id=target.chatId;body.event.telegram_thread_id=target.threadId;
   await store.accept(policy.ingress(body));assert.equal(await processor.processNext(),true);
  }
 }
 const rows=[...pool.state.orders.values()];assert.equal(rows.length,4);
 for(const target of groups){
  const actual=rows.filter(row=>row.chat_id===target.chatId);
  assert.deepEqual(actual.map(row=>row.module).sort(),['LOGIC_MO','LOGIC_PSB']);
  for(const row of actual)assert.equal(row.thread_id,target.threadId);
 }
});

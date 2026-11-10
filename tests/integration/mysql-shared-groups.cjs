// Explicit disposable-only MySQL 8 test. Telegram is never contacted.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
async function run({env=process.env,argv=process.argv.slice(2)}={}){
 if(argv.join(' ')!=='--run-shared-groups-disposable')throw Error('SHARED_GROUP_TEST_DISABLED');
 const guard=require('../../ops/mysql/disposable-guard'),options=guard.config(env,['--run-disposable']),pool=require('mysql2/promise').createPool(options);
 try{
  const contracts=require('../helpers/e2e-contracts.cjs'),c=await pool.getConnection();try{await guard.verifyTarget(c,options.database);for(const sql of [...guard.migrationStatements(),...contracts.schemaStatements(),...contracts.schemaStatements(['012_hdwork2_system_monitoring.sql','013_hdwork2_live_chat.sql','014_hdwork2_shared_groups.review.sql'])])await c.query(sql);}finally{c.release();}
  const password='synthetic-shared-password',auth=require('../../src/access/service').createService(require('../../src/access/store').createStore(pool),'synthetic-shared-session-secret-000000000');await auth.bootstrap({name:'Shared Admin',username:'shared.admin',password});const login=await auth.login('shared.admin',password),admin={...login.user,sessionToken:login.token};
  const hd=await contracts.approvedAccount(auth,admin.id,{name:'Shared HD',username:'shared.hd',password,role:'HD',modules:['TIAL','REQ','LOGIC_PSB','LOGIC_MO','ASSUREN','B2B','REPLACEMENT'],is_active:true});
  const system=require('../../src/system/store').createSystem({readPool:pool,writePool:pool,sharedGroups:true}),mapping={id:randomUUID(),requestId:randomUUID(),version:0,botId:'synthetic-shared',category:'ALL',profile:'ALL',name:'All operations',chatId:'-1001',threadId:null,enabled:true,verified:true};
  const save=async patch=>{Object.assign(mapping,patch,{requestId:randomUUID()});const result=await system.saveMapping(admin,mapping);mapping.version=result.version;return result;};
  await new (require('../../src/courier/runtime-store').RuntimeStore)(new (require('../../src/courier/mysql-store').MysqlStore)({pool,botId:mapping.botId})).lease('acquire',{worker_id:randomUUID()});
  await save({});await assert.rejects(system.saveMapping(admin,{...mapping,id:randomUUID(),requestId:randomUUID(),botId:'unknown-bot'}),{statusCode:409});await assert.rejects(system.saveMapping({...hd.user,sessionToken:hd.token},mapping),{statusCode:403});
  const {MysqlStore}=require('../../src/courier/mysql-store'),store=new MysqlStore({pool,botId:mapping.botId,routeFence:true,orderedInbox:true});const policy=require('../../src/system/routing').databasePolicy({system,botId:store.botId,botUsername:'SyntheticSharedBot',chatEnabled:true,dispatchAuthorizationRequired:true});
  let seq=0;const event=(text,reply=null)=>({version:1,bot_id:store.botId,update_id:String(++seq),event:{kind:'message',chat_id:mapping.chatId,message_id:String(seq+10),telegram_thread_id:null,sender_id:'9',reply_to_message_id:reply,timestamp:Math.floor(Date.now()/1000),text,attachments:[]}});
  await new Promise(r=>setTimeout(r,1100));
  const bodies=['/req help','/order\nSC/IN:X-AO1\nNO INET:000123\nSN ONT:SN1\nSTO:ABC\nKETERANGAN:test\nNIK:SYNTHETIC','/config_psb\nOrder ID:X-AO2\nSTO:ABC','/mo\nSC/IN:X-MO3\nSTO:ABC',...['assuren','b2b','replacement'].map(c=>`/${c}\nSC/IN:${c}-100\nNO INET/TELP:00012345\nSTO:ABC\nTRANSAKSI:PERBAIKAN\nKETERANGAN:fixture`)];
  async function process(){const config=await policy.workflow({enabled:true,webOnly:true,chatEnabled:true,botId:store.botId,botUsername:'SyntheticSharedBot',identityKey:'synthetic-shared-identity-000000000',dedupeBy:'sc_in',actors:[]});return require('../../src/b2c-workflow/workflow').createB2CProcessor({store,config}).processNext();}
  for(const text of bodies){await store.accept(await policy.ingress(event(text)));assert.equal(await process(),true);}
  const [orders]=await pool.execute('SELECT * FROM hd2_orders ORDER BY command');assert.equal(orders.length,7);for(const order of orders)assert.equal(order.module,require('../../src/courier/shared-group').moduleFor(order.command));
  const order=orders.find(o=>o.command==='b2b'),chat=require('../../src/chat/service').createChat({readPool:pool,writePool:pool,sharedGroups:true});
  assert.equal((await chat.conversations({},hd.user)).data.length,7);
  await require('../../src/operations/mutate').act(pool,hd.token,hd.id,order.id,{requestId:randomUUID(),version:0,action:'PICK'});
  const sent=await chat.send(order.id,hd.token,hd.id,{requestId:randomUUID(),version:1,text:'new shared chat'});assert.equal(sent.status,'ANTRE');
  const pendingEvent=event('reply pending',order.message_id);await store.accept(await policy.ingress(pendingEvent));
  const [beforeOutbox]=await pool.execute('SELECT * FROM hd2_courier_outbox ORDER BY id');const [[beforeInbox]]=await pool.execute('SELECT * FROM hd2_courier_inbox WHERE update_id=?',[pendingEvent.update_id]);
  const configBefore=await policy.configuration();assert.equal(configBefore.groups[0].profile,'ALL');
  await save({enabled:false});assert.equal((await policy.configuration()).groups.length,0);await assert.rejects(policy.ingress(event('disabled',order.message_id)),{statusCode:403});assert.deepEqual(await store.claim(1,{authorize:(p,c)=>policy.outgoing(p,c)}),[]);assert.equal(await store.processNext(()=>assert.fail('disabled inbox processed')),false);
  assert.equal((await chat.messages(order.id,{},hd.user)).routeActive,false);await assert.rejects(chat.send(order.id,hd.token,hd.id,{requestId:randomUUID(),version:1,text:'must stop'}),{statusCode:403});
  await save({enabled:true});assert.deepEqual(await store.claim(1,{authorize:(p,c)=>policy.outgoing(p,c)}),[]);assert.equal(await store.processNext(()=>assert.fail('old inbox replayed')),false);
  const [afterOutbox]=await pool.execute('SELECT * FROM hd2_courier_outbox ORDER BY id');assert.deepEqual(afterOutbox,beforeOutbox);const [[afterInbox]]=await pool.execute('SELECT * FROM hd2_courier_inbox WHERE update_id=?',[pendingEvent.update_id]);assert.deepEqual(afterInbox,beforeInbox);
  assert.ok((await chat.messages(order.id,{},hd.user)).data.some(m=>m.status==='DITAHAN'));
  await new Promise(r=>setTimeout(r,1100));
  await store.accept(await policy.ingress(event('new reply after enable',order.message_id)));assert.equal(await process(),true);
  const newId=await store.enqueue('fresh-after-enable',{method:'sendMessage',chat_id:mapping.chatId,telegram_thread_id:null,thread_mode:'non_topic',reply_to_message_id:order.message_id,text:'fresh'});const [delivery]=await store.claim(1,{authorize:(p,c)=>policy.outgoing(p,c)});assert.equal(delivery.delivery_id,newId);
  await save({enabled:false});const [inFlightBefore]=await pool.execute('SELECT * FROM hd2_courier_outbox ORDER BY id');assert.deepEqual(await new MysqlStore({pool,botId:mapping.botId,routeFence:true,now:()=>Date.now()+65000}).claim(),[]);const [inFlightAfter]=await pool.execute('SELECT * FROM hd2_courier_outbox ORDER BY id');assert.deepEqual(inFlightAfter,inFlightBefore);assert.equal(await store.authorizeDelivery(delivery.delivery_id,{lease_token:delivery.lease_token},{authorize:(p,c)=>policy.outgoing(p,c)}),false);
  return {status:'SHARED_GROUPS_MYSQL_PASS',orders:7,heldRowsUnchanged:true,reenableReplaysOldMessages:false,finalDispatchRecheck:true,telegramAccessed:false};
 }finally{await pool.end();}
}
if(require.main===module)run().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
module.exports={run};

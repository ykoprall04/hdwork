const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),net=require('net'),{randomUUID}=require('crypto');
test('real production backend composition uses explicit environment with real isolated MySQL',async()=>{
 const f=await require('./helpers/temporary-courier-mysql.cjs').start(path.resolve('.local'));let app;
 try{
  const schema=require('./helpers/writer-schema.cjs');await schema.install(f.c);const password=randomUUID();await schema.account(f.c,'courierSendChatFifo','hdwork_courier',password);
  const fence=require('../src/courier/writer-fence'),bot='fixture-bot';await fence.change(f.pool,{botId:bot,action:'initialize',operator:'Fixture',reason:'composition test'});
  const order=randomUUID();await f.c.execute("INSERT INTO hd2_orders(id,bot_id,module,business_day,chat_id,message_id,status,command,telegram_timestamp) VALUES (?,?,'TIAL',UTC_DATE(),'-1001','101','WAITING','order',UNIX_TIMESTAMP())",[order,bot]);
  await f.c.execute("INSERT INTO hd2_system_mappings(id,bot_id,category,profile,chat_id,route_key,enabled,verified) VALUES (?,?,'TIAL','TIAL1','-1001','fixture',TRUE,TRUE)",[randomUUID(),bot]);
  const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));
  const base=path.join(f.root,'secrets'),plan={version:1,environment:'production',telegramBotId:'123456789',botId:bot,botUsername:'FixtureBot',port,groups:[{chatId:'-1001',profile:'TIAL1',threadId:null,threadMode:'non_topic',commands:['order','req']}],routingMode:'database',deliveryMode:'fifo-ack-v2',fifoRelease:true,secretRoot:base,tokenDpapiFile:'.local/courier-secrets/token.dpapi',serviceKeyDpapiFile:'.local/courier-secrets/service.dpapi',identityKeyDpapiFile:'.local/courier-secrets/identity.dpapi',dbPasswordDpapiFile:'.local/courier-secrets/db.dpapi',journalDirectory:path.join(f.root,'journal'),sourceJournalDirectory:path.join(f.root,'old'),lockDirectory:path.join(f.root,'locks'),activationNotBefore:'2026-01-01T00:00:00.000Z'};
  const reads=[];const env=await require('../src/config/production-courier').load(plan,{kind:'backend',readSecret:async file=>{reads.push(file);return file.endsWith('db.dpapi')?password:file.endsWith('identity.dpapi')?'i'.repeat(40):'s'.repeat(40);}});
  assert.ok(reads.every(x=>!x.endsWith('token.dpapi')));assert.equal(env.HDWORK2_COURIER_WRITER_V2_BOTS_JSON,JSON.stringify([bot]));
  // Explicitly no ambient Courier feature flags. The endpoint adapter changes only
  // the connection endpoint to the owned named pipe; queries/grants stay real.
  const saved={};for(const k of ['HDWORK2_COURIER_WRITER_V2_BOTS_JSON','HDWORK2_COURIER_FIFO_ENABLED','HDWORK2_COURIER_FIFO_RELEASE_ENABLED']){saved[k]=process.env[k];delete process.env[k];}
  try{
   env.COURIER_WORKER_ENABLED='false';env.COURIER_RECEIVE_ENABLED='false';
   app=await require('../courier-b2c-server').startIntegration({env,deferInboxWorker:true,createPool:()=>require('mysql2/promise').createPool(schema.options(f,'hdwork_courier',password))});
   assert.equal(app.store.fifoRelease,true);assert.equal(app.store.writerV2,true);
   const body={method:'sendMessage',chat_id:'-1001',telegram_thread_id:null,thread_mode:'non_topic',reply_to_message_id:'101',text:'synthetic'};
   await assert.rejects(app.store.enqueue('closed',body),{code:'WRITER_FENCE_CLOSED'});
   await fence.change(f.pool,{botId:bot,action:'open',expectedEpoch:'2',operator:'Fixture',reason:'fixture only'});const id=await app.store.enqueue('open',body);
   const [[row]]=await f.c.execute('SELECT conversation_seq,fifo_order_id FROM hd2_courier_outbox WHERE id=?',[id]);assert.equal(String(row.conversation_seq),'1');assert.equal(row.fifo_order_id,order);
   // Nested system writer is composed with the same explicit env and gate.
   await f.c.execute("INSERT INTO hd2_system_targets(bot_id,chat_id,anchor_id,enabled,verified) VALUES (?,'-1001','101',TRUE,TRUE)",[bot]);
   await fence.change(f.pool,{botId:bot,action:'close',expectedEpoch:'3',operator:'Fixture',reason:'fixture only'});
   const system=require('../src/system/store').createSystem({env,readPool:f.pool,writePool:f.pool});await assert.rejects(system.alert(bot,'TEST_ALERT',{approved:true}),{code:'WRITER_FENCE_CLOSED'});
  }finally{for(const [k,v] of Object.entries(saved))if(v===undefined)delete process.env[k];else process.env[k]=v;}
 }finally{await app?.close();await f.stop();}
});

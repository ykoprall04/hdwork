// Real SQL on an owned named-pipe server with TCP disabled. No production config.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {start}=require('./helpers/temporary-courier-mysql.cjs');
const {MysqlStore}=require('../src/courier/mysql-store');
const {createB2CProcessor}=require('../src/b2c-workflow/workflow');
const {createGroupPolicy}=require('../src/courier/groups');
const fence=require('../src/courier/writer-fence');
const valid='/order\nSC/IN:TEST-AO100\nSN ONT:SYNTHETIC\nTIPE TRANSAKSI:AO\nSTO:ABC\nKETERANGAN:fixture\nNIK:TEST';
const invalid=valid.replace('SC/IN:TEST-AO100','SC/IN:');
test('production FIFO writer: invalid rejection commits without an order or inbox retry',async t=>{
 const parent=path.resolve(__dirname,'../.local');fs.mkdirSync(parent,{recursive:true});const f=await start(parent);
 try{
  await f.c.query('CREATE DATABASE hdwork2');await f.c.query('USE hdwork2');
  for(const sql of require('../ops/mysql/disposable-guard').migrationStatements())await f.c.query(sql);
  for(const sql of require('./helpers/e2e-contracts.cjs').schemaStatements(['007_hdwork2_auth.sql','008_hdwork2_operations.sql','009_hdwork2_courier_runtime.sql','010_hdwork2_account_approval.sql','011_hdwork2_registration_rejection.sql','012_hdwork2_system_monitoring.sql','013_hdwork2_live_chat.sql','014_hdwork2_shared_groups.review.sql']))await f.c.query(sql);
  for(const name of ['015_hdwork2_fifo_ack.review.sql','016_fifo_release.PLAN_ONLY.sql','017_administrative_closure.PLAN_ONLY.sql'])for(const sql of fs.readFileSync(path.join(__dirname,'../database/manual',name),'utf8').replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await f.c.query(sql);
  const botId='invalid-fixture',env={HDWORK2_COURIER_WRITER_V2_BOTS_JSON:JSON.stringify([botId])};
  const store=new MysqlStore({pool:f.pool,botId,env,orderedInbox:true,routeFence:false});
  await fence.change(f.pool,{botId,action:'initialize',operator:'Fixture',reason:'offline test'});
  await fence.change(f.pool,{botId,action:'open',expectedEpoch:'2',operator:'Fixture',reason:'offline test'});
  const group={chatId:'-1001',threadId:null,threadMode:'non_topic',profile:'TIAL1',commands:['order','req','config_psb','mo']};
  const policy=createGroupPolicy({botId,botUsername:'SyntheticOpsBot',groups:[group]});
  const config={enabled:true,webOnly:true,botId,botUsername:'SyntheticOpsBot',identityKey:'synthetic-identity-key-000000000000',dedupeBy:'both',groups:[{module:'TIAL',chatId:'-1001',threadId:null,threadMode:'non_topic',commandProfile:'TIAL1',allowedCommands:group.commands}],actors:[]};
  const processor=createB2CProcessor({store,config});
  const now=Math.floor(Date.now()/1000);
  const envelope=(n,text)=>({version:1,bot_id:botId,update_id:String(n),event:{kind:'message',chat_id:'-1001',message_id:String(100+n),telegram_thread_id:null,sender_id:'9',reply_to_message_id:null,timestamp:now+n*3,text,attachments:[]}});
  await store.accept(policy.ingress(envelope(1,invalid)));
  await assert.doesNotReject(processor.processNext());
  const [[inbox]]=await f.pool.query('SELECT id,state,attempts FROM hd2_courier_inbox');
  assert.equal(inbox.state,'PROCESSED');assert.equal(inbox.attempts,1);
  const [[orders]]=await f.pool.query('SELECT COUNT(*) n FROM hd2_orders');assert.equal(orders.n,0);
  const replies=await store.claim(1,{authorize:(payload,c)=>policy.outgoing(payload,c)});assert.equal(replies.length,1);
  assert.equal(replies[0].payload.reply_to_message_id,'101');assert.match(replies[0].payload.text,/Gagal!.*SC\/IN/);
  const sent=async d=>{
   const ack={lease_token:d.lease_token,result:'sent',telegram_message_id:String(9000+Number(d.payload.reply_to_message_id))};
   await store.settle(d.delivery_id,ack);assert.deepEqual(await store.settle(d.delivery_id,ack),{duplicate:true});
  };
  await sent(replies[0]);
  await t.test('VALID/INVALID every 3 seconds: no retries or head-of-line delay; one anchored reply each',async()=>{
   let clock=Date.now();store.now=()=>clock;
   const sequence=[valid,invalid,valid.replace('AO100','AO101'),valid.replace('SN ONT:SYNTHETIC','SN ONT:-'),valid,invalid];
   const observed=[];
   for(let i=0;i<sequence.length;i++){
    const before=clock,body=envelope(10+i,sequence[i]);body.event.timestamp=Math.floor(clock/1000);
    const receipt=await store.accept(policy.ingress(body));
    assert.equal(await processor.processNext(),true);
    const [[received]]=await f.pool.execute('SELECT state,attempts,due_ms FROM hd2_courier_inbox WHERE id=?',[receipt.receipt_id]);
    assert.equal(received.state,'PROCESSED');assert.equal(received.attempts,1);assert.ok(Number(received.due_ms)<=clock);
    const queued=await store.claim(1,{authorize:(p,c)=>policy.outgoing(p,c)});assert.equal(queued.length,1);
    assert.equal(queued[0].payload.reply_to_message_id,body.event.message_id);
    assert.match(queued[0].payload.text,i%2?/Gagal!.*(SC\/IN|SN ONT)/:/Berhasil!/);
    const [[meta]]=await f.pool.execute('SELECT fifo_order_id,conversation_seq FROM hd2_courier_outbox WHERE id=?',[queued[0].delivery_id]);
    if(i%2)assert.equal(meta.fifo_order_id,receipt.receipt_id);
    assert.equal(Number(meta.conversation_seq),1);
    await sent(queued[0]);
    // Replayed update cannot create another order, reply or validation audit.
    assert.equal((await store.accept(policy.ingress(body))).receipt_id,receipt.receipt_id);
    assert.equal(await processor.processNext(),false);assert.deepEqual(await store.claim(1),[]);
    observed.push({arrivalMs:before,state:received.state,attempts:received.attempts});clock+=3000;
   }
   assert.deepEqual(observed.slice(1).map((r,i)=>r.arrivalMs-observed[i].arrivalMs),[3000,3000,3000,3000,3000]);
   const [[counts]]=await f.pool.query("SELECT COUNT(*) total,SUM(status='DUPLICATE') duplicates FROM hd2_orders");assert.equal(counts.total,3);assert.equal(Number(counts.duplicates),1);
   const [[messages]]=await f.pool.query("SELECT COUNT(*) n,SUM(state='SENT') sent FROM hd2_courier_outbox");assert.equal(messages.n,7);assert.equal(Number(messages.sent),7);
   const [[rejected]]=await f.pool.query("SELECT COUNT(*) n FROM hd2_audit WHERE action='ORDER_FORMAT_REJECTED'");assert.equal(rejected.n,4);
  });
  await t.test('rejection content/anchor cannot be forged and inbox proof is required',async()=>{
   const payload=replies[0].payload;
   const {randomUUID}=require('crypto');
   await assert.rejects(store.enqueue(`b2c:${randomUUID()}:format-rejected`,{...payload,reply_to_message_id:'99999'}),{code:'WRITER_FIFO_ORDER_REQUIRED'});
   await assert.rejects(store.enqueue(`b2c:${inbox.id}:format-rejected`,{...payload,text:payload.text+' altered'}),{code:'WRITER_FIFO_ORDER_REQUIRED'});
   await assert.rejects(store.enqueue(`arbitrary:${inbox.id}`,payload),{code:'WRITER_FIFO_ORDER_REQUIRED'});
   const c=await f.pool.getConnection();try{
    assert.equal(await policy.outgoing({...payload,text:payload.text+' altered'},c),false);
    assert.equal(await policy.outgoing({...payload,reply_to_message_id:'999'},c),false);
    const restricted=createGroupPolicy({botId,botUsername:'SyntheticOpsBot',groups:[{...group,commands:['req']}]});
    assert.equal(await restricted.outgoing(payload,c),false);
   }finally{c.release();}
  });
  await t.test('audit/enqueue rollback leaves no phantom order/reply/lane; successful retry stays idempotent',async()=>{
   const body=envelope(30,invalid);await store.accept(policy.ingress(body));
   await f.c.query("CREATE TRIGGER offline_fail_outbox BEFORE INSERT ON hd2_courier_outbox FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='offline injected outbox failure'");
   try{await assert.rejects(processor.processNext());}finally{await f.c.query('DROP TRIGGER offline_fail_outbox');}
   const [[q]]=await f.pool.execute('SELECT COUNT(*) n FROM hd2_courier_outbox WHERE idem_key LIKE ?',[`b2c:%:format-rejected`]);assert.equal(q.n,4);
   store.now=()=>Date.now()+120000;assert.equal(await processor.processNext(),true);
   const reply=await store.claim(1,{authorize:(p,c)=>policy.outgoing(p,c)});assert.equal(reply.length,1);assert.equal(reply[0].payload.reply_to_message_id,'130');await sent(reply[0]);
  });
  await t.test('confirmed lane predecessor still blocks until ACK; another original remains independent',async()=>{
   const p=replies[0].payload;
   const a=await store.enqueue(`b2c:${inbox.id}:format-rejected`,p); // existing idempotency key, not a new reply
   assert.equal(a,replies[0].delivery_id);
   // The same original may have multiple canonical rejection notifications only
   // through the exact origin namespace: arbitrary alternate keys fail closed.
   await assert.rejects(store.enqueue(`b2c:${inbox.id}:format-rejected-extra`,p),{code:'WRITER_FIFO_ORDER_REQUIRED'});
   assert.deepEqual(await store.claim(1),[]);
   const success={...p,reply_to_message_id:'110',text:'\u2705 Berhasil! Order diterima.'};
   const first=await store.enqueue('valid-lane-a',success),second=await store.enqueue('valid-lane-b',success);
   const independent=await store.enqueue('valid-other-lane',{...success,reply_to_message_id:'112'});
   const heads=await store.claim(10,{authorize:(payload,c)=>policy.outgoing(payload,c)});
   assert.deepEqual(new Set(heads.map(x=>x.delivery_id)),new Set([first,independent]));assert.ok(!heads.some(x=>x.delivery_id===second));
   assert.deepEqual(await store.claim(10),[]);
   await sent(heads.find(x=>x.delivery_id===independent));assert.deepEqual(await store.claim(10),[]);
   await sent(heads.find(x=>x.delivery_id===first));
   const next=await store.claim(10);assert.equal(next.length,1);assert.equal(next[0].delivery_id,second);await sent(next[0]);
  });
  await t.test('existing Courier grants suffice; no audit SELECT, new schema or grants needed in production',async()=>{
   const mysql=require('mysql2/promise'),password=require('crypto').randomUUID();
   await f.c.query("CREATE USER 'offline_courier'@'localhost' IDENTIFIED BY ?",[password]);
   for(const [table,permissions] of Object.entries(require('../src/config/operational-grants').policies.courierSendChatFifo)){
    await f.c.query('GRANT '+permissions.join(', ')+' ON hdwork2.`'+table+"` TO 'offline_courier'@'localhost'");
   }
   const limited=mysql.createPool({socketPath:f.socketPath,user:'offline_courier',password,database:'hdwork2',connectionLimit:2,
    authPlugins:{caching_sha2_password:require('mysql2').authPlugins.caching_sha2_password({overrideIsSecure:false})}});
   try{
    await assert.rejects(limited.query('SELECT * FROM hd2_audit LIMIT 0'),{code:'ER_TABLEACCESS_DENIED_ERROR'});
    const scoped=new MysqlStore({pool:limited,botId,env,orderedInbox:true,routeFence:false});
    const workflow=createB2CProcessor({store:scoped,config});
    const body=envelope(50,invalid);await scoped.accept(policy.ingress(body));assert.equal(await workflow.processNext(),true);
    const list=await scoped.claim(1,{authorize:(payload,c)=>policy.outgoing(payload,c)});assert.equal(list.length,1);
    assert.equal(list[0].payload.reply_to_message_id,'150');
    await scoped.settle(list[0].delivery_id,{lease_token:list[0].lease_token,result:'sent',telegram_message_id:'9900'});
   }finally{await limited.end();}
  });
  await t.test('many duplicated fields still get a short canonical failure reply without inbox backoff',async()=>{
   const text=invalid+'\n'+'NIK:X\n'.repeat(500);assert.ok(text.length<4096);
   const body=envelope(60,text);store.now=()=>Date.now();await store.accept(policy.ingress(body));
   assert.equal(await processor.processNext(),true);
   const reply=await store.claim(1,{authorize:(p,c)=>policy.outgoing(p,c)});assert.equal(reply.length,1);
   assert.equal(reply[0].payload.text,'\u274c Gagal! Format order salah. Alasan: NIK berulang, SC/IN');
   assert.equal(reply[0].payload.reply_to_message_id,'160');await sent(reply[0]);
  });
  await t.test('SQL proof and unknown-predecessor guards also hold for rejection-origin lanes',async()=>{
   const receipt=await store.accept(policy.ingress(envelope(70,invalid)));assert.equal(await processor.processNext(),true);
   await f.pool.execute("UPDATE hd2_courier_inbox SET state='PENDING' WHERE id=?",[receipt.receipt_id]);
   assert.deepEqual(await store.claim(1),[]);
   await f.pool.execute("UPDATE hd2_courier_inbox SET state='PROCESSED' WHERE id=?",[receipt.receipt_id]);
   const unknown=require('crypto').randomUUID();
   await f.pool.execute("INSERT INTO hd2_courier_outbox(id,bot_id,idem_key,payload_hash,payload,state,due_ms) VALUES (?,?,?,REPEAT('a',64),'{}','DEAD',0)",[unknown,botId,unknown]);
   assert.deepEqual(await store.claim(1),[]);
   // Fixture-only disposition; no production data or automatic release of unknown rows.
   await f.pool.execute('UPDATE hd2_courier_outbox SET fifo_release=? WHERE id=?',[JSON.stringify({source:'OFFLINE_FIXTURE'}),unknown]);
   const reply=await store.claim(1,{authorize:(p,c)=>policy.outgoing(p,c)});assert.equal(reply.length,1);assert.equal(reply[0].payload.reply_to_message_id,'170');
   await store.settle(reply[0].delivery_id,{lease_token:reply[0].lease_token,result:'failed',error_code:'BAD_REQUEST',telegram_error:{source:'TELEGRAM_BOT_API',code:400,rejected:true,description:'Bad Request: message to reply not found'}});
   const [[row]]=await f.pool.execute('SELECT state,fifo_release FROM hd2_courier_outbox WHERE id=?',[reply[0].delivery_id]);
   assert.equal(row.state,'DEAD');assert.ok(row.fifo_release);
  });
 }finally{await f.stop();}
});

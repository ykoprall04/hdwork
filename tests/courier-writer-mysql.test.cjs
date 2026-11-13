const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{spawn}=require('node:child_process');
const {start}=require('./helpers/temporary-courier-mysql.cjs');
const fence=require('../src/courier/writer-fence'),{MysqlStore}=require('../src/courier/mysql-store');
test('isolated MySQL: actual web FIFO and durable per-bot barrier',async t=>{
 const parent=path.resolve(__dirname,'../.local');fs.mkdirSync(parent,{recursive:true});const f=await start(parent),pool=f.pool;
 const old=process.env.HDWORK2_COURIER_WRITER_V2_BOTS_JSON;process.env.HDWORK2_COURIER_WRITER_V2_BOTS_JSON='["bot-a"]';
 const change=(action,expectedEpoch)=>fence.change(pool,{botId:'bot-a',action,expectedEpoch,operator:'Fixture',reason:'isolated rehearsal',expectedAccount:'root@localhost'});
 let checks=0;
 try{
  await f.c.query('CREATE DATABASE hdwork2');await f.c.query('USE hdwork2');
  for(const sql of require('../ops/mysql/disposable-guard').migrationStatements())await f.c.query(sql);
  for(const sql of require('./helpers/e2e-contracts.cjs').schemaStatements(['007_hdwork2_auth.sql','008_hdwork2_operations.sql','009_hdwork2_courier_runtime.sql','010_hdwork2_account_approval.sql','011_hdwork2_registration_rejection.sql','012_hdwork2_system_monitoring.sql','013_hdwork2_live_chat.sql','014_hdwork2_shared_groups.review.sql']))await f.c.query(sql);
  for(const name of ['015_hdwork2_fifo_ack.review.sql','016_fifo_release.PLAN_ONLY.sql','017_administrative_closure.PLAN_ONLY.sql'])for(const sql of fs.readFileSync(path.join(__dirname,'../database/manual',name),'utf8').replace(/^--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean))await f.c.query(sql);
  await f.c.query("INSERT INTO users(id,name,username,password_hash,role,is_active) VALUES (1,'Fixture','fixture','synthetic','HD',TRUE)");
  await f.c.query("INSERT INTO hd2_user_modules(user_id,module) VALUES (1,'TIAL')");
  const token='synthetic-session';await f.c.execute('INSERT INTO hd2_sessions(token_hash,user_id,expires_at) VALUES (?,1,TIMESTAMPADD(HOUR,1,UTC_TIMESTAMP(3)))',[require('../src/access/service').digest(token)]);
  const orderA=randomUUID(),orderB=randomUUID();
  for(const [id,bot,anchor] of [[orderA,'bot-a','101'],[orderB,'bot-a','102'],[randomUUID(),'bot-b','101']])await f.c.execute("INSERT INTO hd2_orders(id,bot_id,module,business_day,chat_id,message_id,status,command,owner_user_id,version,telegram_timestamp) VALUES (?,?,'TIAL',UTC_DATE(),'-1001',?,'IN_PROGRESS','order',1,1,UNIX_TIMESTAMP())",[id,bot,anchor]);
  for(const bot of ['bot-a','bot-b'])await f.c.execute("INSERT INTO hd2_system_mappings(id,bot_id,category,profile,chat_id,route_key,enabled,verified) VALUES (?,?,'TIAL','TIAL1','-1001','fixture',TRUE,TRUE)",[randomUUID(),bot]);
  for(let i=0;i<18;i++){const id=randomUUID();await f.c.execute("INSERT INTO hd2_courier_outbox(id,bot_id,idem_key,payload_hash,payload,state,attempts,due_ms,last_error_code,created_at) VALUES (?,'bot-a',?,REPEAT('a',64),'{}','DEAD',1,0,'NETWORK','2026-01-01 00:00:00')",[id,id]);}
  const dead=async()=>JSON.stringify((await f.c.query("SELECT * FROM hd2_courier_outbox WHERE bot_id='bot-a' AND state='DEAD' ORDER BY id"))[0]),beforeDead=await dead();
  const store=new MysqlStore({pool,botId:'bot-a',fifo:false,fifoRelease:false,routeFence:false}),other=new MysqlStore({pool,botId:'bot-b',fifo:false,fifoRelease:false,routeFence:false});
  const body=anchor=>({method:'sendMessage',chat_id:'-1001',telegram_thread_id:null,thread_mode:'non_topic',reply_to_message_id:anchor,text:'synthetic reply'});
  const chat=require('../src/chat/service').createChat({readPool:pool,writePool:pool,sharedGroups:false});
  await t.test('missing fence and autocommit enqueue fail closed; scoped FIFO overrides legacy defaults',async()=>{
   assert.equal(store.fifo,true);assert.equal(store.fifoRelease,true);assert.equal(other.fifo,false);
   await assert.rejects(store.enqueue('missing',body('101')),{code:'WRITER_FENCE_NOT_INITIALIZED'});
   await assert.rejects(store.enqueueOn(f.c,'autocommit',body('101')),{code:'WRITER_TRANSACTION_REQUIRED'});checks++;
  });
  await t.test('initialization persists CLOSED; rejected chat rolls back business writes',async()=>{
   assert.equal((await change('initialize')).epoch,'2');await assert.rejects(change('initialize'),{code:'WRITER_FENCE_ALREADY_INITIALIZED'});
   const [[before]]=await pool.query('SELECT COUNT(*) AS n FROM hd2_web_requests');
   await assert.rejects(chat.send(orderA,token,1,{requestId:randomUUID(),version:1,text:'closed fixture'}),{code:'WRITER_FENCE_CLOSED'});
   const [[after]]=await pool.query('SELECT COUNT(*) AS n FROM hd2_web_requests');assert.equal(after.n,before.n);checks++;
  });
  await t.test('real chat.send allocates lane and order proof atomically; replay is idempotent',async()=>{
   await change('open','2');const input={requestId:randomUUID(),version:1,text:'web fixture'},sent=await chat.send(orderA,token,1,input);
   assert.deepEqual(await chat.send(orderA,token,1,input),sent);
   const [[r]]=await pool.execute('SELECT conversation_key,conversation_seq,fifo_order_id FROM hd2_courier_outbox WHERE id=?',[sent.outboxId]);assert.match(r.conversation_key,/^[a-f0-9]{64}$/);assert.equal(Number(r.conversation_seq),1);assert.equal(r.fifo_order_id,orderA);checks++;
  });
  await t.test('concurrent writers share monotonic sequence; second order has independent lane',async()=>{
   const ids=await Promise.all(Array.from({length:12},(_,i)=>store.enqueue('race:'+i,body('101'))));assert.equal(new Set(ids).size,12);
   const [rows]=await pool.query("SELECT conversation_key,conversation_seq FROM hd2_courier_outbox WHERE bot_id='bot-a' AND conversation_seq IS NOT NULL ORDER BY conversation_seq");assert.equal(new Set(rows.map(r=>r.conversation_key)).size,1);assert.deepEqual(rows.map(r=>Number(r.conversation_seq)),Array.from({length:13},(_,i)=>i+1));
   const id=await store.enqueue('order-b',body('102'));const [[r]]=await pool.execute('SELECT conversation_key,conversation_seq FROM hd2_courier_outbox WHERE id=?',[id]);assert.notEqual(r.conversation_key,rows[0].conversation_key);assert.equal(Number(r.conversation_seq),1);checks++;
  });
  await t.test('concurrent real chat replay produces one request, message and outbox',async()=>{
   const input={requestId:randomUUID(),version:1,text:'concurrent web replay'};
   const [a,b]=await Promise.all([chat.send(orderA,token,1,input),chat.send(orderA,token,1,input)]);assert.deepEqual(a,b);
   const [[n]]=await pool.execute('SELECT COUNT(*) AS n FROM hd2_chat_messages WHERE outbox_id=?',[a.outboxId]);assert.equal(n.n,1);checks++;
  });
  await t.test('chat audit failure rolls request, lane, message and outbox back together',async()=>{
   const snapshot=async()=>JSON.stringify((await pool.query("SELECT (SELECT COUNT(*) FROM hd2_web_requests) AS requests,(SELECT COUNT(*) FROM hd2_chat_messages) AS messages,(SELECT COUNT(*) FROM hd2_courier_outbox) AS outbox,(SELECT SUM(next_seq) FROM hd2_courier_lanes) AS lanes"))[0]);
   const before=await snapshot();await f.c.query("CREATE TRIGGER fixture_chat_failure BEFORE INSERT ON hd2_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic chat audit failure'");
   try{await assert.rejects(chat.send(orderA,token,1,{requestId:randomUUID(),version:1,text:'rolled back web chat'}));}finally{await f.c.query('DROP TRIGGER fixture_chat_failure');}
   assert.equal(await snapshot(),before);checks++;
  });
  await t.test('unproven new order is rejected without silently enqueuing unknown metadata',async()=>{await assert.rejects(store.enqueue('unknown',body('999')),{code:'WRITER_FIFO_ORDER_REQUIRED'});checks++;});
  await t.test('close refuses false drain during in-flight write; other bot remains writable',async()=>{
   let entered,release;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
   const writing=store.transaction(async c=>{await store.enqueueOn(c,'inflight',body('101'));entered();await gate;});await ready;
   try{await assert.rejects(change('close','3'),{code:'WRITER_FENCE_BUSY'});await other.enqueue('other-during-drain',body('101'));}finally{release();await writing;}
   assert.equal((await change('close','3')).epoch,'4');await assert.rejects(store.enqueue('closed',body('101')),{code:'WRITER_FENCE_CLOSED'});await other.enqueue('other-closed',body('101'));checks++;
  });
  await t.test('fresh Node process and DB connection still observe CLOSED after writer restart',async()=>{
   const code=`const mysql=require('mysql2/promise');let raw='';process.stdin.on('data',c=>raw+=c);process.stdin.on('end',async()=>{const x=JSON.parse(raw);process.env.HDWORK2_COURIER_WRITER_V2_BOTS_JSON='["bot-a"]';const pool=mysql.createPool({socketPath:x.pipe,user:'root',password:'',database:'hdwork2'});try{await new (require('./src/courier/mysql-store').MysqlStore)({pool,botId:'bot-a'}).enqueue('restarted',x.body);process.exitCode=1;}catch(e){console.log(e.code);if(e.code!=='WRITER_FENCE_CLOSED')process.exitCode=1;}finally{await pool.end();}});`;
   const child=spawn(process.execPath,['-e',code],{cwd:path.resolve(__dirname,'..'),windowsHide:true,stdio:['pipe','pipe','pipe'],env:f.env});let out='';child.stdout.on('data',c=>out+=c);child.stderr.resume();child.stdin.end(JSON.stringify({pipe:f.socketPath,body:body('101')}));assert.equal(await new Promise(r=>child.once('exit',r)),0);assert.equal(out.trim(),'WRITER_FENCE_CLOSED');checks++;
  });
  await t.test('stale epochs cannot reopen fence; repeated close is idempotent',async()=>{
   assert.equal((await change('close','4')).duplicate,true);await assert.rejects(change('open','3'),{code:'WRITER_FENCE_STALE_EPOCH'});await fence.assertClosed(pool,{botId:'bot-a',expectedEpoch:'4'});checks++;
  });
  await t.test('audit failure rolls open back; business rollback preserves lane and outbox',async()=>{
   await f.c.query("CREATE TRIGGER fixture_reject_fence BEFORE INSERT ON hd2_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic audit failure'");try{await assert.rejects(change('open','4'));}finally{await f.c.query('DROP TRIGGER fixture_reject_fence');}
   await fence.assertClosed(pool,{botId:'bot-a',expectedEpoch:'4'});await change('open','4');const key=require('../src/courier/fifo').conversation('bot-a',body('101'));
   const next=async()=>String((await pool.execute('SELECT next_seq FROM hd2_courier_lanes WHERE bot_id=? AND conversation_key=?',['bot-a',key]))[0][0].next_seq),before=await next();
   await assert.rejects(store.transaction(async c=>{await store.enqueueOn(c,'rolled-back',body('101'));throw Error('fixture rollback');}));assert.equal(await next(),before);const [[n]]=await pool.query("SELECT COUNT(*) AS n FROM hd2_courier_outbox WHERE idem_key='rolled-back'");assert.equal(n.n,0);await change('close','5');checks++;
  });
  await t.test('compatible rollback retains fence; all 18 DEAD rows stay byte-for-byte unchanged',async()=>{
   const rollback=new MysqlStore({pool,botId:'bot-a',fifo:false,fifoRelease:false,routeFence:false});await assert.rejects(rollback.enqueue('rollback-blocked',body('101')),{code:'WRITER_FENCE_CLOSED'});await other.enqueue('rollback-other',body('101'));assert.equal(await dead(),beforeDead);checks++;
  });
  await t.test('transaction with earlier repeatable-read snapshot still observes newly CLOSED fence',async()=>{
   await change('open','6');let started,release;const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r);
   const writing=store.transaction(async c=>{await c.query('SELECT COUNT(*) FROM hd2_audit');started();await gate;return store.enqueueOn(c,'old-snapshot',body('101'));});
   // Attach rejection handler before unblocking to avoid an unhandled rejection race.
   const rejected=assert.rejects(writing,{code:'WRITER_FENCE_CLOSED'});await ready;
   try{assert.equal((await change('close','7')).epoch,'8');}finally{release();}
   await rejected;await assert.rejects(fence.assertClosed(pool,{botId:'bot-a',expectedEpoch:'6'}),{code:'WRITER_FENCE_LOST'});assert.equal(await dead(),beforeDead);checks++;
  });
  await t.test('real claim advances only lane heads; pending predecessor blocks successor',async()=>{
   const heads=await store.claim(10);assert.equal(heads.length,2);
   for(const h of heads){const [[r]]=await pool.execute('SELECT conversation_seq FROM hd2_courier_outbox WHERE id=?',[h.delivery_id]);assert.equal(Number(r.conversation_seq),1);}
   assert.deepEqual(await store.claim(10),[]);
   const a=heads.find(h=>h.payload.reply_to_message_id==='101');assert.ok(a);
   await store.settle(a.delivery_id,{lease_token:a.lease_token,result:'sent',telegram_message_id:'9001'});
   const next=await store.claim(10);assert.equal(next.length,1);const [[r]]=await pool.execute('SELECT conversation_seq FROM hd2_courier_outbox WHERE id=?',[next[0].delivery_id]);assert.equal(Number(r.conversation_seq),2);assert.equal(await dead(),beforeDead);checks++;
  });
  await t.test('existing chatWriteFifo privileges suffice for real web enqueue and fence control',async()=>{
   // These accounts/grants exist ONLY on this owned, TCP-disabled fixture server.
   const password=randomUUID();await f.c.query("CREATE USER 'hdwork_ops_write'@'localhost' IDENTIFIED BY ?",[password]);
   const {policies,reviewOperationalGrants}=require('../src/config/operational-grants');
   for(const [table,permissions] of Object.entries(policies.chatWriteFifo))await f.c.query('GRANT '+permissions.join(', ')+' ON hdwork2.`'+table+"` TO 'hdwork_ops_write'@'localhost'");
   // mysql2 otherwise assumes every socketPath is a secure Unix socket; on this
   // Windows pipe explicitly use the actual server's RSA password exchange.
   const limited=require('mysql2/promise').createPool({socketPath:f.socketPath,user:'hdwork_ops_write',password,database:'hdwork2',dateStrings:true,timezone:'Z',supportBigNumbers:true,bigNumberStrings:true,connectionLimit:2,authPlugins:{caching_sha2_password:require('mysql2').authPlugins.caching_sha2_password({overrideIsSecure:false})}});
   try{
    const [grants]=await limited.query('SHOW GRANTS FOR CURRENT_USER');assert.equal(reviewOperationalGrants(grants,'chatWriteFifo').ok,true);
    await fence.change(limited,{botId:'bot-a',action:'open',expectedEpoch:'8',operator:'Fixture',reason:'least privilege rehearsal',expectedAccount:'hdwork_ops_write@localhost'});
    const limitedChat=require('../src/chat/service').createChat({readPool:limited,writePool:limited,sharedGroups:false});
    await limitedChat.send(orderA,token,1,{requestId:randomUUID(),version:1,text:'least privilege web reply'});
    await fence.change(limited,{botId:'bot-a',action:'close',expectedEpoch:'9',operator:'Fixture',reason:'least privilege cutover',expectedAccount:'hdwork_ops_write@localhost'});
    await assert.rejects(limitedChat.send(orderA,token,1,{requestId:randomUUID(),version:1,text:'fenced limited writer'}),{code:'WRITER_FENCE_CLOSED'});
    await limitedChat.send((await pool.query("SELECT id FROM hd2_orders WHERE bot_id='bot-b'"))[0][0].id,token,1,{requestId:randomUUID(),version:1,text:'other bot still writable'});
    assert.equal(await dead(),beforeDead);checks++;
   }finally{await limited.end();}
  });
  await t.test('rollback verifier accepts retained guards and rejects legacy code or removed scope',async()=>{
   const rollback=require('../scripts/lib/courier-writer-rollback.cjs'),candidate=fs.mkdtempSync(path.join(f.root,'rollback-')),source=path.resolve(__dirname,'..');
   for(const file of rollback.RETAIN){const dest=path.join(candidate,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(source,file),dest);}
   const env={HDWORK2_COURIER_WRITER_V2_BOTS_JSON:'["bot-a"]'},args={currentSource:source,candidateSource:candidate,currentEnv:env,candidateEnv:{...env},botId:'bot-a',pool,expectedEpoch:'10'};
   assert.equal((await rollback.verify(args)).status,'COMPATIBLE_WRITER_ROLLBACK_VERIFIED');
   await assert.rejects(rollback.verify({...args,candidateEnv:{}}),/WRITER_ROLLBACK_SCOPE_CHANGED/);
   fs.writeFileSync(path.join(candidate,'src/courier/mysql-store.js'),'// legacy writer without fence\n');await assert.rejects(rollback.verify(args),/WRITER_ROLLBACK_GUARD_CHANGED/);
   assert.equal(await dead(),beforeDead);checks++;
  });
  assert.equal(checks,16,'All integration scenarios must pass before a PASS receipt is written');
  const result={status:'WRITER_V2_MYSQL_PASS',checks,fixture:f.root,tcpDisabled:true,productionAccessed:false,telegramCalls:0};fs.writeFileSync(path.join(f.root,'writer-v2-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{if(old===undefined)delete process.env.HDWORK2_COURIER_WRITER_V2_BOTS_JSON;else process.env.HDWORK2_COURIER_WRITER_V2_BOTS_JSON=old;await f.stop();}
});

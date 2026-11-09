const test=require('node:test'),assert=require('node:assert/strict');
const http=require('node:http'),{randomUUID}=require('node:crypto');
const {schemaStatements,approvedAccount,pickRace,runtime,childEnvironment,durationStats}=require('./helpers/e2e-contracts.cjs');
const {memory}=require('./helpers/auth-memory.cjs'),{fixture}=require('./helpers/operations-fixture.cjs');
const {seedTelegram}=require('./helpers/e2e-telegram-fixture.cjs'),{mockPool}=require('./helpers/courier-db');

test('all native runners reject default/production configuration before driver creation; SQL is parsed only',async()=>{
 let drivers=0;const driverFactory=()=>{drivers++;throw Error('Driver forbidden');};
 for(const [file,flag] of [['mysql-auth.cjs','--run-auth-disposable'],['mysql-operations.cjs','--run-operations-disposable'],['mysql-courier-integration.cjs','--run-courier-disposable']]){
  const {run}=require('./integration/'+file);
  await assert.rejects(run({env:{},argv:[],driverFactory}));
  await assert.rejects(run({env:{HDWORK2_MYSQL_TEST_ENABLE:'DISPOSABLE_ONLY',HDWORK2_MYSQL_TEST_DATABASE:'hdwork2',DB_PASSWORD:'forbidden'},argv:[flag],driverFactory}));
 }
 assert.equal(drivers,0);
 const statements=schemaStatements();assert.ok(statements.some(s=>s.includes('ADD COLUMN approval_status')));
 for(const sql of statements)assert.doesNotMatch(sql,/\bUSE\b|\bGRANT\b|hdwork2\.|hd_b2c\./i);
 assert.deepEqual(childEnvironment({PATH:'synthetic-path',DB_PASSWORD:'forbidden',JWT_SECRET:'forbidden',COURIER_TELEGRAM_BOT_TOKEN:'forbidden',NODE_OPTIONS:'forbidden',HTTP_PROXY:'forbidden'},{PYTHONPATH:'courier_bot'}),{PATH:'synthetic-path',PYTHONPATH:'courier_bot'});
});

test('offline integrated HTTP rehearsal: pending approval, Telegram ingestion, double CEK, completion, audit, feedback and revocation',async()=>{
 const ingestion=mockPool();
 ingestion.execute=async(sql,p)=>{assert.equal(sql,'SELECT id,status FROM hd2_orders WHERE bot_id=? AND message_id=?');return [ingestion.state.orders.filter(o=>o.bot_id===p[0]&&o.message_id===p[1])];};
 const orders=await seedTelegram(ingestion);
 assert.equal(ingestion.state.orders.length,4);assert.equal(ingestion.state.inbox.length,4);
 for(const order of orders)assert.equal(ingestion.state.orders.find(o=>o.id===order.id).sc_in,order.reference,'Fixture search must use the canonical parsed SC/IN');
 assert.ok(ingestion.state.orders.every(o=>o.command&&o.status==='WAITING'));
 const selected=orders.find(o=>o.module==='B2B');
 const {pool}=fixture();Object.assign(pool.state.order,ingestion.state.orders.find(o=>o.id===selected.id));
 const id=pool.state.order.id,authStore=memory();
 const env={HDWORK2_AUTH_V2:'true',HDWORK2_OPERATIONS_ENABLED:'true',HDWORK2_LOCAL_READ_ONLY:'false',HDWORK2_EDGE_AUTH_MODE:'application-session',DB_NAME:'hdwork2',JWT_SECRET:'synthetic-e2e-only-secret-000000000',FRONTEND_ORIGINS:'https://test.example.invalid'};
 const isolated=runtime(pool,env,{authStore}),service=isolated.h.service(),password='synthetic-e2e-password';
 const admin=await service.bootstrap({name:'Admin',username:'test.admin',password});
 const first=await approvedAccount(service,admin,{name:'First HD',username:'test.first',password,role:'HD',modules:['B2B'],is_active:true});
 const secondId=await service.manage(admin,null,{name:'Second HD',username:'test.second',password,role:'HD',modules:['B2B'],is_active:true});
 const adminSession=await service.login('test.admin',password);
 const server=http.createServer(isolated.createApp());await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const send=(url,who,body,csrf)=>fetch(base+url,{method:body===undefined?'GET':'POST',headers:{Origin:env.FRONTEND_ORIGINS,...(who?{Cookie:'__Host-hdwork2-session='+who.token}:{}),...(body===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf??(who?service.csrf(who.token):'')})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 try{
  assert.equal((await send('/ready')).status,503,'Injected runtime must never run live database readiness');
  assert.equal((await send('/api/auth/login',null,{username:'test.second',password})).status,401);
  assert.equal((await send('/api/admin/users/'+secondId+'/approve',first,{})).status,403);
  assert.equal((await send('/api/admin/users/'+secondId+'/approve',adminSession,{},'0'.repeat(64))).status,403);
  assert.equal((await send('/api/admin/users/'+secondId+'/approve',adminSession,{})).status,200);
  const second=await service.login('test.second',password);
  assert.equal((await send('/api/operations/orders',first,{requestId:randomUUID(),module:'B2B',reference:'forbidden',description:'forbidden'})).status,403);
  assert.equal(pool.state.order.status,'WAITING');
  const action=(who,body)=>send('/api/operations/orders/'+id+'/actions',who,body);
  const {winner}=await pickRace((i,body)=>action([first,second][i],body)),owner=[first,second][winner],other=[first,second][1-winner];
  assert.equal(pool.state.outbox.length,1);assert.equal(pool.state.audit.filter(p=>p[2]==='PICK').length,1);assert.equal(pool.state.audit.filter(p=>p[2]==='ACTION_REJECTED').length,1);
  let detail=await (await send('/api/operations/orders/'+id,owner)).json();assert.equal(detail.data.status,'IN_PROGRESS');assert.equal(detail.data.feedback.status,'ANTRE');
  assert.equal((await action(other,{requestId:randomUUID(),version:1,action:'DONE'})).status,409);
  assert.equal((await action(owner,{requestId:randomUUID(),version:1,action:'FAILED',note:'  '})).status,400);
  assert.equal((await action(owner,{requestId:randomUUID(),version:1,action:'DONE',note:'Checked'})).status,200);
  detail=await (await send('/api/operations/orders/'+id,owner)).json();assert.equal(detail.data.status,'DONE');assert.ok(detail.data.finishedAt);
  assert.equal((await action(owner,{requestId:randomUUID(),version:2,action:'REOPEN',confirm:true})).status,200);
  assert.equal((await action(owner,{requestId:randomUUID(),version:3,action:'FAILED',note:'  Port unavailable  '})).status,200);
  const audit=JSON.parse(pool.state.audit.at(-1)[6]),outbox=pool.state.outbox.at(-1);
  assert.equal(audit.outboxId,outbox.id);assert.ok(outbox.idem_key.endsWith(':'+audit.requestId));assert.equal(audit.note,'Port unavailable');
  assert.ok(JSON.parse(outbox.payload).text.includes('Port unavailable'));
  // Fake settlement metadata only; no transport is invoked.
  outbox.state='SENT';outbox.telegram_message_id='123';
  detail=await (await send('/api/operations/orders/'+id,owner)).json();assert.equal(detail.data.feedback.status,'TERKIRIM');
  outbox.state='DEAD';outbox.telegram_message_id=null;outbox.last_error_code='NETWORK';
  detail=await (await send('/api/operations/orders/'+id,owner)).json();assert.equal(detail.data.feedback.status,'TIDAK_PASTI');
  const seconds=(Date.parse(detail.data.finishedAt)-Date.parse(detail.data.startedAt))/1000;
  durationStats({done:0,failed:1,durationCount:1,durationSeconds:seconds,averageDurationSeconds:seconds});assert.equal(seconds,126900);
  assert.equal((await send('/api/auth/change-password',owner,{currentPassword:password,password:'replacement-e2e-password'})).status,200);
  assert.equal((await send('/api/auth/me',owner)).status,401);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
 assert.equal(require.cache[require.resolve('../src/config/database')],undefined);
 assert.equal(require.cache[require.resolve('../src/config/operational-pools')],undefined);
 assert.equal(require.cache[require.resolve('mysql2/promise')],undefined);
});

const test=require('node:test'),assert=require('node:assert/strict');
const {MysqlStore}=require('../src/courier/mysql-store');
const {mockPool}=require('./helpers/courier-db');
const {boundary}=require('../src/courier/activation-boundary');
const cutoff='2026-01-01T00:00:00.000Z',old='2025-12-31 23:59:59.999',fresh='2026-01-01 00:00:01.000';
const secretRoot=require('node:path').resolve(__dirname,'..');
const payload={method:'sendMessage',chat_id:'-100123',telegram_thread_id:null,thread_mode:'non_topic',reply_to_message_id:'10',text:'Synthetic new reply'};
function setup(){
 const pool=mockPool();
 const row=(id,state,created_at)=>({id,bot_id:'synthetic',state,created_at,attempts:0,due_ms:0,lease_until_ms:0,payload:JSON.stringify(payload)});
 for(let i=0;i<10;i++)pool.state.outbox.push(row('old-queued-'+i,'QUEUED',old));
 for(let i=0;i<3;i++)pool.state.outbox.push(row('old-dead-'+i,'DEAD',old));
 pool.state.outbox.push(row('old-sending','SENDING',old),row('at-boundary','QUEUED','2026-01-01 00:00:00.000'),row('new-queued','QUEUED',fresh));
 return {pool,store:new MysqlStore({pool,botId:'synthetic',activationBoundary:cutoff,now:()=>Date.parse(cutoff)+2000})};
}
test('fixed activation boundary leaves 10 QUEUED, 3 DEAD, legacy SENDING and equal-timestamp rows byte-for-byte unchanged',async()=>{
 const {pool,store}=setup(),legacy=structuredClone(pool.state.outbox.slice(0,-1));
 const [delivery]=await store.claim();assert.equal(delivery.delivery_id,'new-queued');
 assert.deepEqual(pool.state.outbox.slice(0,-1),legacy);
 const restarted=new MysqlStore({pool,botId:'synthetic',activationBoundary:cutoff,now:()=>Date.parse(cutoff)+3000});
 assert.deepEqual(await restarted.claim(),[]);
 await assert.rejects(restarted.settle('old-sending',{lease_token:'old',result:'sent',telegram_message_id:'42'}),{statusCode:409});
 assert.deepEqual(pool.state.outbox.slice(0,-1),legacy);
 await restarted.settle(delivery.delivery_id,{lease_token:delivery.lease_token,result:'sent',telegram_message_id:'43'});
 assert.equal(pool.state.outbox.at(-1).state,'SENT');
 assert.deepEqual(pool.state.outbox.slice(0,-1),legacy);
});
test('legacy inbox remains untouched and stale Telegram ingress is rejected before any transaction',async()=>{
 const {pool,store}=setup();store.orderedInbox=true;
 pool.state.inbox.push({id:'old-inbox',bot_id:'synthetic',state:'PENDING',created_at:old,attempts:0,due_ms:0});
 assert.equal(await store.processNext(()=>{throw Error('old event must not run');}),false);
 assert.equal(pool.state.inbox[0].state,'PENDING');
 const calls=pool.calls.length;
 const event={version:1,bot_id:'synthetic',update_id:'123',event:{kind:'message',chat_id:'-100123',message_id:'10',telegram_thread_id:null,sender_id:'9',reply_to_message_id:null,timestamp:Math.floor(Date.parse(cutoff)/1000),text:'Old synthetic message',attachments:[]}};
 await assert.rejects(store.accept(event),{statusCode:400});assert.equal(pool.calls.length,calls);
 event.event.timestamp+=1;assert.ok((await store.accept(event)).receipt_id);
});
test('activation boundary is explicit, UTC millisecond precision and calendar-valid',()=>{
 for(const v of ['',cutoff.replace('Z','+00:00'),'2026-02-30T00:00:00.000Z',Date.now()])assert.throws(()=>boundary(v));
 assert.equal(boundary(cutoff).sql,'2026-01-01 00:00:00.000');assert.equal(boundary(undefined),null);
});
const groups=[{chatId:'-100111',threadId:null,threadMode:'non_topic',profile:'TIAL1',commands:['order','req']},{chatId:'-100222',threadId:null,threadMode:'non_topic',profile:'TIAL2',commands:['order','req']},{chatId:'-100333',threadId:null,threadMode:'non_topic',profile:'SOLVER1',commands:['config_psb','mo']}];
const plan=()=>({version:1,environment:'production',secretRoot,telegramBotId:'123456789',botId:'synthetic-existing',botUsername:'SyntheticBot',port:3091,groups,activationNotBefore:cutoff,tokenDpapiFile:'.local/courier-secrets/token.dpapi',serviceKeyDpapiFile:'.local/courier-secrets/service.dpapi',identityKeyDpapiFile:'.local/courier-secrets/identity.dpapi',dbPasswordDpapiFile:'.local/courier-secrets/db.dpapi',journalDirectory:'/private/new-journal',sourceJournalDirectory:'/private/existing-journal',lockDirectory:'/private/existing-lock'});
test('production loader reuses existing identity and separates DB secrets from token; receive-only loader remains untouched',async()=>{
 const {load,validate}=require('../src/config/production-courier');
 const readSecret=async file=>file.endsWith('token.dpapi')?'123456789:'+'a'.repeat(35):file.endsWith('identity.dpapi')?'synthetic-identity-'.repeat(4):'synthetic-secret-'.repeat(4);
 const backend=await load(plan(),{kind:'backend',readSecret}),python=await load(plan(),{kind:'python',readSecret});
 assert.equal(backend.COURIER_OUTBOX_ENABLED,'true');assert.equal(backend.COURIER_ACTIVATION_NOT_BEFORE,cutoff);
 assert.equal(backend.COURIER_TELEGRAM_BOT_TOKEN,undefined);assert.equal(python.COURIER_DB_PASSWORD,undefined);assert.equal(python.COURIER_IDENTITY_KEY,undefined);
 assert.equal(python.COURIER_EXPECTED_TELEGRAM_BOT_ID,'123456789');assert.equal(python.COURIER_LOCK_DIR,plan().lockDirectory);
 await assert.rejects(load({...plan(),telegramBotId:'987654321'},{kind:'python',readSecret}),/TOKEN_BOT_ID/);
 assert.throws(()=>validate({...plan(),activationNotBefore:undefined}));assert.throws(()=>validate({...plan(),token:'forbidden'}));
});
test('production database routing rejects foreign or changed mappings before ingress/claim/poll configuration',async()=>{
 let current=structuredClone(groups);
 const policy=require('../src/system/routing').databasePolicy({system:{routing:async()=>current},botId:'synthetic-existing',botUsername:'SyntheticBot',chatEnabled:true,expectedGroups:groups});
 assert.deepEqual((await policy.configuration()).groups,current);
 current[0].chatId='-999999';await assert.rejects(policy.configuration(),/routing drift/);
 await assert.rejects(policy.outgoing(payload),/routing drift/);
});
test('production runner refuses startup without explicit deployment approval before loading any plan',async()=>{
 await assert.rejects(require('../scripts/run-production-live-chat-courier').run([]),/EXPLICIT_PRODUCTION_DEPLOYMENT_APPROVAL/);
});
test('chat settlement emits one module-scoped live event, with duplicate ACK and isolated legacy rows emitting none',async()=>{
 const {pool,store}=setup();store.chatDeliveryEvents=true;
 const [delivery]=await store.claim();
 const ack={lease_token:delivery.lease_token,result:'sent',telegram_message_id:'45'};
 await store.settle(delivery.delivery_id,ack);await store.settle(delivery.delivery_id,ack);
 const events=pool.calls.filter(sql=>sql.startsWith('INSERT INTO hd2_live_events'));
 assert.equal(events.length,1);assert.match(events[0],/SELECT DISTINCT o.access_module,'change'/);
 await assert.rejects(store.settle('old-sending',ack),{statusCode:409});
 assert.equal(pool.calls.filter(sql=>sql.startsWith('INSERT INTO hd2_live_events')).length,1);
});
test('production plan copies only existing protected refs and lock identity from matching verified routing',()=>{
 const {build}=require('../scripts/prepare-production-courier-plan');
 const p=plan(),sourcePlan={...p,journalDirectory:p.sourceJournalDirectory};
 const routingReview={version:1,environment:'production',newBotIsolationConfirmed:true,targets:groups.map(g=>({botId:p.botId,botUsername:p.botUsername,category:g.profile==='SOLVER1'?'LOGIC':'TIAL',profile:g.profile,chatId:g.chatId,threadId:null,verified:true,verifiedAt:'2020-01-01T00:00:00Z',verifiedBy:'fixture',evidence:'synthetic only'}))};
 const verification={status:'ROUTING_VERIFIED_NO_MESSAGES',webhookConfigured:false,telegramBotId:p.telegramBotId,botUsername:p.botUsername,internalBotId:p.botId,groups:groups.map(g=>({...g,status:'PASS'}))};
 const args={sourcePlan,routingReview,verification,activationNotBefore:cutoff,journalDirectory:p.journalDirectory};
 const result=build(args);assert.equal(result.lockDirectory,p.lockDirectory);assert.equal(result.sourceJournalDirectory,p.sourceJournalDirectory);assert.equal(result.tokenDpapiFile,p.tokenDpapiFile);assert.equal(result.journalDirectory,p.journalDirectory);
 assert.throws(()=>build({...args,verification:{...verification,internalBotId:'different'}}));
 assert.throws(()=>build({...args,sourcePlan:{...sourcePlan,token:'forbidden'}}));
});
test('reviewed trial transition changes only feature flags and preserves original scope and writer approvals',()=>{
 const env={...require('../src/config/office-web').officeEnvironment({local:true}),HDWORK2_SERVICE_AUTH_APPROVED:'true',HDWORK2_SERVICE_AUTH_POLICY:'operational-write',HDWORK2_LOCAL_READ_ONLY:'false',HDWORK2_AUTH_WRITE_ENABLED:'true',OP_WRITE_ENABLED:'true',HDWORK2_OPERATIONAL_WRITE_APPROVED:'true',OP_WRITE_DB_USER:'hdwork_ops_write',OP_WRITE_DB_NAME:'hdwork2',OP_WRITE_DB_HOST:'127.0.0.1',OP_WRITE_DB_PORT:'3306',B2C_COMMAND_SCHEMA_READY:'true',HDWORK2_PUBLIC_ORIGIN:'https://hdwork2.yoloo.space',FRONTEND_ORIGINS:'https://hdwork2.yoloo.space',HDWORK2_TESTING_SOLVER_ENABLED:'true',HDWORK2_TESTING_SOLVER_SCOPE:JSON.stringify({username:'trial_yanto',userId:123,chatId:'-5436357946',botId:'hdworkopsbot-testing',threadId:null,botUsername:'HDWorkOpsBot',chatVerified:true,expiresAt:'2099-01-01T00:00:00.000Z'})};
 const before=structuredClone(env),routingReview={version:1,environment:'production',newBotIsolationConfirmed:true,targets:groups.map(g=>({botId:'hdworkopsbot-testing',botUsername:'HDWorkOpsBot',category:g.profile==='SOLVER1'?'LOGIC':'TIAL',profile:g.profile,chatId:g.chatId,threadId:null,verified:true,verifiedAt:'2020-01-01T00:00:00Z',verifiedBy:'fixture',evidence:'synthetic only'}))};
 const {transition}=require('../src/config/live-chat-transition');
 assert.throws(()=>transition(env,routingReview),/ACTIVE_TRIAL_BOT_COLLISION/);
 const result=transition(env,routingReview,{disableTrial:true});
 assert.deepEqual(result.patch,{HDWORK2_SYSTEM_MONITORING_ENABLED:'true',HDWORK2_LIVE_CHAT_ENABLED:'true',HDWORK2_TESTING_SOLVER_ENABLED:'false'});
 assert.equal(result.candidate.HDWORK2_TESTING_SOLVER_SCOPE,env.HDWORK2_TESTING_SOLVER_SCOPE);assert.equal(result.candidate.OP_WRITE_ENABLED,env.OP_WRITE_ENABLED);assert.deepEqual(env,before);
 assert.throws(()=>transition(env,null,{disableTrial:true}),/VERIFIED_ROUTING/);
});
test('a staged snapshot can read only an explicitly reviewed existing secret root; default root restriction remains',async()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
 const {readPrivateDpapi}=require('../src/config/private-database-env');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-courier-secrets-'));
 try{
  const folder=path.join(root,'.local/courier-secrets');fs.mkdirSync(folder,{recursive:true});const file=path.join(folder,'synthetic.dpapi');fs.writeFileSync(file,'synthetic-encrypted-fixture');
  let reads=0;const read=async()=>{reads++;return 'synthetic-private-value';};
  await assert.rejects(readPrivateDpapi(file,{read}));assert.equal(reads,0);
  assert.equal(await readPrivateDpapi(file,{read,allowedRoot:root}),'synthetic-private-value');assert.equal(reads,1);
  await assert.rejects(readPrivateDpapi(path.join(root,'outside.dpapi'),{read,allowedRoot:root}));assert.equal(reads,1);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const production=require('../src/config/production-courier'),{configuration}=require('../src/courier/integration-config');
const {policies,reviewOperationalGrants}=require('../src/config/operational-grants');
const plan=()=>({version:1,environment:'production',receiveOnly:true,routingMode:'database',secretRoot:path.resolve('synthetic-secrets'),telegramBotId:'123456789',botId:'synthetic-bot',botUsername:'SyntheticBot',port:3091,groups:[{chatId:'-1001',threadId:null,threadMode:'non_topic',profile:'ALL',commands:['order','req','config_psb','mo','assuren','b2b','replacement']}],activationNotBefore:'2026-01-01T00:00:00.000Z',tokenDpapiFile:'.local/courier-secrets/token.dpapi',serviceKeyDpapiFile:'.local/courier-secrets/service.dpapi',identityKeyDpapiFile:'.local/courier-secrets/identity.dpapi',dbPasswordDpapiFile:'.local/courier-secrets/db.dpapi',journalDirectory:path.resolve('synthetic-journal'),sourceJournalDirectory:path.resolve('synthetic-old-journal'),lockDirectory:path.resolve('synthetic-lock')});
const readSecret=async file=>file.endsWith('token.dpapi')?'123456789:'+'x'.repeat(35):file.endsWith('identity.dpapi')?'i'.repeat(40):'s'.repeat(40);
const rows=role=>Object.entries(policies[role]).map(([table,privileges])=>({Grant:`GRANT ${privileges.join(', ')} ON hdwork2.${table} TO synthetic`}));
test('production receive-only separates secrets and explicitly disables every sender/writer option',async()=>{
 const reads=[];const load=kind=>production.load(plan(),{kind,readSecret:file=>{reads.push(file);return readSecret(file);}});
 const backend=await load('backend');assert.ok(reads.every(f=>!f.endsWith('token.dpapi')));reads.length=0;
 const python=await load('python');assert.ok(reads.every(f=>!f.endsWith('identity.dpapi')&&!f.endsWith('db.dpapi')));
 for(const env of [backend,python]){assert.equal(env.COURIER_RECEIVE_ONLY,'true');assert.equal(env.COURIER_SEND_ENABLED,'false');assert.equal(env.COURIER_OUTBOX_ENABLED,'false');assert.equal(env.HDWORK2_COURIER_FIFO_ENABLED,'false');assert.equal(env.COURIER_FIFO_ACK_ENABLED,'false');assert.equal(env.HDWORK2_COURIER_WRITER_V2_BOTS_JSON,'[]');}
 assert.equal(python.COURIER_POLL_ENABLED,'true');assert.equal(backend.COURIER_TELEGRAM_BOT_TOKEN,undefined);assert.equal(python.COURIER_DB_PASSWORD,undefined);configuration(backend);
});
test('receive-only rejects sender plan options and malformed opt-in before reading credentials',async()=>{
 for(const extra of [{receiveOnly:false},{receiveOnly:'true'},{deliveryMode:'fifo-ack-v2'},{fifoRelease:true},{adaptiveScheduler:true},{separateIo:true},{telegramLimits:{groupPerMinute:18,globalPerSecond:1}}]){
  await assert.rejects(production.load({...plan(),...extra},{kind:'backend',readSecret:()=>{throw Error('MUST_NOT_READ');}}),/RECEIVE_ONLY/);
 }
});
test('backend rejects runtime sender contamination before database creation',async()=>{
 const env=await production.load(plan(),{kind:'backend',readSecret});
 for(const patch of [{COURIER_RECEIVE_ONLY:'yes'},{COURIER_OUTBOX_ENABLED:'true'},{COURIER_SEND_ENABLED:'true'},{COURIER_SEND_ENABLED:undefined},{COURIER_FIFO_ACK_ENABLED:'true'},{COURIER_ADAPTIVE_SCHEDULER_ENABLED:'true'},{COURIER_SEPARATE_IO_ENABLED:'true'},{HDWORK2_COURIER_FIFO_ENABLED:'true'},{HDWORK2_COURIER_FIFO_RELEASE_ENABLED:'true'},{HDWORK2_SYSTEM_ALERTS_APPROVED:'true'},{HDWORK2_COURIER_WRITER_V2_BOTS_JSON:'["synthetic-bot"]'}])assert.throws(()=>configuration({...env,...patch}));
});
test('receive-only exact grant policy rejects production sender/FIFO, broad privileges and missing grants',async()=>{
 const env=await production.load(plan(),{kind:'backend',readSecret});
 assert.equal(reviewOperationalGrants(rows('courierChat'),'courierChat').ok,true);
 for(const grants of [rows('courierSendChatFifo'),rows('courierChat').slice(1),[...rows('courierChat'),{Grant:'GRANT SELECT ON hdwork2.* TO synthetic'}]]){
  const events=[],pool={async query(sql){events.push(sql);return sql.startsWith('SELECT')?[[{db:'hdwork2',account:'hdwork_courier@localhost'}]]:[grants];},async end(){events.push('close');}};
  await assert.rejects(require('../courier-b2c-server').startIntegration({env,createPool:()=>pool}),{code:'COURIER_RECEIVE_ONLY_GRANTS_REJECTED'});
  assert.deepEqual(events,['SELECT DATABASE() AS db,CURRENT_USER() AS account','SHOW GRANTS FOR CURRENT_USER','close']);
 }
});
test('receive-only store cannot enqueue, claim, authorize or settle even with an overprivileged pool',async()=>{
 const pool=require('./helpers/courier-db').mockPool(),store=new (require('../src/courier/mysql-store').MysqlStore)({pool,botId:'synthetic-bot',env:{COURIER_RECEIVE_ONLY:'true'}});
 for(const call of [()=>store.enqueue('test',{}),()=>store.claim(),()=>store.authorizeDelivery('x',{}),()=>store.settle('x',{})])await assert.rejects(call(),{code:'COURIER_RECEIVE_ONLY'});
 assert.deepEqual(pool.calls,[]);
});
test('receive-only inbox commits a new order without writing outbox or touching writer fence',async()=>{
 const env=await production.load(plan(),{kind:'backend',readSecret}),config=configuration(env);
 const pool=require('./helpers/courier-db').mockPool(),get=pool.getConnection.bind(pool);let originalChatRecords=0;
 pool.getConnection=async()=>{const c=await get(),execute=c.execute.bind(c);c.execute=async(sql,p)=>{
  if(sql.startsWith('INSERT IGNORE INTO hd2_chat_messages')){originalChatRecords++;return [{affectedRows:1}];}
  if(/hd2_courier_outbox|hd2_courier_lanes/.test(sql))throw Error('OUTBOX_AND_FENCE_MUST_NOT_BE_TOUCHED');
  return execute(sql,p);
 };return c;};
 const store=new (require('../src/courier/mysql-store').MysqlStore)({pool,botId:plan().botId,env});
 const event={version:1,bot_id:plan().botId,update_id:'1',event:{kind:'message',chat_id:'-1001',message_id:'42',telegram_thread_id:null,sender_id:'9',reply_to_message_id:null,timestamp:1767225601,text:'/order\nSC/IN:X-AOi123\nNO INET:000123\nSN ONT:SN1\nSTO:ABC\nKETERANGAN:test\nNIK:SYNTHETIC',attachments:[]}};
 await store.accept(event);
 const worker=require('../src/b2c-workflow/workflow').createB2CProcessor({store,config:config.workflow});
 assert.equal(await worker.processNext(),true);assert.equal(pool.state.orders.length,1);assert.equal(pool.state.orders[0].message_id,'42');assert.equal(pool.state.inbox[0].state,'PROCESSED');assert.equal(originalChatRecords,1);assert.deepEqual(pool.state.outbox,[]);
});
async function launcher(p,event){
 const module={exports:{}},events=[],handlers={},child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.exitCode=null;
 child.stdin.end=value=>{assert.equal(value,'STOP\n');events.push('stop-owned-child');queueMicrotask(()=>{child.exitCode=0;child.emit('exit',0);});};child.kill=()=>{throw Error('UNEXPECTED_KILL');};
 const file=path.resolve('synthetic-plan.json'),bytes=Buffer.from(JSON.stringify(p));
 const deps={
  'node:fs':{lstatSync:()=>({isFile:()=>true,isSymbolicLink:()=>false,nlink:1,size:bytes.length}),realpathSync:p=>p,readFileSync:()=>bytes},'node:path':path,'node:crypto':require('node:crypto'),
  '../src/config/operator-json':require('../src/config/operator-json'),
  '../src/config/production-courier':{validate:production.validate,load:(plan,options)=>production.load(plan,{...options,readSecret})},
  '../src/config/private-courier-env':require('../src/config/private-courier-env'),
  '../src/observability/raw-log':{logger:()=>({emit(){}})},
  '../courier-b2c-server':{async startIntegration({env,deferInboxWorker}){assert.equal(deferInboxWorker,true);assert.equal(env.COURIER_OUTBOX_ENABLED,p.receiveOnly?'false':'true');events.push('backend-start');return {startWorker(){events.push('worker-start');},async close(){events.push('backend-close');}};}},
  'node:child_process':{spawn(_exe,_args,options){assert.equal(options.windowsHide,true);assert.equal(options.env.COURIER_SEND_ENABLED,p.receiveOnly?'false':'true');assert.equal(options.env.DB_PASSWORD,undefined);assert.equal(options.env.COURIER_DB_PASSWORD,undefined);events.push('spawn');queueMicrotask(()=>child.stdout.emit('data',Buffer.from(JSON.stringify(event)+'\n')));return child;}}
 };
 const mocked=name=>{if(!Object.hasOwn(deps,name))throw Error('UNEXPECTED_DEPENDENCY '+name);return deps[name];};mocked.main={};
 vm.runInNewContext(fs.readFileSync('scripts/run-production-live-chat-courier.js','utf8'),{module,require:mocked,__dirname:path.resolve('scripts'),process:{env:{COURIER_SEND_ENABLED:'true',DB_PASSWORD:'must-not-inherit'},once:(name,fn)=>handlers[name]=fn},console:{log(value){const report=JSON.parse(value);assert.equal(report.send,!p.receiveOnly);queueMicrotask(()=>handlers.SIGTERM());}},Buffer,setTimeout,clearTimeout});
 try{await module.exports.run(['--run-production-approved','--plan',file]);return events;}catch(error){error.events=events;throw error;}
}
test('launcher accepts receive-only READY only after verified identity and starts inbox worker',async()=>{
 assert.deepEqual(await launcher(plan(),{event:'READY',productionIdentityVerified:true,send:false}),['backend-start','spawn','worker-start','stop-owned-child','backend-close']);
});
test('launcher refuses sender READY or unverified identity in receive-only and closes only owned runtime',async()=>{
 for(const event of [{event:'READY',productionIdentityVerified:true,send:true},{event:'READY',productionIdentityVerified:false,send:false}])await assert.rejects(launcher(plan(),event),error=>{assert.deepEqual(error.events,['backend-start','spawn','stop-owned-child','backend-close']);return /START_FAILED/.test(error.message);});
});
test('legacy sender mode still requires send=true READY',async()=>{
 const p=plan();delete p.receiveOnly;
 assert.ok((await launcher(p,{event:'READY',productionIdentityVerified:true,send:true})).includes('worker-start'));
 await assert.rejects(launcher(p,{event:'READY',productionIdentityVerified:true,send:false}),/START_FAILED/);
});

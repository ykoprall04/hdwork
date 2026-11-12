// Explicit Windows fixture instance: unique named pipe, TCP disabled, no runtime configuration.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto');
const mysql=require('mysql2/promise');
const {MysqlStore}=require('../src/courier/mysql-store'),{reviewRelease}=require('../src/courier/fifo-reconcile');
const {feedbackState}=require('../src/courier/delivery-state');
const root=path.resolve(__dirname,'..'),base='C:/Program Files/MySQL/MySQL Server 8.4';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 if(process.argv.slice(2).join(' ')!=='--temporary-only')throw Error('TEMPORARY_ONLY_REQUIRED');
 process.env.HDWORK2_RAW_LOG_ENABLED='false'; // Never use an inherited production log destination.
 const local=path.join(root,'.local');fs.mkdirSync(local,{recursive:true});
 const dir=fs.mkdtempSync(path.join(local,'fifo-release-test-')),data=path.join(dir,'data');
 const pipe='hdwork_fifo_release_'+randomBytes(12).toString('hex'),socketPath='\\\\.\\pipe\\'+pipe;
 const log=fs.openSync(path.join(dir,'server.log'),'wx');
 const env=Object.fromEntries(['SystemRoot','WINDIR','PATH','PATHEXT','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
 const launch=args=>spawn(path.join(base,'bin/mysqld.exe'),['--no-defaults',...args],{env,windowsHide:true,stdio:['ignore',log,log]});
 let server,c,pool;const checks={};let now=Date.UTC(2026,0,12);
 const store=()=>new MysqlStore({pool,botId:'fixture',fifo:true,fifoRelease:true,routeFence:false,activationBoundary:'2026-01-10T00:00:00.000Z',now:()=>now});
 try{
  await new Promise((resolve,reject)=>{const p=launch(['--initialize-insecure','--basedir='+base,'--datadir='+data]);p.once('error',reject);p.once('exit',n=>n===0?resolve():reject(Error('TEMP_INIT_FAILED')));});
  server=launch(['--standalone','--console','--basedir='+base,'--datadir='+data,'--skip-networking','--named-pipe','--socket='+pipe,'--mysqlx=OFF','--skip-log-bin','--innodb-buffer-pool-size=32M','--max-connections=10']);
  for(let i=0;i<60;i++){
   if(server.exitCode!==null)throw Error('TEMP_SERVER_STOPPED');
   try{c=await mysql.createConnection({socketPath,user:'root',dateStrings:true,timezone:'Z',connectTimeout:500});break;}catch{await wait(500);}
  }
  if(!c)throw Error('TEMP_SERVER_NOT_READY');
  const [[target]]=await c.query('SELECT @@datadir AS dir,@@skip_networking AS offline');
  assert.equal(path.resolve(target.dir).toLowerCase(),path.resolve(data).toLowerCase());assert.equal(Number(target.offline),1);
  await c.query('CREATE DATABASE hdwork2');
  for(const name of ['004_hdwork2_courier.sql','005_hdwork2_b2c_audit.sql','006_hdwork2_commands.sql','015_hdwork2_fifo_ack.review.sql','016_fifo_release.PLAN_ONLY.sql']){
   const sql=fs.readFileSync(path.join(root,'database/manual',name),'utf8').replace(/^--.*$/gm,'');
   for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await c.query(statement);
  }
  // Isolated subset of 008 required by audit rows; no legacy users table/data is imported.
  await c.query('ALTER TABLE hd2_audit MODIFY COLUMN inbox_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL');
  for(const file of ['01-preflight.readonly.sql','02-postflight.readonly.sql']){
   const statements=fs.readFileSync(path.join(root,'docs/courier-v2-fifo-release',file),'utf8').replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean);
   assert.ok(statements.every(sql=>/^(SELECT\b|SHOW\b|START TRANSACTION\b|ROLLBACK$)/i.test(sql)));
   for(const sql of statements){const [rows]=await c.query(sql);if(Array.isArray(rows))for(const row of rows)if(row.gate)assert.equal(row.gate,'PASS');}
  }
  checks.preflightPostflightReadOnlyScripts='PASS';
  pool=mysql.createPool({socketPath,user:'root',database:'hdwork2',connectionLimit:3,dateStrings:true,timezone:'Z'});
  const ids=[];
  for(let i=0;i<8;i++){
   const id=randomUUID(),historical=i<3,code=historical||i>5?'NETWORK':'BAD_REQUEST';ids.push(id);
   await c.execute("INSERT INTO hd2_courier_outbox(id,bot_id,idem_key,payload_hash,payload,state,attempts,last_error_code,due_ms,created_at) VALUES (?,'fixture',?,REPEAT('a',64),'{}','DEAD',?,?,0,?)",[id,'legacy-'+i,code==='NETWORK'?1:0,code,historical?'2026-01-09 00:00:00.000':'2026-01-11 00:00:00.000']);
  }
  const [legacyBefore]=await c.query("SELECT id,state,attempts,last_error_code,created_at FROM hd2_courier_outbox WHERE state='DEAD' ORDER BY id");
  async function order(chat,anchor,created='2026-01-12 00:00:00.000',originalTimestamp=Math.floor(Date.parse(created.replace(' ','T')+'Z')/1000)){
   const id=randomUUID();await c.execute("INSERT INTO hd2_orders(id,bot_id,module,business_day,chat_id,message_id,status,created_at,telegram_timestamp) VALUES (?,'fixture','TIAL','2026-01-12',?,?,'WAITING',?,?)",[id,chat,anchor,created,originalTimestamp]);
   return {method:'sendMessage',chat_id:chat,telegram_thread_id:null,thread_mode:'non_topic',reply_to_message_id:anchor,text:'SYNTHETIC'};
  }
  const old=await order('-1001','9','2026-01-01 00:00:00.000'),oldId=await store().enqueue('old-order-new-message',old);
  const lateIngested=await order('-1001','8','2026-01-12 00:00:00.000',Date.UTC(2026,0,1)/1000),lateIngestedId=await store().enqueue('late-ingested-old-anchor',lateIngested);
  assert.deepEqual(await store().claim(10),[]);checks.unknownLegacyHoldsUnprovenExistingOrder='PASS';
  checks.newDatabaseRowDoesNotBypassOldTelegramAnchor='PASS';
  const a=await order('-1001','10'),b=await order('-1001','11'),otherChat=await order('-1002','12');
  const a1=await store().enqueue('a1',a),a2=await store().enqueue('a2',a),b1=await store().enqueue('b1',b),c1=await store().enqueue('c1',otherChat);
  const first=await store().claim(10),jobs=new Map(first.map(r=>[r.delivery_id,r]));assert.deepEqual(new Set(jobs.keys()),new Set([a1,b1,c1]));
  await store().settle(a1,{lease_token:jobs.get(a1).lease_token,result:'failed',error_code:'NETWORK'});
  for(const id of [b1,c1])await store().settle(id,{lease_token:jobs.get(id).lease_token,result:'sent',telegram_message_id:'101'});
  assert.deepEqual(await store().claim(10),[]);checks.legacyFivePlusThreeDoNotBlockProvenNewOrders='PASS';checks.deadAAllowsOrderBEvenInSameChat='PASS';checks.sameOrderBlockedBeforeMarker='PASS';
  const review={botId:'fixture',id:a1,operator:'fixture-operator',reason:'EXPLICIT_UNCERTAIN_RELEASE_ACKNOWLEDGED'};
  const dry=await reviewRelease(pool,review);assert.equal(dry.dryRun,true);
  assert.deepEqual(await store().claim(10),[]);
  await reviewRelease(pool,{...review,dryRun:false,expected:dry.fingerprint});assert.equal((await reviewRelease(pool,{...review,dryRun:false,expected:dry.fingerprint})).duplicate,true);
  const [aNext]=await store().claim(10);assert.equal(aNext.delivery_id,a2);await store().settle(a2,{lease_token:aNext.lease_token,result:'sent',telegram_message_id:'102'});
  const [[aDead]]=await c.execute('SELECT state,attempts,fifo_release FROM hd2_courier_outbox WHERE id=?',[a1]);assert.equal(aDead.state,'DEAD');assert.equal(aDead.attempts,1);
  checks.markerSurvivesBackendRestart='PASS';checks.manualDryRunIdempotentMarkerOnly='PASS';checks.sameOrderProgressAfterManualMarker='PASS';
  const d=await order('-1001','14'),d1=await store().enqueue('d1',d),d2=await store().enqueue('d2',d);
  const [dj]=await store().claim(10);assert.equal(dj.delivery_id,d1);
  await store().settle(d1,{lease_token:dj.lease_token,result:'failed',error_code:'BAD_REQUEST',telegram_error:{source:'TELEGRAM_BOT_API',code:400,description:'Bad Request: chat not found',rejected:true}});
  const [[rejected]]=await c.execute('SELECT state,fifo_release,telegram_error FROM hd2_courier_outbox WHERE id=?',[d1]);assert.equal(rejected.state,'DEAD');assert.ok(rejected.fifo_release);assert.ok(rejected.telegram_error);
  const [[alert]]=await c.query("SELECT COUNT(*) AS n FROM hd2_audit WHERE action='COURIER_FIFO_AUTO_RELEASE_ALERT'");assert.equal(Number(alert.n),1);
  const [dNext]=await store().claim(10);assert.equal(dNext.delivery_id,d2);await store().settle(d2,{lease_token:dNext.lease_token,result:'sent',telegram_message_id:'103'});checks.confirmedTelegram400AutoMarkerAndAlert='PASS';
  const e=await order('-1003','15'),e1=await store().enqueue('e1',e);await store().enqueue('e2',e);
  const [ej]=await store().claim(10);assert.equal(ej.delivery_id,e1);await store().settle(e1,{lease_token:ej.lease_token,result:'failed',error_code:'BAD_REQUEST'});
  assert.deepEqual(await store().claim(10),[]);checks.localBadRequestNotAutomaticRelease='PASS';
  const f=await order('-1004','16'),f1=await store().enqueue('f1',f);await store().enqueue('f2',f);const [fj]=await store().claim(10);assert.equal(fj.delivery_id,f1);
  const failingPool={async getConnection(){const cn=await pool.getConnection(),execute=cn.execute.bind(cn);cn.execute=async(sql,...rest)=>{if(sql.includes("'COURIER_DELIVERY_ACK'"))throw Object.assign(Error('FIXTURE_ACK_FAILURE'),{code:'FIXTURE_ACK_FAILURE'});return execute(sql,...rest);};const release=cn.release.bind(cn);cn.release=()=>{cn.execute=execute;cn.release=release;release();};return cn;}};
  const failing=new MysqlStore({pool:failingPool,botId:'fixture',fifo:true,fifoRelease:true,routeFence:false,now:()=>now});
  await assert.rejects(failing.settle(f1,{lease_token:fj.lease_token,result:'failed',error_code:'NETWORK'}),{code:'FIXTURE_ACK_FAILURE'});
  now+=60001;assert.deepEqual(await store().claim(10),[]);
  const [[uncertain]]=await c.execute('SELECT state,last_error_code,lease_until_ms FROM hd2_courier_outbox WHERE id=?',[f1]);assert.equal(uncertain.state,'DEAD');assert.equal(feedbackState(uncertain),'TIDAK_PASTI');checks.failedAckAmbiguityNeverRequeued='PASS';
  await store().settle(f1,{lease_token:fj.lease_token,result:'retry',error_code:'RATE_LIMIT',retry_after:1});
  const [[notResurrected]]=await c.execute('SELECT state FROM hd2_courier_outbox WHERE id=?',[f1]);assert.equal(notResurrected.state,'DEAD');
  await assert.rejects(store().settle(f1,{lease_token:fj.lease_token,result:'sent',telegram_message_id:'999',reconciliation:true,evidence_sha256:'a'.repeat(64)}),{statusCode:409});checks.delayedAckCannotResurrectDeadOrOverrideReview='PASS';
  const g=await order('-2001','17'),gOther=await order('-2001','18'),h=await order('-2002','19');
  const g1=await store().enqueue('g1',g),g2=await store().enqueue('g2',gOther),h1=await store().enqueue('h1',h);
  const [hj]=await store().claim(10,{excludeChats:['-2001']});assert.equal(hj.delivery_id,h1);await store().settle(h1,{lease_token:hj.lease_token,result:'sent',telegram_message_id:'104'});
  const group=await store().claim(10);assert.deepEqual(new Set(group.map(r=>r.delivery_id)),new Set([g1,g2]));for(const job of group)await store().settle(job.delivery_id,{lease_token:job.lease_token,result:'sent',telegram_message_id:'105'});checks.perChatExclusionIndependentFromOrderLanes='PASS';
  for(const id of ids){const args={botId:'fixture',id,operator:'fixture-operator',reason:'LEGACY_HOLD_RELEASE_ACKNOWLEDGED'},r=await reviewRelease(pool,args);await reviewRelease(pool,{...args,dryRun:false,expected:r.fingerprint});}
  const [legacyAfter]=await c.query('SELECT id,state,attempts,last_error_code,created_at FROM hd2_courier_outbox WHERE id IN ('+ids.map(()=>'?').join(',')+') ORDER BY id',ids);assert.deepEqual(legacyAfter,legacyBefore);
  const oldNext=await store().claim(10);assert.deepEqual(new Set(oldNext.map(r=>r.delivery_id)),new Set([oldId,lateIngestedId]));for(const job of oldNext)await store().settle(job.delivery_id,{lease_token:job.lease_token,result:'sent',telegram_message_id:'106'});checks.legacyReleaseRequiresExplicitMarkerPerId='PASS';checks.allEightLegacyStatesAttemptsErrorsUnchanged='PASS';
  await reviewRelease(pool,{...review,operator:'late-reviewer',reason:'LATE_EXTERNAL_DELIVERY_ATTESTED',late:true,dryRun:false,expected:dry.fingerprint});
  const [[late]]=await c.execute('SELECT state,fifo_release FROM hd2_courier_outbox WHERE id=?',[a1]);const marker=typeof late.fifo_release==='string'?JSON.parse(late.fifo_release):late.fifo_release;assert.equal(marker.late,true);assert.equal(late.state,'DEAD');checks.manualLaterDeliveryIsMarkedLate='PASS';
  const unknown=await store().enqueue('unknown-identity',{...a,reply_to_message_id:null});assert.deepEqual(await store().claim(10),[]);
  const [[held]]=await c.execute('SELECT state,attempts,conversation_key,fifo_order_id FROM hd2_courier_outbox WHERE id=?',[unknown]);assert.equal(held.state,'QUEUED');assert.equal(held.attempts,0);assert.equal(held.conversation_key,null);assert.equal(held.fifo_order_id,null);checks.unknownIdentityNeverLeased='PASS';
  const [[audits]]=await c.query("SELECT COUNT(*) AS n FROM hd2_audit WHERE action='COURIER_FIFO_MANUAL_RELEASE'");assert.equal(Number(audits.n),9);checks.manualAuditExactlyOnce='PASS';
  const report={status:'FIFO_RELEASE_TEMPORARY_INTEGRATION_PASS',checks,productionAccessed:false,telegramCalls:0,tcpDisabled:true,temporaryDataPreserved:true};
  fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));
 }finally{
  if(pool)await pool.end();
  if(c){try{await c.query('SHUTDOWN');}catch{}await c.end().catch(()=>{});}
  if(server){for(let i=0;i<30&&server.exitCode===null;i++)await wait(200);if(server.exitCode===null)server.kill();}
  fs.closeSync(log); // Preserve temporary data; never delete shared paths or touch installed services.
 }
}
if(require.main===module)main().catch(e=>{console.log(JSON.stringify({status:'FIFO_RELEASE_TEMPORARY_INTEGRATION_FAIL',code:e.code||e.name,productionAccessed:false}));process.exitCode=1;});

// Explicit manual maintenance or owned disposable rehearsal. Never imported by the app.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{spawn}=require('node:child_process'),{randomBytes}=require('node:crypto');
const b=require('./lib/hdwork2-backup.cjs');
const {reviewOperationalGrants,policies}=require('../src/config/operational-grants');
const backupDefault='.local/backups/20261109-153956/hdwork2.sql';
const modeFiles=['database/manual/010_hdwork2_account_approval.sql','ops/examples/hdwork2-feedback-read-grants.review.sql'];
const q=(c,sql,values)=>c.query({sql,timeout:15000},values);
function plan(){const contents=modeFiles.map(f=>fs.readFileSync(path.join(b.root,f),'utf8'));const sql=contents.map(text=>b.splitSql(text).map(b.clean).filter(Boolean));
 const expected=["USE hdwork2","ALTER TABLE users ADD COLUMN approval_status VARCHAR(20) NOT NULL DEFAULT 'APPROVED'","ALTER TABLE users ADD CONSTRAINT hd2_account_approval_status CHECK (approval_status IN ('PENDING','APPROVED'))"];
 if(JSON.stringify(sql[0])!==JSON.stringify(expected))throw b.fail('MIGRATION_CONTENT_REQUIRES_REVIEW');
 const grants=["GRANT SELECT (order_id,request_id,user_id) ON hdwork2.hd2_web_requests TO 'hdwork_ops_read'@'localhost'","GRANT SELECT (id,bot_id,idem_key,created_at,state,telegram_message_id,last_error_code,lease_until_ms) ON hdwork2.hd2_courier_outbox TO 'hdwork_ops_read'@'localhost'"];
 if(JSON.stringify(sql[1])!==JSON.stringify(grants))throw b.fail('GRANT_CONTENT_REQUIRES_REVIEW');
 return {migration:sql[0].slice(1),grants,sha256:b.hash(contents.join('\n'))};
}
async function target(c,expected){const [[r]]=await q(c,'SELECT DATABASE() AS db,CURRENT_USER() AS account,VERSION() AS version,@@port AS port,@@datadir AS datadir,@@server_uuid AS uuid');
 if(r.db!=='hdwork2'||r.account!=='root@localhost'||Number(r.port)!==expected.port||!/^8\.4\./.test(r.version))throw b.fail('MAINTENANCE_TARGET_REJECTED');
 if(expected.datadir&&(path.resolve(r.datadir).toLowerCase()!==path.resolve(expected.datadir).toLowerCase()||r.uuid!==expected.uuid))throw b.fail('DISPOSABLE_IDENTITY_REJECTED');return {database:r.db,port:Number(r.port),version:r.version,isolated:Boolean(expected.datadir)};
}
async function grants(c,user){if(!['hdwork_courier','hdwork_ops_read'].includes(user))throw b.fail('ACCOUNT_SCOPE_REJECTED');const [rows]=await q(c,"SHOW GRANTS FOR '"+user+"'@'localhost'");return rows;}
function grantDigest(rows){return b.hash(rows.map(r=>String(Object.values(r)[0])).sort().join('\n'));}
async function schema(c){const [cols]=await q(c,"SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='hdwork2' AND TABLE_NAME='users'");
 const col=cols.find(r=>r.COLUMN_NAME==='approval_status');if(col&&(col.COLUMN_TYPE!=='varchar(20)'||col.IS_NULLABLE!=='NO'||col.COLUMN_DEFAULT!=='APPROVED'))throw b.fail('EXISTING_APPROVAL_COLUMN_REQUIRES_REVIEW');
 const [checks]=await q(c,"SELECT t.TABLE_NAME,t.ENFORCED,k.CHECK_CLAUSE FROM information_schema.TABLE_CONSTRAINTS t JOIN information_schema.CHECK_CONSTRAINTS k ON k.CONSTRAINT_SCHEMA=t.CONSTRAINT_SCHEMA AND k.CONSTRAINT_NAME=t.CONSTRAINT_NAME WHERE t.CONSTRAINT_SCHEMA='hdwork2' AND t.CONSTRAINT_NAME='hd2_account_approval_status'");
 if(checks.length>1||checks.length&&(checks[0].TABLE_NAME!=='users'||checks[0].ENFORCED!=='YES'||checks[0].CHECK_CLAUSE.toLowerCase().replace(/\\'/g,"'").replace(/_(?:utf8mb[34]|utf8|ascii|latin1)|`|\s|[()]/g,'')!=="approval_statusin'pending','approved'"))throw b.fail('EXISTING_APPROVAL_CONSTRAINT_REQUIRES_REVIEW');
 if(checks.length&&!col)throw b.fail('APPROVAL_SCHEMA_INCONSISTENT');
 if(col){const [[invalid]]=await q(c,"SELECT COUNT(*) AS n FROM hdwork2.users WHERE approval_status IS NULL OR approval_status NOT IN ('PENDING','APPROVED')");if(Number(invalid.n))throw b.fail('EXISTING_APPROVAL_DATA_REQUIRES_REVIEW');}
 return {column:Boolean(col),constraint:Boolean(checks.length)};
}
async function snapshot(c,backup){const result={};for(const name of ['hd2_orders','users']){const t=backup.data[name],rows=await b.readRows(c,name,t);result[name]={count:rows.length,sha256:b.digest(rows,t),ids:rows.map(r=>String(r.id))};}return result;}
async function maintenance(c,backup,expected,{apply=false,onStage=()=>{}}={}){
 const reviewed=plan(),identity=await target(c,expected);
 // mysqldump serializes TIMESTAMP in UTC; compare using UTC without changing any other session.
 await q(c,"SET SESSION time_zone='+00:00'");
 const beforeSchema=await schema(c),before=await snapshot(c,backup);
 const [reader,courier]=await Promise.all([grants(c,'hdwork_ops_read'),grants(c,'hdwork_courier')]);
 const courierProfile=reviewOperationalGrants(courier,'courierSend').ok?'courierSend':reviewOperationalGrants(courier,'courier').ok?'courier':null;
 if(!courierProfile)throw b.fail('COURIER_GRANTS_REQUIRE_REVIEW');
 const readReview=reviewOperationalGrants(reader,'read');
 const allowedMissing=['hd2_web_requests:SELECT (order_id, request_id, user_id)','hd2_courier_outbox:SELECT (bot_id, created_at, id, idem_key, last_error_code, lease_until_ms, state, telegram_message_id)'];
 if(readReview.unsafe||readReview.missing.some(x=>!allowedMissing.includes(x)))throw b.fail('READER_GRANTS_REQUIRE_REVIEW');
 const summary={target:identity,planSha256:reviewed.sha256,beforeSchema,readerMissing:readReview.missing,courierProfile,courierPreserved:true,orderCount:before.hd2_orders.count,userCount:before.users.count,writesPerformed:false};
 if(!apply)return {status:'INSPECTED_NO_WRITES',...summary};
 // Bound metadata-lock waiting in this connection; never change runtime/session settings elsewhere.
 await q(c,'SET SESSION lock_wait_timeout=5');
 const [[lock]]=await q(c,"SELECT GET_LOCK('hdwork2-release-010',0) AS acquired");if(Number(lock.acquired)!==1)throw b.fail('MAINTENANCE_ALREADY_RUNNING');
 try{
  // Repeat the guards under the maintenance lock; no application account/data DML is performed.
  const current=await schema(c);if(JSON.stringify(current)!==JSON.stringify(beforeSchema))throw b.fail('SCHEMA_CHANGED_DURING_PREFLIGHT');
  const unchanged=await snapshot(c,backup);if(unchanged.hd2_orders.sha256!==before.hd2_orders.sha256||unchanged.users.sha256!==before.users.sha256)throw b.fail('DATA_CHANGED_DURING_PREFLIGHT');
  for(const [i,needed] of [!current.column,!current.constraint].entries())if(needed){onStage(i===0?'ADD_APPROVAL_COLUMN':'ADD_APPROVAL_CONSTRAINT');await q(c,reviewed.migration[i]);summary.writesPerformed=true;}
  for(let i=0;i<allowedMissing.length;i++)if(readReview.missing.includes(allowedMissing[i])){onStage('ADD_READER_METADATA_GRANT_'+(i+1));await q(c,reviewed.grants[i]);summary.writesPerformed=true;}
  const afterSchema=await schema(c);if(!afterSchema.column||!afterSchema.constraint)throw b.fail('APPROVAL_POSTCHECK_FAILED');
  const after=await snapshot(c,backup);for(const name of ['hd2_orders','users'])if(after[name].count!==before[name].count||after[name].sha256!==before[name].sha256)throw b.fail('DATA_CHANGED_POSTCHECK_'+name.toUpperCase());
  if(!beforeSchema.column){const [rows]=await q(c,'SELECT id,approval_status FROM hdwork2.users');const approved=new Set(rows.filter(r=>r.approval_status==='APPROVED').map(r=>String(r.id)));if(before.users.ids.some(id=>!approved.has(id)))throw b.fail('EXISTING_ACCOUNT_APPROVAL_POSTCHECK_FAILED');}
  if(grantDigest(courier)!==grantDigest(await grants(c,'hdwork_courier')))throw b.fail('COURIER_GRANTS_CHANGED');
  if(!reviewOperationalGrants(await grants(c,'hdwork_ops_read'),'read').ok)throw b.fail('READER_GRANTS_POSTCHECK_FAILED');
  return {status:'PASS',...summary,afterSchema,orderDataPreserved:true,existingUserFieldsPreserved:true,readerPolicyPass:true};
 }finally{await q(c,"SELECT RELEASE_LOCK('hdwork2-release-010')").catch(()=>{});}
}
function environment(){const env={};for(const k of ['SystemRoot','WINDIR','PATH','Path','PATHEXT','TEMP','TMP','COMSPEC','USERPROFILE','LOCALAPPDATA'])if(process.env[k])env[k]=process.env[k];return env;}
function launch(exe,args,log){const p=spawn(exe,args,{cwd:b.root,windowsHide:true,env:environment(),stdio:['ignore',log,log]});const done=new Promise((resolve,reject)=>{p.once('error',reject);p.once('exit',resolve);});done.catch(()=>{});return {p,done};}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function alive(pid){if(!pid)return false;try{process.kill(pid,0);return true;}catch(e){return e.code!=='ESRCH';}}
async function ownedServerPid(launcherPid,serverPid,exe){
 if(!Number.isSafeInteger(serverPid)||serverPid<1)return false;
 if(serverPid===launcherPid)return true;
 // MySQL 8.4 on Windows starts a child server; validate parentage, not PID equality.
 const command="$p=Get-CimInstance Win32_Process -Filter 'ProcessId="+serverPid+"';if($p){$p|Select-Object ProcessId,ParentProcessId,ExecutablePath|ConvertTo-Json -Compress}";
 const ps=path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
 return new Promise(resolve=>{let output='';const child=spawn(ps,['-NoLogo','-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,env:environment(),stdio:['ignore','pipe','ignore']});const timer=setTimeout(()=>{child.kill();resolve(false);},10000);child.stdout.on('data',x=>{output+=x;if(output.length>4096)child.kill();});child.once('error',()=>{clearTimeout(timer);resolve(false);});child.once('exit',code=>{clearTimeout(timer);try{const p=JSON.parse(output);resolve(code===0&&Number(p.ProcessId)===serverPid&&Number(p.ParentProcessId)===launcherPid&&path.resolve(p.ExecutablePath).toLowerCase()===path.resolve(exe).toLowerCase());}catch{resolve(false);}});});
}

async function rehearsal(input,report,save){
 const backup=b.loadBackup(input.backupFile||backupDefault),reviewed=plan(),dir=b.privatePath(input.reportDirectory);
 if(!/^restore-rehearsal-[a-f0-9]{32}$/.test(path.basename(dir)))throw b.fail('REHEARSAL_DIRECTORY_REJECTED');
 const base='C:/Program Files/MySQL/MySQL Server 8.4',exe=path.join(base,'bin/mysqld.exe'),port=13326,datadir=path.join(dir,'data'),pidfile=path.join(dir,'mysql.pid');
 if(!fs.existsSync(exe)||fs.existsSync(datadir))throw b.fail('DISPOSABLE_BINARY_OR_DIRECTORY_REJECTED');
 await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(b.fail('DISPOSABLE_PORT_BUSY')));s.listen(port,'127.0.0.1',()=>s.close(resolve));});
 const log=fs.openSync(path.join(dir,'mysql-private.log'),'wx');let child,c,serverPid,ownVerified=false;
 Object.assign(report,{backupSha256:backup.sha256,planSha256:reviewed.sha256,port,isolated:true,activeDatabaseAccessed:false,sourceBackupChanged:false});save();
 try{
  report.stage='INITIALIZE_PRIVATE_MYSQL';save();const init=launch(exe,['--no-defaults','--initialize-insecure','--basedir='+base,'--datadir='+datadir,'--log-error='+path.join(dir,'initialize.log')],log);if(await init.done!==0)throw b.fail('PRIVATE_INITIALIZE_FAILED');
  const auto=fs.readFileSync(path.join(datadir,'auto.cnf'),'utf8'),uuid=/server-uuid=([a-f0-9-]+)/i.exec(auto)?.[1];if(!uuid)throw b.fail('PRIVATE_UUID_MISSING');
  report.stage='START_PRIVATE_MYSQL';save();child=launch(exe,['--no-defaults','--standalone','--console','--basedir='+base,'--datadir='+datadir,'--pid-file='+pidfile,'--port='+port,'--bind-address=127.0.0.1','--mysqlx=OFF','--skip-log-bin','--event-scheduler=OFF','--performance-schema=OFF','--innodb-buffer-pool-size=32M','--max-connections=10','--partial-revokes=ON','--general-log=OFF','--slow-query-log=OFF','--log-error='+path.join(dir,'server.log')],log);
  report.launcherPid=child.p.pid;save();
  for(let i=0;i<120;i++){if(child.p.exitCode!==null)throw b.fail('PRIVATE_SERVER_EXITED');if(fs.existsSync(pidfile)){serverPid=Number(fs.readFileSync(pidfile,'utf8').trim());if(await ownedServerPid(child.p.pid,serverPid,exe))break;serverPid=null;}await delay(500);}
  if(!serverPid)throw b.fail('PRIVATE_SERVER_PID_NOT_VERIFIED');report.serverPid=serverPid;save();
  c=await require('mysql2/promise').createConnection({host:'127.0.0.1',port,user:'root',connectTimeout:5000,multipleStatements:false,dateStrings:true,supportBigNumbers:true,bigNumberStrings:true});
  const [[identity]]=await q(c,'SELECT @@port AS port,@@datadir AS datadir,@@server_uuid AS uuid');if(Number(identity.port)!==port||path.resolve(identity.datadir).toLowerCase()!==path.resolve(datadir).toLowerCase()||identity.uuid!==uuid)throw b.fail('PRIVATE_SERVER_IDENTITY_REJECTED');ownVerified=true;
  await q(c,"ALTER USER 'root'@'localhost' IDENTIFIED BY ?",[randomBytes(32).toString('base64url')]);
  report.stage='RESTORE_BACKUP';save();for(const statement of backup.statements)await q(c,statement);
  await q(c,'USE hdwork2');report.stage='VERIFY_RESTORED_DATA';save();report.restoredRows=await b.assertRestored(c,backup);report.restoredTableCount=Object.keys(report.restoredRows).length;
  // Accounts/grants are not in a database dump. Seed ONLY this disposable server.
  for(const user of ['hdwork_courier','hdwork_ops_read'])await q(c,"CREATE USER '"+user+"'@'localhost' IDENTIFIED BY ?",[randomBytes(32).toString('base64url')]);
  for(const [table,permissions] of Object.entries(policies.courierSend))await q(c,'GRANT '+permissions.join(', ')+' ON hdwork2.`'+table+"` TO 'hdwork_courier'@'localhost'");
  for(const [table,permissions] of Object.entries(policies.read))if(!['hd2_web_requests','hd2_courier_outbox'].includes(table))await q(c,'GRANT '+permissions.join(', ')+' ON hdwork2.`'+table+"` TO 'hdwork_ops_read'@'localhost'");
  const expected={port,datadir,uuid};report.stage='REHEARSE_MIGRATION_AND_TWO_GRANTS';save();report.migrationRehearsal=await maintenance(c,backup,expected,{apply:true,onStage:stage=>{report.stage=stage;save();}});
  report.stage='VERIFY_ALL_RESTORED_DATA_AFTER_MIGRATION';save();await b.assertRestored(c,backup);
  report.stage='VERIFY_IDEMPOTENT_RESUME';save();const replay=await maintenance(c,backup,expected,{apply:true});if(replay.writesPerformed)throw b.fail('REPLAY_WROTE_UNEXPECTEDLY');report.idempotentResumePass=true;report.status='PASS';
 }catch(e){
  if(c&&ownVerified)try{const [rows]=await q(c,"SELECT t.TABLE_NAME,t.ENFORCED,k.CHECK_CLAUSE FROM information_schema.TABLE_CONSTRAINTS t JOIN information_schema.CHECK_CONSTRAINTS k ON k.CONSTRAINT_SCHEMA=t.CONSTRAINT_SCHEMA AND k.CONSTRAINT_NAME=t.CONSTRAINT_NAME WHERE t.CONSTRAINT_SCHEMA='hdwork2' AND t.CONSTRAINT_NAME='hd2_account_approval_status'");report.constraintDiagnostics=rows;}catch{}
  throw e;
 }finally{
  report.stage=report.status==='PASS'?'SHUTDOWN_OWNED_PRIVATE_MYSQL':report.stage;save();
  if(c&&ownVerified)try{await q(c,'SHUTDOWN');}catch{/* a server shutdown can close the connection before acknowledgement */}
  if(c)await c.end().catch(()=>{});
  if(child&&child.p.exitCode===null){const exited=await Promise.race([child.done.then(()=>true),delay(10000).then(()=>false)]);if(!exited){child.p.kill();await Promise.race([child.done,delay(5000)]);report.forcedShutdown=true;}}
  if(serverPid&&alive(serverPid)&&child&&await ownedServerPid(child.p.pid,serverPid,exe)){process.kill(serverPid);report.forcedShutdown=true;await delay(1000);}
  report.privateServerStopped=(!child||!alive(child.p.pid))&&!alive(serverPid);report.cleanShutdown=report.privateServerStopped&&!report.forcedShutdown;
  fs.closeSync(log);if(report.status==='PASS'&&!report.cleanShutdown){report.status='BLOCKED';report.code='PRIVATE_SERVER_CLEANUP_INCOMPLETE';}save();
 }
}
async function input(){let text='';for await(const chunk of process.stdin){text+=chunk;if(text.length>16384)throw b.fail('INPUT_TOO_LARGE');}return JSON.parse(text);}
async function main(){const mode=process.argv.slice(2).join(' ');if(!['--restore-rehearsal','--inspect','--apply-confirmed'].includes(mode))throw b.fail('EXPLICIT_MODE_REQUIRED');
 const config=await input(),dir=b.privatePath(config.reportDirectory);const report={status:'RUNNING',stage:'PREFLIGHT',mode,startedAt:new Date().toISOString(),activeDatabaseWritesAttempted:false};const file=path.join(dir,'report.json');const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{mode:0o600});let c;
 try{
  save();if(mode==='--restore-rehearsal'){await rehearsal(config,report,save);}
  else{
   const backup=b.loadBackup(config.backupFile||backupDefault),reviewed=plan();
   if(mode==='--apply-confirmed'){
    const proof=JSON.parse(fs.readFileSync(b.privatePath(config.rehearsalReport),'utf8'));
    if(proof.status!=='PASS'||!proof.isolated||proof.activeDatabaseAccessed!==false||!proof.cleanShutdown||!proof.privateServerStopped||proof.restoredTableCount!==16||proof.backupSha256!==backup.sha256||proof.planSha256!==reviewed.sha256||!proof.idempotentResumePass||proof.migrationRehearsal?.status!=='PASS')throw b.fail('RESTORE_PROOF_REQUIRED');
   }
   if(typeof config.adminPassword!=='string'||!config.adminPassword)throw b.fail('ROOT_PASSWORD_REQUIRED');
   c=await require('mysql2/promise').createConnection({host:'127.0.0.1',port:3306,user:'root',password:config.adminPassword,database:'hdwork2',connectTimeout:5000,multipleStatements:false,dateStrings:true,supportBigNumbers:true,bigNumberStrings:true});config.adminPassword='';
   const result=await maintenance(c,backup,{port:3306},{apply:mode==='--apply-confirmed',onStage:stage=>{report.stage=stage;report.activeDatabaseWritesAttempted=true;save();}});Object.assign(report,result,{backupSha256:backup.sha256});
  }
 }catch(e){Object.assign(report,{status:'BLOCKED',code:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'RELEASE_ACTION_FAILED',partialChangesPossible:report.activeDatabaseWritesAttempted});process.exitCode=1;}
 finally{config.adminPassword='';if(c)await c.end().catch(()=>{});report.finishedAt=new Date().toISOString();save();}
 console.log(JSON.stringify({status:report.status,code:report.code,stage:report.stage,report:path.relative(b.root,file),isolated:report.isolated,restoredTableCount:report.restoredTableCount,cleanShutdown:report.cleanShutdown,orderDataPreserved:report.orderDataPreserved,activeDatabaseWritesAttempted:report.activeDatabaseWritesAttempted,partialChangesPossible:report.partialChangesPossible}));if(report.status==='BLOCKED')process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.log(JSON.stringify({status:'BLOCKED',code:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'RELEASE_PREFLIGHT_FAILED',activeDatabaseWritesAttempted:false}));process.exitCode=1;});
module.exports={plan,target,schema,maintenance,rehearsal};

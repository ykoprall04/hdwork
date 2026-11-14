// No credential discovery. Owner supplies an authenticated connection and an existing
// login-path (or the strictly offline fixture). Restore is ONLY to a proven owned fixture.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {sha,regular}=require('./courier-cutover.cjs');
const fail=code=>Object.assign(Error(code),{code});
function authArgs(auth){
 if(auth?.fixturePipe&&/^hdwork_admin_[a-f0-9]{24}$/.test(auth.fixturePipe))return ['--no-defaults','--no-login-paths','--protocol=PIPE','--socket='+auth.fixturePipe,'--user=root','--password='];
 if(auth?.loginPath&&/^[A-Za-z0-9_-]{1,64}$/.test(auth.loginPath))return ['--no-defaults','--login-path='+auth.loginPath];
 throw fail('OWNER_AUTHENTICATION_REQUIRED');
}
async function counts(c,tables){const result={};for(const t of tables){const [[r]]=await c.query('SELECT COUNT(*) AS n FROM `hdwork2`.`'+t+'`');result[t]=Number(r.n);}return result;}
async function scopedDigest(c,botId){
 const result={};
 for(const [table,key] of [['hd2_courier_outbox','id'],['hd2_courier_lanes','conversation_key']]){
  const [columns]=await c.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='hdwork2' AND TABLE_NAME=? ORDER BY ORDINAL_POSITION",[table]);
  if(!columns.length||columns.some(x=>!/^[a-z0-9_]+$/.test(x.COLUMN_NAME)))throw fail('BACKUP_SCOPE_COLUMNS_UNKNOWN');
  const object=columns.map(x=>"'"+x.COLUMN_NAME+"',`"+x.COLUMN_NAME+'`').join(',');
  const [rows]=await c.execute('SELECT SHA2(CAST(JSON_OBJECT('+object+') AS CHAR),256) AS digest FROM `hdwork2`.`'+table+'` WHERE bot_id=? ORDER BY `'+key+'`',[botId]);
  result[table]={count:rows.length,sha256:sha(JSON.stringify(rows))};
 }
 return result;
}
async function pairedBackup({directory,mysqlBin,python,source,auth,sourceOwnedDataDirectory,restore,sqliteSource,barrier,decisionId,allowlistSha256,assertQuiescent,scope}){
 if(!barrier?.fenceHeld||!barrier.writersQuiesced||!barrier.courierStopped||typeof assertQuiescent!=='function')throw fail('QUIESCENT_BACKUP_REQUIRED');
 if(!scope||!/^[a-z][a-z0-9_-]{1,63}$/.test(scope.botId||'')||!/^\d+$/.test(String(scope.fenceEpoch||'')))throw fail('EXPLICIT_BOT_BACKUP_SCOPE_REQUIRED');
 if(!path.isAbsolute(directory)||fs.existsSync(directory))throw fail('NEW_BACKUP_DIRECTORY_REQUIRED');
 if(process.platform==='win32')cp.execFileSync(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-File',path.resolve(__dirname,'../assert-private-directory.ps1'),'-Directory',path.dirname(directory)],{windowsHide:true,stdio:'pipe'});
 const [[owner]]=await restore.connection.query('SELECT @@datadir AS dir,@@skip_networking AS offline');
 if(!restore.ownedDataDirectory||path.resolve(owner.dir).toLowerCase()!==path.resolve(restore.ownedDataDirectory).toLowerCase()||Number(owner.offline)!==1||!restore.auth?.fixturePipe)throw fail('RESTORE_NOT_OWNED_OFFLINE_FIXTURE');
 const [existing]=await restore.connection.query("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='hdwork2'");if(existing.length)throw fail('RESTORE_DATABASE_MUST_BE_ABSENT');
 const [tables]=await source.query("SELECT TABLE_NAME AS name,ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA='hdwork2' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");
 if(!tables.length||tables.some(t=>!(t.name==='users'||/^hd2_[A-Za-z0-9_]+$/.test(t.name))||t.engine!=='InnoDB'))throw fail('BACKUP_TABLE_COVERAGE_OR_ENGINE_STOP');
 const verifyScope=async()=>{
  await assertQuiescent();const [[row]]=await source.execute('SELECT next_seq AS epoch FROM hd2_courier_lanes WHERE bot_id=? AND conversation_key=?',[scope.botId,require('../../src/courier/writer-fence').KEY]);
  if(!row||String(row.epoch)!==String(scope.fenceEpoch)||BigInt(row.epoch)%2n!==0n)throw fail('BACKUP_WRITER_FENCE_LOST');
 };
 await verifyScope();const before=await scopedDigest(source,scope.botId),startedAtUtc=new Date().toISOString();
 fs.mkdirSync(directory,{mode:0o700});const dump=path.join(directory,'mysql.sql'),sqlite=path.join(directory,'journal.sqlite3');
 // Keep the current user's MySQL login-path discoverable in child CLI tools.
 // The credential stays in the encrypted login-path file; only its standard
 // Windows lookup environment is inherited by mysqldump/mysql.
 const env=Object.fromEntries(['SystemRoot','WINDIR','PATH','PATHEXT','TEMP','TMP','APPDATA','USERPROFILE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
 function run(file,args,extra={}){try{return cp.execFileSync(file,args,{env,windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:60000,...extra});}catch{throw fail('BACKUP_OR_RESTORE_COMMAND_FAILED');}}
 const journalScript=path.resolve(__dirname,'../backup-courier-sqlite.py');
 const journalBefore=JSON.parse(run(python,['-B',journalScript,'--inspect-readonly',sqliteSource]).toString());
 for(const [connection,credentials,ownedDir] of [[source,auth,sourceOwnedDataDirectory],[restore.connection,restore.auth,restore.ownedDataDirectory]]){
  const [[identity]]=await connection.query('SELECT @@server_uuid AS uuid,@@datadir AS dir,@@skip_networking AS offline');
  if(credentials.fixturePipe&&(!ownedDir||path.resolve(identity.dir).toLowerCase()!==path.resolve(ownedDir).toLowerCase()||Number(identity.offline)!==1))throw fail('FIXTURE_SOURCE_NOT_OWNED_OFFLINE');
  const cliIdentity=run(path.join(mysqlBin,'mysql.exe'),[...authArgs(credentials),'--batch','--skip-column-names','--execute=SELECT @@server_uuid']).toString().trim();
  if(cliIdentity!==identity.uuid)throw fail('BACKUP_CLIENT_ENDPOINT_MISMATCH');
 }
 run(path.join(mysqlBin,'mysqldump.exe'),[...authArgs(auth),'--single-transaction','--quick','--skip-lock-tables','--no-tablespaces','--set-gtid-purged=OFF','--databases','hdwork2','--result-file='+dump]);
 const sqliteResult=JSON.parse(run(python,['-B',journalScript,sqliteSource,sqlite,path.join(directory,'restored.sqlite3')]).toString());
 await verifyScope();if(JSON.stringify(before)!==JSON.stringify(await scopedDigest(source,scope.botId)))throw fail('SCOPED_SOURCE_CHANGED_DURING_BACKUP');
 const fd=fs.openSync(dump,'r');try{run(path.join(mysqlBin,'mysql.exe'),authArgs(restore.auth),{stdio:[fd,'pipe','pipe']});}finally{fs.closeSync(fd);}
 const names=tables.map(t=>t.name),snapshotCounts=await counts(restore.connection,names);
 const [restoredTables]=await restore.connection.query("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA='hdwork2' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");
 if(JSON.stringify(restoredTables.map(x=>x.name))!==JSON.stringify(names))throw fail('RESTORED_TABLE_COVERAGE_MISMATCH');
 if(JSON.stringify(before)!==JSON.stringify(await scopedDigest(restore.connection,scope.botId)))throw fail('SCOPED_RESTORE_DIGEST_MISMATCH');
 for(const t of names){const [rows]=await restore.connection.query('CHECK TABLE `hdwork2`.`'+t+'`');if(!rows.some(r=>r.Msg_type==='status'&&r.Msg_text==='OK'))throw fail('MYSQL_RESTORE_INTEGRITY_FAILED');}
 await verifyScope();if(JSON.stringify(before)!==JSON.stringify(await scopedDigest(source,scope.botId)))throw fail('SCOPED_SOURCE_CHANGED_DURING_REHEARSAL');
 const journalAfter=JSON.parse(run(python,['-B',journalScript,'--inspect-readonly',sqliteSource]).toString());
 if(journalBefore.logicalDigest!==sqliteResult.logicalDigest||journalBefore.logicalDigest!==journalAfter.logicalDigest)throw fail('JOURNAL_CHANGED_DURING_PAIR');
 const receipt={kind:'HDWORK2_PAIRED_BACKUP_RECEIPT',barrierId:barrier.barrierId,decisionId,allowlistSha256,scope:{...scope,tables:['hd2_courier_outbox','hd2_courier_lanes'],digest:before},quiescenceScope:'BOT_OUTBOX_LANES_AND_JOURNAL',globalWritersQuiesced:false,automaticProductionRestoreAllowed:false,sameQuiescentInterval:true,restoreRehearsalVerified:true,startedAtUtc,completedAtUtc:new Date().toISOString(),mysql:{file:dump,sha256:sha(regular(dump)),integrityVerified:true,rowCounts:snapshotCounts,restoredRowCounts:snapshotCounts,rowCountsOrigin:'RESTORED_TRANSACTION_SNAPSHOT',tables:names},sqlite:{file:sqlite,...sqliteResult}};
 fs.writeFileSync(path.join(directory,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});return receipt;
}
module.exports={pairedBackup,authArgs,scopedDigest};

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
async function pairedBackup({directory,mysqlBin,python,source,auth,sourceOwnedDataDirectory,restore,sqliteSource,barrier,decisionId,allowlistSha256,assertQuiescent}){
 if(!barrier?.fenceHeld||!barrier.writersQuiesced||!barrier.courierStopped||typeof assertQuiescent!=='function')throw fail('QUIESCENT_BACKUP_REQUIRED');
 if(!path.isAbsolute(directory)||fs.existsSync(directory))throw fail('NEW_BACKUP_DIRECTORY_REQUIRED');
 // No restore connection may target a live server: compare its datadir to an
 // explicitly owned temporary directory and require TCP disabled before any DDL.
 const [[owner]]=await restore.connection.query('SELECT @@datadir AS dir,@@skip_networking AS offline');
 if(!restore.ownedDataDirectory||path.resolve(owner.dir).toLowerCase()!==path.resolve(restore.ownedDataDirectory).toLowerCase()||Number(owner.offline)!==1||!restore.auth?.fixturePipe)throw fail('RESTORE_NOT_OWNED_OFFLINE_FIXTURE');
 const [existing]=await restore.connection.query("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='hdwork2'");if(existing.length)throw fail('RESTORE_DATABASE_MUST_BE_ABSENT');
 const [tables]=await source.query("SELECT TABLE_NAME AS name,ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA='hdwork2' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");
 if(!tables.length||tables.some(t=>!/^hd2_[A-Za-z0-9_]+$/.test(t.name)||t.engine!=='InnoDB'))throw fail('BACKUP_TABLE_COVERAGE_OR_ENGINE_STOP');
 await assertQuiescent();const names=tables.map(t=>t.name),before=await counts(source,names),startedAtUtc=new Date().toISOString();
 fs.mkdirSync(directory,{mode:0o700});const dump=path.join(directory,'mysql.sql'),sqlite=path.join(directory,'journal.sqlite3');
 const env=Object.fromEntries(['SystemRoot','WINDIR','PATH','PATHEXT','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
 function run(file,args,extra={}){try{return cp.execFileSync(file,args,{env,windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:60000,...extra});}catch{throw fail('BACKUP_OR_RESTORE_COMMAND_FAILED');}}
 for(const [connection,credentials,ownedDir] of [[source,auth,sourceOwnedDataDirectory],[restore.connection,restore.auth,restore.ownedDataDirectory]]){
  const [[identity]]=await connection.query('SELECT @@server_uuid AS uuid,@@datadir AS dir,@@skip_networking AS offline');
  if(credentials.fixturePipe&&(!ownedDir||path.resolve(identity.dir).toLowerCase()!==path.resolve(ownedDir).toLowerCase()||Number(identity.offline)!==1))throw fail('FIXTURE_SOURCE_NOT_OWNED_OFFLINE');
  const cliIdentity=run(path.join(mysqlBin,'mysql.exe'),[...authArgs(credentials),'--batch','--skip-column-names','--execute=SELECT @@server_uuid']).toString().trim();
  if(cliIdentity!==identity.uuid)throw fail('BACKUP_CLIENT_ENDPOINT_MISMATCH');
 }
 run(path.join(mysqlBin,'mysqldump.exe'),[...authArgs(auth),'--single-transaction','--quick','--skip-lock-tables','--no-tablespaces','--set-gtid-purged=OFF','--databases','hdwork2','--result-file='+dump]);
 const sqliteResult=JSON.parse(run(python,['-B',path.resolve(__dirname,'../backup-courier-sqlite.py'),sqliteSource,sqlite,path.join(directory,'restored.sqlite3')]).toString());
 await assertQuiescent();if(JSON.stringify(before)!==JSON.stringify(await counts(source,names)))throw fail('SOURCE_CHANGED_DURING_BACKUP');
 const fd=fs.openSync(dump,'r');try{run(path.join(mysqlBin,'mysql.exe'),authArgs(restore.auth),{stdio:[fd,'pipe','pipe']});}finally{fs.closeSync(fd);}
 const after=await counts(restore.connection,names);if(JSON.stringify(before)!==JSON.stringify(after))throw fail('MYSQL_RESTORE_ROWCOUNT_MISMATCH');
 for(const t of names){const [rows]=await restore.connection.query('CHECK TABLE `hdwork2`.`'+t+'`');if(!rows.some(r=>r.Msg_type==='status'&&r.Msg_text==='OK'))throw fail('MYSQL_RESTORE_INTEGRITY_FAILED');}
 await assertQuiescent();
 const receipt={kind:'HDWORK2_PAIRED_BACKUP_RECEIPT',barrierId:barrier.barrierId,decisionId,allowlistSha256,sameQuiescentInterval:true,restoreRehearsalVerified:true,startedAtUtc,completedAtUtc:new Date().toISOString(),mysql:{file:dump,sha256:sha(regular(dump)),integrityVerified:true,rowCounts:before,restoredRowCounts:after,tables:names},sqlite:{file:sqlite,...sqliteResult}};
 fs.writeFileSync(path.join(directory,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});return receipt;
}
module.exports={pairedBackup,authArgs};

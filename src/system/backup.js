const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{createHash}=require('node:crypto'),{pipeline}=require('node:stream/promises');
// No restore implementation. No shell interpolation. No passwords in argv/logs.
function createBackup({directory,executable,connection,retentionDays=14,now=Date.now,createConnection=options=>require('mysql2/promise').createConnection(options)}){
 if(!path.isAbsolute(directory)||!path.isAbsolute(executable)||!['127.0.0.1','localhost'].includes(connection.host)||connection.database!=='hdwork2'||!Number.isInteger(retentionDays)||retentionDays<2||retentionDays>365||connection.user!=='hdwork_backup'||!connection.password)throw Error('BACKUP_CONFIGURATION_REJECTED');
 const root=path.resolve(directory),owned=name=>/^hdwork2-[a-f0-9-]{36}\.sql$/.test(name)?path.join(root,name):(()=>{throw Error('BACKUP_FILENAME_REJECTED');})();
 return {
  async dump(filename){const check=await createConnection({...connection,multipleStatements:false,connectTimeout:5000});try{await consistentSource(check);}finally{await check.end();}await fs.promises.mkdir(root,{recursive:true,mode:0o700});const destination=owned(filename),stream=fs.createWriteStream(destination,{flags:'wx',mode:0o600});
   const child=spawn(executable,['--no-defaults','--host='+connection.host,'--port='+connection.port,'--user='+connection.user,'--single-transaction','--quick','--skip-lock-tables','--routines=false','--triggers=false','--events=false','--set-gtid-purged=OFF','--no-tablespaces','--hex-blob','hdwork2'],{env:{...Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]])),MYSQL_PWD:connection.password},stdio:['ignore','pipe','ignore'],windowsHide:true});
   const timeout=setTimeout(()=>child.kill(),1800000);timeout.unref?.();
   const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('BACKUP_DUMP_FAILED')));});
   try{await Promise.all([pipeline(child.stdout,stream),done]);}catch{child.kill();throw Error('BACKUP_DUMP_FAILED');}finally{clearTimeout(timeout);}return destination;
  },
  async verify(filename){const file=owned(filename),stat=await fs.promises.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size<=0)throw Error('BACKUP_EMPTY');const digest=createHash('sha256');let trailer='';for await(const chunk of fs.createReadStream(file)){digest.update(chunk);trailer=(trailer+chunk.toString('utf8')).slice(-2048);}if(!/Dump completed on/.test(trailer))throw Error('BACKUP_INCOMPLETE');return {bytes:stat.size,sha256:digest.digest('hex')};},
  // Only delete files explicitly supplied from VERIFIED backup metadata. Unknown
  // files, failed/uncertain backups and preexisting operator backups are retained.
  async retain(verified=[]){for(const row of verified){if(row.state!=='VERIFIED'||now()-Date.parse(row.finished_at)<=retentionDays*86400000)continue;const file=owned(row.filename),stat=await fs.promises.lstat(file).catch(()=>null);if(stat?.isFile()&&!stat.isSymbolicLink())await fs.promises.unlink(file);}}
 };
}
async function consistentSource(connection){
 const [[target]]=await connection.query('SELECT DATABASE() AS db,CURRENT_USER() AS account');if(target.db!=='hdwork2'||target.account!=='hdwork_backup@localhost')throw Error('BACKUP_IDENTITY_REJECTED');
 const [grants]=await connection.query('SHOW GRANTS FOR CURRENT_USER');let databaseSelect=false;
 for(const row of grants){const value=String(Object.values(row)[0]);if(/WITH GRANT OPTION/i.test(value))throw Error('BACKUP_GRANTS_REJECTED');if(/^GRANT USAGE ON \*\.\* TO /i.test(value))continue;const match=/^GRANT (.+) ON `?hdwork2`?\.\* TO /i.exec(value);if(!match||/WITH GRANT OPTION/i.test(value)||match[1].split(', ').some(p=>!['SELECT','SHOW VIEW'].includes(p)))throw Error('BACKUP_GRANTS_REJECTED');if(match[1].split(', ').includes('SELECT'))databaseSelect=true;}
 if(!databaseSelect)throw Error('BACKUP_FULL_READ_REQUIRED');
 const [tables]=await connection.query("SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE'");if(!tables.some(t=>t.TABLE_NAME==='users')||!tables.some(t=>t.TABLE_NAME==='hd2_orders')||tables.some(t=>t.ENGINE!=='InnoDB'))throw Error('BACKUP_TRANSACTIONAL_SOURCE_REQUIRED');
}
module.exports={createBackup,consistentSource};

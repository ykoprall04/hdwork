// Explicit, separate worker; importing it never loads runtime credentials or starts jobs.
async function run(env=process.env,argv=process.argv.slice(2)){
 if(argv.length!==1||argv[0]!=='--run-approved'||env.HDWORK2_SYSTEM_WORKER_APPROVED!=='true'||env.HDWORK2_SYSTEM_MONITORING_ENABLED!=='true')throw Error('SYSTEM_WORKER_NOT_APPROVED');
 const pools=require('../src/config/operational-pools');require('../src/config/persistent-auth').validatePersistentAuth(env);await pools.initialize();const write=pools.getWritePool(),read=pools.getReadPool();
 try{
  let backup;
  if(env.HDWORK2_BACKUP_APPROVED==='true'){
   if(!env.HDWORK2_BACKUP_PASSWORD_DPAPI_FILE)throw Error('BACKUP_CREDENTIAL_REQUIRED');
   const password=await require('../src/config/private-database-env').readPrivateDpapi(env.HDWORK2_BACKUP_PASSWORD_DPAPI_FILE);
   backup=require('../src/system/backup').createBackup({directory:env.HDWORK2_BACKUP_DIRECTORY,executable:env.HDWORK2_MYSQLDUMP_EXECUTABLE,connection:{host:'127.0.0.1',port:3306,database:'hdwork2',user:env.HDWORK2_BACKUP_USER,password}});
  }
  const system=require('../src/system/store').createSystem({readPool:read,writePool:write});const runtime=require('../src/system/runtime').startSystemRuntime({env,system,pool:write,backup});
  return {async close(){await runtime.close();await pools.close();}};
 }catch(e){await pools.close();throw e;}
}
if(require.main===module)run().then(runtime=>{const close=()=>runtime.close().catch(()=>{process.exitCode=1;});process.once('SIGINT',close);process.once('SIGTERM',close);const keepAlive=setInterval(()=>{},60000);process.once('SIGINT',()=>clearInterval(keepAlive));process.once('SIGTERM',()=>clearInterval(keepAlive));}).catch(()=>{console.error('SYSTEM_WORKER_START_REJECTED');process.exitCode=1;});
module.exports={run};

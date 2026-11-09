const {startWorker,backupJob}=require('./resilience');
function startSystemRuntime({env=process.env,system,pool,backup,fetchImpl=fetch,report=code=>console.error(code)}={}){
 if(env.HDWORK2_SYSTEM_WORKER_APPROVED!=='true'||env.HDWORK2_SYSTEM_MONITORING_ENABLED!=='true'||!system||!pool)throw Error('SYSTEM_WORKER_NOT_APPROVED');
 const probe=require('./probes').createProbes({env,pool,fetchImpl});
 const journal=require('./journal').createJournal(env.HDWORK2_SYSTEM_JOURNAL_DIRECTORY||'');
 const withLease=async task=>{let c,owned=false;try{c=await pool.getConnection();const [[lease]]=await c.execute("SELECT GET_LOCK('hdwork2.system-monitor',0) AS acquired");if(Number(lease.acquired)!==1)return;owned=true;await journal.flush(system,env.COURIER_BOT_ID,env.HDWORK2_SYSTEM_ALERTS_APPROVED==='true');return await task();}catch{await journal.append();throw Error('MONITOR_PERSISTENCE_UNAVAILABLE');}finally{if(owned)await c.execute("SELECT RELEASE_LOCK('hdwork2.system-monitor')");c?.release();}};
 const worker=startWorker({system,probe,withLease,botId:env.COURIER_BOT_ID,alertsApproved:env.HDWORK2_SYSTEM_ALERTS_APPROVED==='true',report});
 let timer,closed=false,pending;
 async function backups(){if(closed||pending)return;pending=(async()=>{if(env.HDWORK2_BACKUP_APPROVED!=='true')return;if(!backup)throw Error('BACKUP_CONFIGURATION_REQUIRED');await backupJob({pool,dump:backup.dump,verify:backup.verify,retain:async c=>{const [rows]=await c.execute("SELECT filename,state,finished_at FROM hd2_system_jobs WHERE kind='BACKUP' AND state='VERIFIED'");await backup.retain(rows);},approved:true});})().catch(()=>report('BACKUP_REQUIRES_REVIEW')).finally(()=>{pending=null;if(!closed){timer=setTimeout(backups,60000);timer.unref?.();}});await pending;}
 timer=setTimeout(backups,0);timer.unref?.();return {async close(){closed=true;clearTimeout(timer);await worker.close();await pending;}};
}
module.exports={startSystemRuntime};

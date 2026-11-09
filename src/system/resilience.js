// Inert until explicitly started by an approved operator-owned process.
const {randomUUID}=require('node:crypto');
async function retry(task,{attempts=4,delay=ms=>new Promise(r=>setTimeout(r,ms)),report=()=>{}}={}){
 if(!Number.isInteger(attempts)||attempts<1||attempts>8)throw Error('Retry budget rejected');
 for(let i=0;i<attempts;i++){try{return await task();}catch{report('PROBE_RETRY');if(i===attempts-1)throw Error('PROBE_EXHAUSTED');await delay(Math.min(30000,1000*2**i));}}
}
function startWorker({system,probe,botId,alertsApproved=false,interval=30000,report=()=>{},withLease=fn=>fn()}){
 if(interval<1000)throw Error('Interval rejected');let closed=false,inFlight=null,timer;
 async function tick(){if(closed||inFlight)return;inFlight=withLease(async()=>{
  for(const component of ['api','mysql','tunnel']){
   if(closed)break;let status='UNKNOWN';
   if(probe[component])try{await retry(probe[component],{report});status='ONLINE';}catch{status='OFFLINE';}
   try{await system.report(component,status,status==='UNKNOWN'?'NO_PROBE_CONFIGURED':status==='ONLINE'?'PROBE_SUCCEEDED':'PROBE_EXHAUSTED');if(status==='OFFLINE'&&alertsApproved)await system.alert(botId,component.toUpperCase()+'_OFFLINE',{approved:true});}catch{report('MONITOR_PERSISTENCE_UNAVAILABLE');}
  }
  try{const state=await system.status({role:'SUPER_ADMIN'});for(const [component,status] of Object.entries(state.components)){if(['courier','queue'].includes(component)&&['OFFLINE','DEGRADED'].includes(status)&&alertsApproved)await system.alert(botId,component.toUpperCase()+'_'+status,{approved:true});}}catch{report('MONITOR_READ_UNAVAILABLE');}
 }).catch(()=>report('MONITOR_LEASE_UNAVAILABLE')).finally(()=>{inFlight=null;if(!closed){timer=setTimeout(tick,interval);timer.unref?.();}});await inFlight;}
 timer=setTimeout(tick,0);timer.unref?.();return {tick,async close(){closed=true;clearTimeout(timer);await inFlight;}};
}
async function backupJob({pool,dump,verify,retain,now=Date.now,approved=false}){
 if(!approved)throw Error('BACKUP_APPROVAL_REQUIRED');const window=Math.floor(now()/86400000),filename='hdwork2-'+randomUUID()+'.sql';
 const c=await pool.getConnection();let owned=false,locked=false;
 try{
  const [[lease]]=await c.execute("SELECT GET_LOCK('hdwork2.backup',0) AS acquired");if(Number(lease.acquired)!==1)return {started:false};locked=true;
  const [r]=await c.execute("INSERT IGNORE INTO hd2_system_jobs(kind,window_id,state,filename) VALUES ('BACKUP',?,'RUNNING',?)",[window,filename]);if(r.affectedRows!==1)return {started:false};owned=true;
  const result=await dump(filename),checked=await verify(filename,result);if(!checked||!Number.isSafeInteger(checked.bytes)||checked.bytes<=0||! /^[a-f0-9]{64}$/.test(checked.sha256))throw Error('BACKUP_VERIFICATION_FAILED');
  await c.execute("UPDATE hd2_system_jobs SET state='VERIFIED',bytes=?,sha256=?,code='BACKUP_VERIFIED',finished_at=UTC_TIMESTAMP(3) WHERE kind='BACKUP' AND window_id=?",[checked.bytes,checked.sha256,window]);
  await retain(c);return {started:true,status:'VERIFIED',...checked};
 }catch{if(owned)await c.execute("UPDATE hd2_system_jobs SET state='FAILED',code='BACKUP_REQUIRES_REVIEW',finished_at=UTC_TIMESTAMP(3) WHERE kind='BACKUP' AND window_id=?",[window]);throw Error('BACKUP_REQUIRES_REVIEW');}finally{if(locked)await c.execute("SELECT RELEASE_LOCK('hdwork2.backup')");c.release();}
}
module.exports={retry,startWorker,backupJob};

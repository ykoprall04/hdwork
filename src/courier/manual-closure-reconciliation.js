// Reconcile an already completed operator decision. Never transitions delivery state.
const {randomUUID}=require('node:crypto');
const {validateAllowlist,hash,canonical,barrierProof,snapshot}=require('./administrative-closure');
const fail=code=>Object.assign(Error(code),{code});
function metadata(r){return {id:r.id,createdAtUtc:snapshot(r).createdAtUtc,state:r.state,attempts:Number(r.attempts),errorCode:r.errorCode||null,leaseUntilMs:r.leaseUntilMs==null?null:String(r.leaseUntilMs),leaseTokenPresent:Number(r.leaseTokenPresent)===1||r.leaseTokenPresent===true};}
function reconcile(allowlist,rows){
 const seal=validateAllowlist(allowlist);
 if(rows.length!==18||new Set(rows.map(r=>r.id)).size!==18)throw fail('MANUAL_COHORT_COUNT_CHANGED');
 const old=new Map(allowlist.entries.map(r=>[r.id,r]));
 const entries=rows.map(row=>{
  const original=old.get(row.id),current=metadata(row);
  if(!original||current.state!=='DEAD')throw fail('MANUAL_COHORT_NOT_DEAD');
  const expected={...metadata(original),state:'DEAD'};
  if(canonical(current)!==canonical(expected))throw fail('MANUAL_METADATA_CHANGED');
  return {id:row.id,originalState:original.state,currentState:'DEAD',currentMetadataSha256:hash(current),originalMetadataSha256:hash(original),administrativeClosure:row.administrative_closure??null};
 }).sort((a,b)=>a.id.localeCompare(b.id));
 return {kind:'HDWORK2_MANUAL_CLOSURE_RECONCILIATION',decisionId:allowlist.decisionId,allowlistSha256:seal,botId:allowlist.botId,manualQueuedToDeadObserved:10,legacyDeadPreserved:8,statusWrites:0,fifoReleased:false,entries};
}
async function record(pool,{allowlist,expectedFingerprint,dryRun=true,barrier}={}){
 const seal=validateAllowlist(allowlist);
 if(typeof dryRun!=='boolean')throw fail('DRY_RUN_REQUIRED');
 if(!dryRun)barrierProof(barrier,seal,allowlist);
 const c=await pool.getConnection();
 try{
  if(dryRun)await c.query('SET TRANSACTION READ ONLY');
  await c.beginTransaction();
  const [[clock]]=await c.query('SELECT CURRENT_USER() AS account,DATABASE() AS db,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS nowMs');
  if(clock.db!=='hdwork2')throw fail('WRONG_DATABASE');
  const [rows]=await c.execute('SELECT id,created_at AS createdAtUtc,state,attempts,last_error_code AS errorCode,lease_until_ms AS leaseUntilMs,lease_token IS NOT NULL AS leaseTokenPresent,administrative_closure FROM hd2_courier_outbox WHERE bot_id=? AND id IN ('+allowlist.entries.map(()=>'?').join(',')+') ORDER BY id'+(dryRun?'':' FOR UPDATE'),[allowlist.botId,...allowlist.entries.map(e=>e.id)]);
  const result=reconcile(allowlist,rows);
  if(rows.some(r=>r.leaseUntilMs!=null&&Number(r.leaseUntilMs)>Number(clock.nowMs)))throw fail('ACTIVE_ROW_LEASE');
  // The fingerprint excludes markers so an identical successful operation is idempotent.
  const fingerprint=hash({...result,entries:result.entries.map(({administrativeClosure,...e})=>e)});
  if(!dryRun&&fingerprint!==expectedFingerprint)throw fail('MANUAL_RECONCILIATION_PIN_REQUIRED');
  const markers=result.entries.map(e=>({type:'ABANDONED_BY_OPERATOR',recordingMode:'AFTER_MANUAL_STATE_CHANGE',decisionId:allowlist.decisionId,operator:allowlist.operator,reason:allowlist.reason,decisionReference:allowlist.decisionReference,allowlistSha256:seal,reconciliationSha256:fingerprint,originalState:e.originalState,originalMetadataSha256:e.originalMetadataSha256,currentMetadataSha256:e.currentMetadataSha256,fifoReleased:false}));
  let existing=0;
  for(let i=0;i<result.entries.length;i++){
   const e=result.entries[i],raw=e.administrativeClosure,marker=typeof raw==='string'?JSON.parse(raw):raw;
   if(marker){const {recordedAtUtc,...stable}=marker;if(canonical(stable)!==canonical(markers[i]))throw fail('MANUAL_AUDIT_CONFLICT');existing++;}
  }
  if(existing&&existing!==18)throw fail('PARTIAL_MANUAL_AUDIT');
  if(!dryRun&&!existing){
   const [workers]=await c.execute('SELECT expires_ms FROM hd2_courier_workers WHERE bot_id=? FOR UPDATE',[allowlist.botId]);
   if(workers.some(r=>Number(r.expires_ms)>Number(clock.nowMs)))throw fail('ACTIVE_COURIER_LEASE_STOP');
   for(let i=0;i<result.entries.length;i++){
    const marker={...markers[i],recordedAtUtc:new Date(Number(clock.nowMs)).toISOString()};
    const [updated]=await c.execute("UPDATE hd2_courier_outbox SET administrative_closure=? WHERE bot_id=? AND id=? AND state='DEAD' AND administrative_closure IS NULL",[canonical(marker),allowlist.botId,result.entries[i].id]);
    if(Number(updated.affectedRows)!==1)throw fail('MANUAL_AUDIT_WRITE_CONFLICT');
    await c.execute("INSERT INTO hd2_audit(id,action,detail) VALUES (?,'COURIER_MANUAL_CLOSURE_RECORDED',?)",[randomUUID(),canonical({outboxId:result.entries[i].id,...marker,databaseAccount:clock.account,barrierId:barrier.barrierId})]);
   }
  }
  if(dryRun)await c.rollback();else await c.commit();
  return {...result,fingerprint,dryRun,duplicate:existing===18,recorded:!dryRun&&!existing?18:0};
 }catch(e){await c.rollback();throw e;}finally{c.release();}
}
module.exports={reconcile,record,metadata};

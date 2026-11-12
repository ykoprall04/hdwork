// Owner-invoked maintenance only. No credential discovery, worker start, retry or sender.
const {createHash,randomUUID}=require('node:crypto');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TIME=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/;
const fail=code=>Object.assign(Error(code),{code});
function canonical(v){return JSON.stringify(sort(v));}
function sort(v){if(Array.isArray(v))return v.map(sort);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])]));return v;}
const hash=v=>createHash('sha256').update(canonical(v)).digest('hex');
const routeHash=r=>createHash('sha256').update(JSON.stringify({chatId:r.chatId??null,threadId:r.threadId??null,anchorId:r.anchorId??null,orderId:r.orderId??null})).digest('hex');
function timestamp(v){if(v instanceof Date)return v.toISOString().replace('T',' ').slice(0,-1);const m=/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?$/.exec(v||'');if(!m)throw fail('METADATA_TIME_REJECTED');return m[1]+'.'+(m[2]||'').padEnd(3,'0');}
function snapshot(r){return {id:r.id,createdAtUtc:timestamp(r.createdAtUtc),state:r.state,attempts:Number(r.attempts),errorCode:r.errorCode||null,leaseUntilMs:r.leaseUntilMs==null?null:String(r.leaseUntilMs),leaseTokenPresent:r.leaseTokenPresent===true||Number(r.leaseTokenPresent)===1,routingDigest:r.routingDigest||routeHash(r)};}
function validateAllowlist(a){
 if(!a||a.version!==1||a.kind!=='HDWORK2_ADMINISTRATIVE_CLOSURE_ALLOWLIST'||!/^DEC-\d{8}-\d{2}$/.test(a.decisionId||'')||! /^[A-Za-z0-9_.@-]{1,64}$/.test(a.operator||'')||a.reason!=='OPERATOR_NOT_PRIORITIZED'||typeof a.decisionReference!=='string'||!a.decisionReference||a.decisionReference.length>256||/[\x00-\x1f]/.test(a.decisionReference)||! /^[a-zA-Z0-9_-]{1,64}$/.test(a.botId||'')||!TIME.test(a.cutoffCreatedAtUtc||'')||!TIME.test(a.queueCutoffCreatedAtUtc||'')||a.expectedQueued!==10||a.expectedDead!==8||!Array.isArray(a.entries)||a.entries.length!==18)throw fail('ALLOWLIST_REJECTED');
 if(new Set(a.entries.map(e=>e.id)).size!==18)throw fail('ALLOWLIST_DUPLICATE');
 for(const e of a.entries)if(!UUID.test(e.id||'')||!TIME.test(e.createdAtUtc||'')||e.createdAtUtc>a.cutoffCreatedAtUtc||!['QUEUED','DEAD'].includes(e.state)||e.state==='QUEUED'&&e.createdAtUtc>a.queueCutoffCreatedAtUtc||!Number.isInteger(e.attempts)||e.attempts<0||! /^[a-f0-9]{64}$/.test(e.routingDigest||''))throw fail('ALLOWLIST_ENTRY_REJECTED');
 if(a.entries.filter(e=>e.state==='QUEUED').length!==10||a.entries.filter(e=>e.state==='DEAD').length!==8)throw fail('ALLOWLIST_COUNTS_REJECTED');
 return hash(a);
}
function barrierProof(p,allowlistSha,a){
 if(!p||p.kind!=='HDWORK2_CUTOVER_BARRIER'||!UUID.test(p.barrierId||'')||p.decisionId!==a.decisionId||p.allowlistSha256!==allowlistSha||p.courierStopped!==true||p.writersQuiesced!==true||p.allOwnedPidsGone!==true||p.backupPairVerified!==true||! /^[a-f0-9]{64}$/.test(p.backupReceiptSha256||'')||!Number.isFinite(Date.parse(p.observedAtUtc))||Math.abs(Date.now()-Date.parse(p.observedAtUtc))>300000)throw fail('QUIESCENT_PAIRED_BACKUP_PROOF_REQUIRED');
}
const selectMetadata=`SELECT b.id,b.created_at AS createdAtUtc,b.state,b.attempts,b.last_error_code AS errorCode,
 b.lease_until_ms AS leaseUntilMs,b.lease_token IS NOT NULL AS leaseTokenPresent,
 b.administrative_closure AS closure,
 JSON_UNQUOTE(JSON_EXTRACT(b.payload,'$.chat_id')) AS chatId,
 NULLIF(JSON_UNQUOTE(JSON_EXTRACT(b.payload,'$.telegram_thread_id')),'null') AS threadId,
 NULLIF(JSON_UNQUOTE(JSON_EXTRACT(b.payload,'$.reply_to_message_id')),'null') AS anchorId,o.id AS orderId
 FROM hd2_courier_outbox b LEFT JOIN hd2_orders o ON o.bot_id=b.bot_id
 AND o.chat_id=JSON_UNQUOTE(JSON_EXTRACT(b.payload,'$.chat_id'))
 AND o.message_id=JSON_UNQUOTE(JSON_EXTRACT(b.payload,'$.reply_to_message_id'))
 AND o.thread_id<=>NULLIF(JSON_UNQUOTE(JSON_EXTRACT(b.payload,'$.telegram_thread_id')),'null')`;
async function closeAdministrative(pool,{allowlist,expectedAllowlistSha256,dryRun=true,barrier}={}){
 const seal=validateAllowlist(allowlist);
 if(typeof dryRun!=='boolean'||seal!==expectedAllowlistSha256)throw fail('ALLOWLIST_SEAL_MISMATCH');
 if(!dryRun)barrierProof(barrier,seal,allowlist);
 const c=await pool.getConnection();
 try{
  if(dryRun)await c.query('SET TRANSACTION READ ONLY');await c.beginTransaction();
  const [[clock]]=await c.query('SELECT CURRENT_USER() AS account,DATABASE() AS db,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS nowMs');
  if(clock.db!=='hdwork2')throw fail('WRONG_DATABASE');
  if(!dryRun){const [workers]=await c.execute('SELECT expires_ms FROM hd2_courier_workers WHERE bot_id=? FOR UPDATE',[allowlist.botId]);if(workers.length>1||workers.some(w=>Number(w.expires_ms)>Number(clock.nowMs)))throw fail('ACTIVE_COURIER_LEASE_STOP');}
  const marks=allowlist.entries.map(()=>'?').join(','),ids=allowlist.entries.map(e=>e.id);
  const [rows]=await c.execute(selectMetadata+' WHERE b.bot_id=? AND b.id IN ('+marks+') AND b.created_at<=? ORDER BY b.id'+(dryRun?'':' FOR UPDATE'),[allowlist.botId,...ids,allowlist.cutoffCreatedAtUtc]);
  if(rows.length!==18)throw fail('COHORT_COUNT_CHANGED');
  const expected=new Map(allowlist.entries.map(e=>[e.id,e]));let closed=0;
  for(const row of rows){
   const entry=expected.get(row.id),marker=typeof row.closure==='string'?JSON.parse(row.closure):row.closure;
   if(!entry)throw fail('OUTSIDE_ALLOWLIST');
   if(row.leaseUntilMs!=null&&(!Number.isFinite(Number(row.leaseUntilMs))||Number(row.leaseUntilMs)>Number(clock.nowMs))||Number(row.leaseTokenPresent)===1&&row.leaseUntilMs==null)throw fail('ACTIVE_OR_INVALID_ROW_LEASE');
   if(marker){
    if(marker.type!=='ABANDONED_BY_OPERATOR'||marker.decisionId!==allowlist.decisionId||marker.allowlistSha256!==seal||marker.operator!==allowlist.operator||marker.reason!==allowlist.reason||marker.decisionReference!==allowlist.decisionReference||marker.originalMetadataSha256!==hash(snapshot(entry))||row.state!=='DEAD')throw fail('CLOSURE_CONFLICT');
    if(hash({...snapshot(row),state:entry.state})!==hash(snapshot(entry)))throw fail('CLOSED_METADATA_CHANGED');closed++;
   }else if(hash(snapshot(row))!==hash(snapshot(entry)))throw fail('COHORT_METADATA_CHANGED');
  }
  if(closed&&closed!==18)throw fail('PARTIAL_CLOSURE_STOP');
  if(!dryRun&&!closed){
   const at=new Date(Number(clock.nowMs)).toISOString(),markers=new Map(allowlist.entries.map(e=>[e.id,{type:'ABANDONED_BY_OPERATOR',decisionId:allowlist.decisionId,decisionReference:allowlist.decisionReference,operator:allowlist.operator,reason:allowlist.reason,at,allowlistSha256:seal,originalState:e.state,originalMetadataSha256:hash(snapshot(e)),fifoReleased:false}]));
   for(const state of ['QUEUED','DEAD']){
    const group=allowlist.entries.filter(e=>e.state===state),cases=group.map(()=>'WHEN ? THEN ?').join(' '),params=group.flatMap(e=>[e.id,canonical(markers.get(e.id))]);
    const sql='UPDATE hd2_courier_outbox SET administrative_closure=CASE id '+cases+' END'+(state==='QUEUED'?",state='DEAD'":'')+' WHERE bot_id=? AND id IN ('+group.map(()=>'?').join(',')+') AND state=? AND administrative_closure IS NULL AND (lease_until_ms IS NULL OR lease_until_ms<=?) AND created_at<=?';
    const [updated]=await c.execute(sql,[...params,allowlist.botId,...group.map(e=>e.id),state,clock.nowMs,state==='QUEUED'?allowlist.queueCutoffCreatedAtUtc:allowlist.cutoffCreatedAtUtc]);
    if(Number(updated.affectedRows)!==group.length)throw fail('AFFECTED_ROWS_MISMATCH_ROLLBACK');
   }
   for(const e of allowlist.entries)await c.execute("INSERT INTO hd2_audit(id,action,detail) VALUES (?,'COURIER_ADMIN_CLOSED',?)",[randomUUID(),canonical({outboxId:e.id,...markers.get(e.id),databaseAccount:clock.account,barrierId:barrier.barrierId,backupReceiptSha256:barrier.backupReceiptSha256})]);
  }
  if(dryRun)await c.rollback();else await c.commit();
  return {decisionId:allowlist.decisionId,allowlistSha256:seal,dryRun,duplicate:closed===18,count:18,queuedToDead:closed?0:10,deadStatusPreserved:8,fifoReleased:false,status:'ADMINISTRATIVE_CLOSURE_ONLY'};
 }catch(e){await c.rollback();throw e;}finally{c.release();}
}
module.exports={closeAdministrative,validateAllowlist,snapshot,hash,canonical,routeHash,selectMetadata,barrierProof};

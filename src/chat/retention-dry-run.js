// Pure metadata planning. No DB driver, DML, filesystem, timer or automatic cleanup.
const DAY=86400000,WIB=7*3600000;
function cutoff(now=Date.now()){return new Date(Math.floor((now+WIB)/DAY)*DAY-WIB).toISOString();}
function plan({now=Date.now(),fixedCutoff=cutoff(now),rows=[],limit=200}){
 const boundary=Date.parse(fixedCutoff);if(!Number.isFinite(boundary)||boundary>now||(boundary+WIB)%DAY!==0||!Number.isInteger(limit)||limit<1||limit>500)throw Error('RETENTION_CUTOFF_OR_BATCH_REJECTED');
 const candidates=[],protectedCounts={};const protect=reason=>protectedCounts[reason]=(protectedCounts[reason]||0)+1;
 for(const row of rows){
  if(!row||row.originalOrder!==false){protect('ORDER_OR_INVALID');continue;}
  const created=Date.parse(row.createdAt),finished=Date.parse(row.completedAt);
  if(!Number.isFinite(created)||!Number.isFinite(finished)||created>=boundary||finished>=boundary){protect('CURRENT_OR_INCOMPLETE');continue;}
  if(row.anchorsPresent!==true||row.retryPending!==false||row.ackPending!==false){protect('ANCHOR_RETRY_OR_ACK');continue;}
  if(row.direction==='OUT'&&!(row.state==='SENT'&&row.telegramMessageId&&row.journalState==='SETTLED')){protect('OUT_NOT_CONFIRMED');continue;}
  if(row.direction==='IN'&&!(row.inboxState==='PROCESSED'&&row.journalState==='ACKED')){protect('IN_NOT_CONFIRMED');continue;}
  if(!['IN','OUT'].includes(row.direction)||typeof row.id!=='string'||!/^[a-f0-9-]{36}$/i.test(row.id)){protect('METADATA_INVALID');continue;}
  candidates.push({id:row.id,createdAt:new Date(created).toISOString(),contentTargets:row.direction==='OUT'?['chat.body','chat.attachments','outbox.payload.text']:['chat.body','chat.attachments','inbox.payload.event.text','inbox.payload.event.attachments','journal.updates.payload.event.text','journal.updates.payload.event.attachments']});
 }
 candidates.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
 return {dryRun:true,deletionEnabled:false,fixedCutoff:new Date(boundary).toISOString(),eligible:candidates.length,batch:candidates.slice(0,limit),protectedCounts,preserve:['orders','order_status','important_audit','telegram_ids','reply_anchors','dedup_metadata','delivery_success_cache','journal_offset','payload_route_fields']};
}
module.exports={cutoff,plan};

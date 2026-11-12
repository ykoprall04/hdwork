const {createHash}=require('node:crypto');
const {fail}=require('./contract');
function conversation(botId,payload){return createHash('sha256').update(JSON.stringify([botId,payload.chat_id,payload.telegram_thread_id??null,payload.reply_to_message_id??null])).digest('hex');}
async function allocate(c,botId,payload){const key=conversation(botId,payload);await c.execute('INSERT INTO hd2_courier_lanes(bot_id,conversation_key,next_seq) VALUES (?,?,1) ON DUPLICATE KEY UPDATE bot_id=bot_id',[botId,key]);const [[row]]=await c.execute('SELECT next_seq FROM hd2_courier_lanes WHERE bot_id=? AND conversation_key=? FOR UPDATE',[botId,key]);if(!row||!/^[1-9]\d*$/.test(String(row.next_seq))||BigInt(row.next_seq)>=18446744073709551615n)throw fail(503);await c.execute('UPDATE hd2_courier_lanes SET next_seq=next_seq+1 WHERE bot_id=? AND conversation_key=?',[botId,key]);return {key,sequence:String(row.next_seq)};}
const predicate=" AND conversation_key IS NOT NULL AND conversation_seq IS NOT NULL AND NOT EXISTS (SELECT 1 FROM hd2_courier_outbox prior WHERE prior.bot_id=hd2_courier_outbox.bot_id AND prior.conversation_key=hd2_courier_outbox.conversation_key AND prior.conversation_seq<hd2_courier_outbox.conversation_seq AND prior.state<>'SENT')";
async function head(c,botId,row){const [[lane]]=await c.execute('SELECT next_seq FROM hd2_courier_lanes WHERE bot_id=? AND conversation_key=? FOR UPDATE SKIP LOCKED',[botId,row.conversation_key]);if(!lane)return false;const [prior]=await c.execute("SELECT id FROM hd2_courier_outbox WHERE bot_id=? AND conversation_key=? AND conversation_seq<? AND state<>'SENT' ORDER BY conversation_seq LIMIT 1 FOR SHARE",[botId,row.conversation_key,String(row.conversation_seq)]);return !prior.length;}
module.exports={conversation,allocate,predicate,head};
// Offline migration helper only; no HTTP endpoint. Caller must stop web and Courier first.
async function sequenceReviewed(store,{entries,reviewSha256,servicesStopped=false}){
 if(!servicesStopped||!Array.isArray(entries)||!entries.length||new Set(entries.map(e=>e.id)).size!==entries.length||entries.some(e=>!e||!/^[a-f0-9-]{36}$/i.test(e.id)||!/^[a-f0-9]{64}$/.test(e.payloadHash||'')))throw fail(400);
 const {digest,outbound}=require('./contract');if(digest({botId:store.botId,entries})!==reviewSha256)throw fail(409);
 return store.transaction(async c=>{
  const [[worker]]=await c.execute('SELECT expires_ms FROM hd2_courier_workers WHERE bot_id=? FOR UPDATE',[store.botId]);if(Number(worker?.expires_ms||0)>store.now())throw fail(409);
  const [existing]=await c.execute('SELECT id FROM hd2_courier_outbox WHERE bot_id=? AND conversation_key IS NOT NULL LIMIT 1 FOR UPDATE',[store.botId]);if(existing.length)throw fail(409);
  for(const entry of entries){const [[row]]=await c.execute('SELECT * FROM hd2_courier_outbox WHERE id=? AND bot_id=? FOR UPDATE',[entry.id,store.botId]);if(!row||row.payload_hash!==entry.payloadHash||row.state==='SENT'||row.conversation_key!=null)throw fail(409);const lane=await allocate(c,store.botId,outbound(typeof row.payload==='string'?JSON.parse(row.payload):row.payload));await c.execute('UPDATE hd2_courier_outbox SET conversation_key=?,conversation_seq=? WHERE id=? AND bot_id=?',[lane.key,lane.sequence,row.id,store.botId]);await c.execute("INSERT INTO hd2_audit(id,action,detail) VALUES (?,'COURIER_FIFO_SEQUENCED',?)",[require('node:crypto').randomUUID(),JSON.stringify({outboxId:row.id,reviewSha256,sequence:lane.sequence})]);}
  const [remaining]=await c.execute("SELECT id FROM hd2_courier_outbox WHERE bot_id=? AND state<>'SENT' AND (conversation_key IS NULL OR conversation_seq IS NULL)"+store.boundarySql+' LIMIT 1 FOR SHARE',[store.botId,...store.boundaryParams]);if(remaining.length)throw fail(409);
  return {sequenced:entries.length,statusChanged:false,messagesSent:false};
 });
}
module.exports.sequenceReviewed=sequenceReviewed;

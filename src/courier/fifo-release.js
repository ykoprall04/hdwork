// Durable per-message dispositions. Never changes delivery status or sends a message.
const {randomUUID}=require('node:crypto');
const {fail}=require('./contract');
const {allocate}=require('./fifo');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const descriptions=new Set(['Bad Request: chat not found','Bad Request: message to reply not found','Bad Request: message thread not found','Bad Request: not enough rights to send text messages to the chat','Bad Request: message is too long','[TELEGRAM_DESCRIPTION_REDACTED]']);
function telegramError(value){
 if(!value||value.source!=='TELEGRAM_BOT_API'||![400,403,429].includes(value.code)||typeof value.description!=='string')throw fail();
 return {source:'TELEGRAM_BOT_API',code:value.code,description:descriptions.has(value.description)?value.description:'[TELEGRAM_DESCRIPTION_REDACTED]',rejected:value.rejected===true};
}
async function allocateOrder(c,bot,payload){
 if(!payload.reply_to_message_id)return null;
 const [[order]]=await c.execute('SELECT id FROM hd2_orders WHERE bot_id=? AND chat_id=? AND message_id=? AND thread_id<=>? FOR SHARE',[bot,payload.chat_id,payload.reply_to_message_id,payload.telegram_thread_id]);
 if(!order||!UUID.test(order.id))return null;
 return {...await allocate(c,bot,payload),orderId:order.id};
}
// Historical predecessors are deliberately NOT filtered by activation boundary.
const predicate=` AND fifo_order_id IS NOT NULL AND conversation_key IS NOT NULL AND conversation_seq IS NOT NULL
 AND EXISTS (SELECT 1 FROM hd2_orders proof WHERE proof.id=hd2_courier_outbox.fifo_order_id
 AND proof.bot_id=hd2_courier_outbox.bot_id
 AND proof.chat_id=JSON_UNQUOTE(JSON_EXTRACT(hd2_courier_outbox.payload,'$.chat_id'))
 AND proof.message_id=JSON_UNQUOTE(JSON_EXTRACT(hd2_courier_outbox.payload,'$.reply_to_message_id'))
 AND proof.thread_id<=>NULLIF(JSON_UNQUOTE(JSON_EXTRACT(hd2_courier_outbox.payload,'$.telegram_thread_id')),'null')
 AND proof.telegram_timestamp>0
 AND TIMESTAMPADD(SECOND,proof.telegram_timestamp,'1970-01-01 00:00:00') IS NOT NULL
 AND TIMESTAMPADD(SECOND,proof.telegram_timestamp,'1970-01-01 00:00:00')<=TIMESTAMPADD(SECOND,300,UTC_TIMESTAMP(3))
 AND NOT EXISTS (SELECT 1 FROM hd2_courier_outbox unknown_prior
 WHERE unknown_prior.bot_id=hd2_courier_outbox.bot_id AND unknown_prior.state<>'SENT'
 AND unknown_prior.fifo_release IS NULL
 AND (unknown_prior.fifo_order_id IS NULL OR unknown_prior.conversation_key IS NULL OR unknown_prior.conversation_seq IS NULL)
 AND (unknown_prior.created_at>=proof.created_at
 OR TIMESTAMPADD(SECOND,proof.telegram_timestamp,'1970-01-01 00:00:00')<=TIMESTAMPADD(SECOND,300,unknown_prior.created_at))))
 AND NOT EXISTS (SELECT 1 FROM hd2_courier_outbox prior WHERE prior.bot_id=hd2_courier_outbox.bot_id
 AND prior.conversation_key=hd2_courier_outbox.conversation_key
 AND prior.conversation_seq<hd2_courier_outbox.conversation_seq
 AND prior.state<>'SENT' AND NOT(prior.state='DEAD' AND prior.fifo_release IS NOT NULL))`;
async function head(c,bot,row){
 const [[lane]]=await c.execute('SELECT next_seq FROM hd2_courier_lanes WHERE bot_id=? AND conversation_key=? FOR UPDATE SKIP LOCKED',[bot,row.conversation_key]);
 if(!lane)return false;
 const [prior]=await c.execute("SELECT id FROM hd2_courier_outbox WHERE bot_id=? AND conversation_key=? AND conversation_seq<? AND state<>'SENT' AND NOT(state='DEAD' AND fifo_release IS NOT NULL) ORDER BY conversation_seq LIMIT 1 FOR SHARE",[bot,row.conversation_key,String(row.conversation_seq)]);
 return !prior.length;
}
async function automatic(c,row,error,now){
 if(row.fifo_release||!row.fifo_order_id||!row.conversation_key||row.conversation_seq==null||row.state!=='DEAD'||row.last_error_code!=='BAD_REQUEST'||!error||error.code!==400||!error.rejected)return false;
 const marker={source:'TELEGRAM_REJECTION',operator:'courier',reason:'CONFIRMED_TELEGRAM_400',at:new Date(now).toISOString(),late:false};
 await c.execute('UPDATE hd2_courier_outbox SET fifo_release=? WHERE id=? AND bot_id=? AND fifo_release IS NULL',[JSON.stringify(marker),row.id,row.bot_id]);
 await c.execute("INSERT INTO hd2_audit(id,action,detail) VALUES (?,'COURIER_FIFO_AUTO_RELEASE_ALERT',?)",[randomUUID(),JSON.stringify({outboxId:row.id,...marker})]);
 return true;
}
function validateReview({id,operator,reason,late=false}){
 if(!UUID.test(id||'')||typeof operator!=='string'||! /^[A-Za-z0-9_.@-]{1,64}$/.test(operator)||typeof reason!=='string'||! /^[A-Z][A-Z0-9_]{2,79}$/.test(reason)||typeof late!=='boolean')throw fail();
}
module.exports={predicate,head,allocateOrder,automatic,telegramError,validateReview};

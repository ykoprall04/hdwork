// Sender only. No getUpdates, ingestion, worker lease or changes to another courier.
const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),{randomUUID}=require('node:crypto');
const policy=require('../operations/testing-solver-scope');
const selection=`SELECT b.id,b.payload,b.attempts,r.request_id,o.id AS order_id,o.bot_id,o.chat_id,o.thread_id,o.message_id,o.command FROM hd2_courier_outbox b JOIN hd2_web_requests r ON b.idem_key=CONCAT('web:',r.user_id,':',r.request_id) JOIN hd2_orders o ON o.id=r.order_id WHERE b.bot_id=? AND r.user_id=? AND o.bot_id=? AND o.chat_id=? AND o.thread_id IS NULL AND b.state='QUEUED' AND b.attempts=0 AND b.due_ms<=? ORDER BY b.due_ms,b.id LIMIT 1 FOR UPDATE SKIP LOCKED`;
async function claim(pool,scope,now=Date.now()){
 policy.validate(scope,now);const c=await pool.getConnection();
 try{
  await c.beginTransaction();
  const [[user]]=await c.execute('SELECT id,username,role,is_active FROM users WHERE id=? FOR SHARE',[scope.userId]);policy.actor(scope,user,now);
  const [[row]]=await c.execute(selection,[scope.botId,scope.userId,scope.botId,scope.chatId,now]);
  if(!row){await c.commit();return null;}
  const payload=typeof row.payload==='string'?JSON.parse(row.payload):row.payload;policy.outgoing(scope,row,payload,now);
  // Bind to the committed official web action, not arbitrary outbox rows.
  const [[audit]]=await c.execute("SELECT action,detail FROM hd2_audit WHERE order_id=? AND user_id=? AND JSON_UNQUOTE(JSON_EXTRACT(detail,'$.requestId'))=? ORDER BY created_at DESC LIMIT 1",[row.order_id,scope.userId,row.request_id]);
  if(!audit||!['PICK','DONE','FAILED'].includes(audit.action))throw Error('Testing action audit missing');
  const detail=typeof audit.detail==='string'?JSON.parse(audit.detail):audit.detail;if(detail?.actorUsername!==scope.username)throw Error('Outbox actor username rejected');
  const lease=randomUUID();const [changed]=await c.execute("UPDATE hd2_courier_outbox SET state='SENDING',attempts=attempts+1,lease_token=?,lease_until_ms=? WHERE id=? AND bot_id=? AND state='QUEUED' AND attempts=0",[lease,now+60000,row.id,scope.botId]);
  if(changed.affectedRows!==1)throw Error('Outbox lease rejected');await c.commit();return {...row,payload,lease};
 }catch(error){await c.rollback();throw error;}finally{c.release();}
}
async function send(token,scope,item){
 policy.outgoing(scope,item,item.payload);
 const body=JSON.stringify({chat_id:scope.chatId,text:item.payload.text,reply_parameters:{message_id:Number(item.message_id),allow_sending_without_reply:false}});
 return new Promise((resolve,reject)=>{
  const r=https.request({hostname:'api.telegram.org',path:'/bot'+token+'/sendMessage',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:10000},response=>{
   let text='';response.on('data',b=>{text+=b;if(text.length>100000)r.destroy();});response.on('end',()=>{try{const v=JSON.parse(text);const message=v.result;
    if(response.statusCode!==200||!v.ok||String(message.chat?.id)!==scope.chatId||String(message.reply_to_message?.message_id)!==item.message_id||message.text!==item.payload.text||!Number.isSafeInteger(message.message_id))throw Error();
    resolve(String(message.message_id));
   }catch{reject(Error('TELEGRAM_DELIVERY_UNCONFIRMED'));}text='';});response.on('error',()=>reject(Error('TELEGRAM_DELIVERY_UNCONFIRMED')));
  });r.on('error',()=>reject(Error('TELEGRAM_DELIVERY_UNCONFIRMED')));r.on('timeout',()=>r.destroy());r.end(body);
 });
}
function start({pool,scope,token,stateDirectory,deliver=send}){
 policy.validate(scope);let stopped=false,active=Promise.resolve(),busy=false;
 const save=value=>fs.writeFileSync(path.join(stateDirectory,'testing-sender.json'),JSON.stringify({...value,checkedAt:new Date().toISOString()}));
 async function cycle(){if(stopped||busy)return;busy=true;try{
  const item=await claim(pool,scope);if(!item)return;
  let messageId;
  try{messageId=await deliver(token,scope,item);}catch{
   await pool.execute("UPDATE hd2_courier_outbox SET state='DEAD',last_error_code='NETWORK' WHERE id=? AND bot_id=? AND state='SENDING' AND lease_token=?",[item.id,scope.botId,item.lease]);
   save({status:'AMBIGUOUS_NO_RETRY',deliveryId:item.id,orderId:item.order_id});return;
  }
  const [result]=await pool.execute("UPDATE hd2_courier_outbox SET state='SENT',telegram_message_id=?,last_error_code=NULL WHERE id=? AND bot_id=? AND state='SENDING' AND lease_token=?",[messageId,item.id,scope.botId,item.lease]);
  if(result.affectedRows!==1)throw Error('Delivery settlement missing');
  save({status:'SENT',deliveryId:item.id,orderId:item.order_id,telegramMessageId:messageId,replyToMessageId:item.message_id,chatId:scope.chatId});
 }catch{save({status:'BLOCKED_REVIEW_REQUIRED'});}finally{busy=false;}}
 const timer=setInterval(()=>{active=cycle();},1500);
 return {async close(){stopped=true;clearInterval(timer);await active;token='';}};
}
module.exports={claim,send,start,selection};

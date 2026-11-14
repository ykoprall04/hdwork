// Sender only. No getUpdates, ingestion, worker lease or changes to another courier.
const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),{randomUUID}=require('node:crypto');
const policy=require('../operations/testing-solver-scope');
const selection=`SELECT b.id,b.payload,b.attempts,r.request_id,o.id AS order_id,o.bot_id,o.chat_id,o.thread_id,o.message_id,o.command FROM hd2_courier_outbox b JOIN hd2_web_requests r ON b.idem_key=CONCAT('web:',r.user_id,':',r.request_id) JOIN hd2_orders o ON o.id=r.order_id WHERE b.bot_id=? AND r.user_id=? AND o.bot_id=? AND o.chat_id=? AND o.thread_id IS NULL AND b.state='QUEUED' AND b.attempts=0 AND b.due_ms<=? ORDER BY b.due_ms,b.id LIMIT 1 FOR UPDATE SKIP LOCKED`;
const retrySelection=selection.replace('b.attempts=0','b.attempts<5').replace('AND b.due_ms<=?','AND o.telegram_timestamp>=? AND b.due_ms<=?');
async function claim(pool,scope,now=Date.now()){
 policy.validate(scope,now);const c=await pool.getConnection();
 try{
  await c.beginTransaction();
  const [[user]]=await c.execute('SELECT id,username,role,is_active FROM users WHERE id=? FOR SHARE',[scope.userId]);policy.actor(scope,user,now);
  if(!Number.isSafeInteger(scope.feedbackNotBefore)||scope.feedbackNotBefore<1)throw Error('Feedback cutover required');
  const [[row]]=await c.execute(retrySelection,[scope.botId,scope.userId,scope.botId,scope.chatId,scope.feedbackNotBefore,now]);
  if(!row){await c.commit();return null;}
  const payload=typeof row.payload==='string'?JSON.parse(row.payload):row.payload;policy.outgoing(scope,row,payload,now);
  // Bind to the committed official web action, not arbitrary outbox rows.
  const [[audit]]=await c.execute("SELECT action,detail FROM hd2_audit WHERE order_id=? AND user_id=? AND JSON_UNQUOTE(JSON_EXTRACT(detail,'$.requestId'))=? ORDER BY created_at DESC LIMIT 1",[row.order_id,scope.userId,row.request_id]);
  if(!audit||!['PICK','DONE','FAILED'].includes(audit.action))throw Error('Testing action audit missing');
  const detail=typeof audit.detail==='string'?JSON.parse(audit.detail):audit.detail;if(detail?.actorUsername!==scope.username)throw Error('Outbox actor username rejected');
  const lease=randomUUID();const [changed]=await c.execute("UPDATE hd2_courier_outbox SET state='SENDING',attempts=attempts+1,lease_token=?,lease_until_ms=? WHERE id=? AND bot_id=? AND state='QUEUED' AND attempts=?",[lease,now+60000,row.id,scope.botId,row.attempts]);
  if(changed.affectedRows!==1)throw Error('Outbox lease rejected');await c.commit();return {...row,payload,lease};
 }catch(error){await c.rollback();throw error;}finally{c.release();}
}
async function pythonRequest(token,mode,payload={}){
 const config=JSON.parse(fs.readFileSync(path.join(__dirname,'telegram-feedback-python.json'),'utf8'));
 if(!/^C:\\ProgramData\\HDWork2Telegram-[0-9TZ]+-[a-f0-9]{8}\\code\\runtime\\python\\python\.exe$/.test(config.python))throw Error('Protected Python runtime rejected');
 return new Promise((resolve,reject)=>{
  const child=require('node:child_process').spawn(config.python,['-I','-B',path.join(__dirname,'telegram-feedback-send.py')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let output='',failed=false;const timer=setTimeout(()=>{failed=true;child.kill();reject(Object.assign(Error('TRANSPORT_TIMEOUT'),{safeCode:'TRANSPORT_TIMEOUT'}));},15000);
  child.stdout.setEncoding('utf8');child.stdout.on('data',text=>{output+=text;if(output.length>8192){failed=true;child.kill();}});
  child.stderr.on('data',()=>{failed=true;});child.stdin.on('error',()=>{});
  child.once('error',()=>{clearTimeout(timer);reject(Object.assign(Error('TRANSPORT_START_FAILED'),{safeCode:'TRANSPORT_START_FAILED'}));});
  child.once('close',()=>{clearTimeout(timer);if(failed)return reject(Object.assign(Error('TRANSPORT_OUTPUT_REJECTED'),{safeCode:'TRANSPORT_OUTPUT_REJECTED'}));try{const value=JSON.parse(output.replace(/^\uFEFF/,''));output='';if(!value.ok){const e=Object.assign(Error('TELEGRAM_TRANSPORT_FAILED'),{safeCode:value.code||'TELEGRAM_TRANSPORT_FAILED',evidence:{httpStatus:value.status}});if(value.status===429)e.retryAfter=value.retryAfter;return reject(e);}resolve(value);}catch{reject(Object.assign(Error('TRANSPORT_PROTOCOL_REJECTED'),{safeCode:'TRANSPORT_PROTOCOL_REJECTED'}));}});
  child.stdin.end(JSON.stringify({token,mode,payload}));
 });
}
async function send(token,scope,item){
 policy.outgoing(scope,item,item.payload);
 const result=await pythonRequest(token,'send',item.payload);
 if(result.chatId!==scope.chatId||result.replyToMessageId!==String(item.message_id)||!/^\d+$/.test(result.messageId))throw Object.assign(Error('TELEGRAM_RESPONSE_MISMATCH'),{safeCode:'TELEGRAM_RESPONSE_MISMATCH'});
 return result.messageId;
}
function start({pool,scope,token,stateDirectory,deliver=send}){
 policy.validate(scope);let stopped=false,active=Promise.resolve(),busy=false;
 const cutoffFile=path.join(stateDirectory,'feedback-cutover.json');
 if(!fs.existsSync(cutoffFile))fs.writeFileSync(cutoffFile,JSON.stringify({notBefore:Math.floor(Date.now()/1000)}),{flag:'wx'});
 const cutoff=JSON.parse(fs.readFileSync(cutoffFile)).notBefore;
 if(!Number.isSafeInteger(cutoff)||cutoff<1)throw Error('Feedback cutover rejected');
 scope={...scope,feedbackNotBefore:cutoff};
 const save=value=>fs.writeFileSync(path.join(stateDirectory,'testing-sender.json'),JSON.stringify({...value,checkedAt:new Date().toISOString()}));
 const receiptDirectory=path.join(stateDirectory,'telegram-confirmed');fs.mkdirSync(receiptDirectory,{recursive:true});
 const settled=new Set();
 const receiptFile=id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Delivery identity rejected');return path.join(receiptDirectory,id+'.json');};
 async function recoverConfirmed(){
  for(const name of fs.readdirSync(receiptDirectory)){
   if(!/^[a-f0-9-]{36}\.json$/.test(name)||settled.has(name))continue;
   const receipt=JSON.parse(fs.readFileSync(path.join(receiptDirectory,name),'utf8'));
   if(receipt.botId!==scope.botId||receipt.chatId!==scope.chatId||name!==receipt.deliveryId+'.json'||!/^\d+$/.test(receipt.telegramMessageId))throw Error('Confirmed receipt rejected');
   const [[row]]=await pool.execute('SELECT state,lease_token,telegram_message_id FROM hd2_courier_outbox WHERE id=? AND bot_id=?',[receipt.deliveryId,scope.botId]);
   if(row?.state==='SENT'&&String(row.telegram_message_id)===receipt.telegramMessageId){settled.add(name);continue;}
   if(row?.state!=='SENDING'||row.lease_token!==receipt.lease)throw Error('Confirmed receipt fencing changed');
   const [result]=await pool.execute("UPDATE hd2_courier_outbox SET state='SENT',telegram_message_id=?,last_error_code=NULL WHERE id=? AND bot_id=? AND state='SENDING' AND lease_token=?",[receipt.telegramMessageId,receipt.deliveryId,scope.botId,receipt.lease]);
   if(result.affectedRows!==1)throw Error('Confirmed receipt settlement changed');
   settled.add(name);save({status:'SENT',deliveryId:receipt.deliveryId,orderId:receipt.orderId,telegramMessageId:receipt.telegramMessageId,replyToMessageId:receipt.replyToMessageId,chatId:scope.chatId,recoveredSettlement:true});return true;
  }
  return false;
 }
 let transportReady=false;void pythonRequest(token,'identity').then(v=>{if(v.botId!=='9133904377')throw Error();transportReady=true;save({status:'READY',feedbackNotBefore:cutoff,sendEnabled:true,chatId:scope.chatId,transport:'python-stdlib'});}).catch(()=>save({status:'TRANSPORT_BLOCKED',sendEnabled:false}));
 async function cycle(){if(stopped||busy||!transportReady)return;busy=true;try{
  if(await recoverConfirmed())return;
  const item=await claim(pool,scope);if(!item)return;
  let messageId;
  try{messageId=await deliver(token,scope,item);}catch(error){
   if(Number.isInteger(error.retryAfter)&&item.attempts+1<5){
    await pool.execute("UPDATE hd2_courier_outbox SET state='QUEUED',due_ms=?,last_error_code='RATE_LIMIT' WHERE id=? AND bot_id=? AND state='SENDING' AND lease_token=?",[Date.now()+Math.max(error.retryAfter*1000,2000*2**item.attempts),item.id,scope.botId,item.lease]);
    save({status:'RETRY_SCHEDULED',deliveryId:item.id,orderId:item.order_id});return;
   }
   await pool.execute("UPDATE hd2_courier_outbox SET state='DEAD',last_error_code='NETWORK' WHERE id=? AND bot_id=? AND state='SENDING' AND lease_token=?",[item.id,scope.botId,item.lease]);
   save({status:'AMBIGUOUS_NO_RETRY',deliveryId:item.id,orderId:item.order_id,reason:error.safeCode||'OUTGOING_POLICY_REJECTED',transportCode:error.transportCode,evidence:error.evidence});return;
  }
  // Persist the confirmed Telegram ID before DB settlement; retries settle only,
  // never call sendMessage again after a confirmed response.
  const receipt={deliveryId:item.id,orderId:item.order_id,botId:scope.botId,chatId:scope.chatId,replyToMessageId:item.message_id,telegramMessageId:messageId,lease:item.lease};
  const file=receiptFile(item.id),fd=fs.openSync(file,'wx',0o600);
  try{fs.writeFileSync(fd,JSON.stringify(receipt));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  const [result]=await pool.execute("UPDATE hd2_courier_outbox SET state='SENT',telegram_message_id=?,last_error_code=NULL WHERE id=? AND bot_id=? AND state='SENDING' AND lease_token=?",[messageId,item.id,scope.botId,item.lease]);
  if(result.affectedRows!==1)throw Error('Delivery settlement missing');
  settled.add(path.basename(file));
  save({status:'SENT',deliveryId:item.id,orderId:item.order_id,telegramMessageId:messageId,replyToMessageId:item.message_id,chatId:scope.chatId});
 }catch{save({status:'BLOCKED_REVIEW_REQUIRED'});}finally{busy=false;}}
 const timer=setInterval(()=>{active=cycle();},1500);
 return {async close(){stopped=true;clearInterval(timer);await active;token='';}};
}
module.exports={claim,send,start,selection};

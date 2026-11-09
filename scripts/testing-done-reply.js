// At most one sendMessage attempt to a hardcoded testing chat/message.
const fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const root=path.resolve(__dirname,'..'),orderId='7790b19e-f9d4-4c79-ae43-2ad10cdbf405',ledger=path.join(root,'.local/testing-done-reply.json');
const fail=code=>Object.assign(Error('Testing reply blocked'),{code});
async function post(token,method,payload){
 if(!['getMe','sendMessage'].includes(method))throw fail('METHOD_REJECTED');const body=JSON.stringify(payload);
 return new Promise((resolve,reject)=>{const req=https.request({hostname:'api.telegram.org',path:'/bot'+token+'/'+method,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:10000},res=>{const chunks=[];let length=0;res.on('data',b=>{length+=b.length;if(length>131072){res.destroy();reject(fail('RESPONSE_TOO_LARGE'));}else chunks.push(b);});res.once('error',()=>reject(fail('TELEGRAM_RESPONSE_FAILED')));res.once('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(res.statusCode!==200||value.ok!==true)throw fail('TELEGRAM_REQUEST_REJECTED');resolve(value.result);}catch(e){reject(fail(e.code==='TELEGRAM_REQUEST_REJECTED'?e.code:'TELEGRAM_RESPONSE_REJECTED'));}finally{for(const b of chunks)b.fill(0);}});});req.once('error',()=>reject(fail('TELEGRAM_NETWORK_AMBIGUOUS')));req.once('timeout',()=>req.destroy());req.end(body);});
}
async function run(){
 const mode=process.argv.slice(2).join(' ');if(!['--review','--send-done --confirmed'].includes(mode))throw fail('EXPLICIT_MODE_REQUIRED');
 const send=mode==='--send-done --confirmed';const until=Date.parse(process.env.HDWORK2_TEST_DONE_SEND_UNTIL||'');
 if(send&&(process.env.HDWORK2_TEST_DONE_SEND_APPROVED!=='true'||!Number.isFinite(until)||until<=Date.now()||until-Date.now()>15*60000))throw fail('SPECIFIC_SEND_APPROVAL_REQUIRED');
 const plan=JSON.parse(fs.readFileSync(path.join(root,'.local/courier.receive-only.plan.json'),'utf8'));if(plan.enabled||plan.sendEnabled||plan.botUsername!=='HDWorkOpsBot'||plan.groups.length!==1||plan.groups[0].chatId!=='-5436357946'||plan.groups[0].threadId!==null)throw fail('TEST_ALLOWLIST_REJECTED');
 const manager=require('../src/config/operational-pools').createManager({env:{HDWORK2_LOCAL_READ_ONLY:'true',OP_READ_ENABLED:'true',OP_READ_DB_USER:'hdwork_ops_read',OP_READ_DB_HOST:'127.0.0.1',OP_READ_DB_PORT:'3306',OP_READ_DB_NAME:'hdwork2',OP_READ_DB_PASSWORD_DPAPI_FILE:'.local/database-secrets/ops-read-password.dpapi'}});let token='',attempted=false;
 try{
  await manager.initialize();const pool=manager.get('read');const [[order]]=await pool.execute('SELECT id,status,version,bot_id,chat_id,message_id,thread_id,sc_in,final_user_id FROM hd2_orders WHERE id=?',[orderId]);
  if(!order||order.bot_id!=='hdworkopsbot-testing'||order.chat_id!=='-5436357946'||order.message_id!=='6'||order.thread_id!==null||order.sc_in!=='LIVE-AO20261108142737')throw fail('REPLY_TARGET_REJECTED');
  const [[audit]]=await pool.execute("SELECT COUNT(*) AS total FROM hd2_audit WHERE order_id=? AND action='LIVE_TEST_DONE' AND from_status='WAITING' AND to_status='DONE'",[orderId]);
  const ready=order.status==='DONE'&&Number(order.version)===1&&Number(audit.total)===1;
  if(!send){console.log(JSON.stringify({targetVerified:true,orderId,chatId:order.chat_id,replyToMessageId:order.message_id,text:'DONE',currentStatus:order.status,statusAuditEntries:Number(audit.total),readyToSend:ready,sendAttempted:false,ledgerExists:fs.existsSync(ledger)}));return;}
  if(!ready)throw fail('DONE_AND_AUDIT_REQUIRED');
  if(fs.existsSync(ledger))throw fail('EXISTING_SEND_ATTEMPT_DO_NOT_RETRY');
  token=await require('../src/config/private-database-env').readPrivateDpapi('.local/courier-secrets/courier-token.dpapi');
  const me=await post(token,'getMe',{});if(me.id!==9133904377||String(me.username).toLowerCase()!=='hdworkopsbot')throw fail('BOT_IDENTITY_REJECTED');
  if(Date.now()>=until)throw fail('SEND_APPROVAL_EXPIRED');
  const receipt={state:'SENDING',orderId,chatId:'-5436357946',replyToMessageId:'6',text:'DONE',attempts:1,startedAt:new Date().toISOString()};
  fs.writeFileSync(ledger,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});attempted=true;
  // No automatic retry on timeout or ambiguous delivery. Original must exist.
  const reply=await post(token,'sendMessage',{chat_id:'-5436357946',text:'DONE',reply_parameters:{message_id:6,allow_sending_without_reply:false}});
  if(String(reply.chat?.id)!=='-5436357946'||String(reply.reply_to_message?.message_id)!=='6'||reply.text!=='DONE'||!Number.isSafeInteger(reply.message_id))throw fail('REPLY_VERIFICATION_AMBIGUOUS');
  Object.assign(receipt,{state:'CONFIRMED',telegramReplyMessageId:String(reply.message_id),sentAt:new Date().toISOString(),replyVerified:true});fs.writeFileSync(ledger,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
 }catch(e){if(attempted&&fs.existsSync(ledger)){const v=JSON.parse(fs.readFileSync(ledger,'utf8'));if(v.state==='SENDING'){v.state='AMBIGUOUS_DO_NOT_RETRY';v.code=/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'REPLY_FAILED';fs.writeFileSync(ledger,JSON.stringify(v,null,2)+'\n');}}throw e;}
 finally{token='';await manager.close();}
}
if(require.main===module)run().catch(e=>{console.error(JSON.stringify({status:'BLOCKED',code:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'TESTING_REPLY_FAILED',automaticRetry:false}));process.exitCode=1;});

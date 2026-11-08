const {MysqlStore}=require('../courier/mysql-store');
const {digest}=require('../access/service');
const {fail,uuid,moduleOf,hash,transition}=require('./policy');
const {randomUUID}=require('node:crypto');
async function act(pool,token,userId,id,input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw fail();
 uuid(id);uuid(input.requestId);if(Object.keys(input).some(k=>!['requestId','version','action','note','confirm'].includes(k))||!Number.isSafeInteger(input.version)||input.version<0)throw fail();
 const store=new MysqlStore({pool,botId:'unused'});
 return store.transaction(async c=>{
 const [[user]]=await c.execute('SELECT id,name,role,is_active FROM users WHERE id=? FOR SHARE',[userId]);
 if(!user||user.role!=='HD'||![1,true].includes(user.is_active))throw fail(403);
 const [grants]=await c.execute('SELECT module FROM hd2_user_modules WHERE user_id=? FOR SHARE',[user.id]);user.modules=grants.map(g=>g.module);
 const [[session]]=await c.execute('SELECT token_hash FROM hd2_sessions WHERE token_hash=? AND user_id=? AND revoked=FALSE AND expires_at>UTC_TIMESTAMP(3) FOR SHARE',[digest(token),user.id]);if(!session)throw fail(401);
 const [[order]]=await c.execute('SELECT * FROM hd2_orders WHERE id=? FOR UPDATE',[id]);if(!order||!user.modules.includes(moduleOf(order))||!order.command||order.telegram_timestamp===null)throw fail(404);
 const payloadHash=hash({id,...input});
 await c.execute('INSERT INTO hd2_web_requests(user_id,request_id,order_id,payload_hash) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE request_id=request_id',[user.id,input.requestId,id,payloadHash]);
 const [[request]]=await c.execute('SELECT payload_hash,result FROM hd2_web_requests WHERE user_id=? AND request_id=? FOR UPDATE',[user.id,input.requestId]);
 if(request.payload_hash!==payloadHash)throw fail(409);if(request.result)return typeof request.result==='string'?JSON.parse(request.result):request.result;
 if(Number(order.version)!==input.version)throw fail(409,'Order telah berubah. Muat ulang sebelum bertindak.');
 const {next,text,note}=transition(order,user,input);
 const [[previousOwner]]=order.owner_user_id?await c.execute('SELECT name FROM users WHERE id=?',[order.owner_user_id]):[[null]];
 if(text){
 if(order.thread_id!==null)throw fail(409,'Referensi topik belum didukung workflow web ini');
 const sender=new MysqlStore({pool,botId:order.bot_id});
 await sender.enqueueOn(c,'web:'+user.id+':'+input.requestId,{method:'sendMessage',chat_id:order.chat_id,reply_to_message_id:order.message_id,telegram_thread_id:null,thread_mode:'non_topic',text});
 }
 await c.execute("UPDATE hd2_orders SET status=?,owner_user_id=?,final_user_id=?,duplicate_decision=?,completion_note=?,started_at=CASE WHEN ? THEN UTC_TIMESTAMP(3) ELSE started_at END,finished_at=CASE WHEN ? THEN UTC_TIMESTAMP(3) WHEN ? THEN NULL ELSE finished_at END,version=version+1 WHERE id=?",[next.status,next.owner_user_id,next.final_user_id,next.duplicate_decision,next.completion_note,next.resetStart,next.finish,next.clearFinish,id]);
 await c.execute('INSERT INTO hd2_audit(id,inbox_id,order_id,action,user_id,from_status,to_status,detail) VALUES (?,NULL,?,?,?,?,?,?)',[randomUUID(),id,input.action,user.id,order.status,next.status,JSON.stringify({note:note||null,actorName:user.name,previousOwnerId:order.owner_user_id,previousOwnerName:previousOwner?.name||null,ownerId:next.owner_user_id})]);
 await c.execute("INSERT INTO hd2_live_events(module,kind) VALUES (?,'change')",[moduleOf(order)]);
 const result={success:true,id,version:input.version+1,status:next.status};await c.execute('UPDATE hd2_web_requests SET result=? WHERE user_id=? AND request_id=?',[JSON.stringify(result),user.id,input.requestId]);return result;
 });
}
module.exports={act};

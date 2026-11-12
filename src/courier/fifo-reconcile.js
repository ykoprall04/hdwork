const {randomUUID}=require('node:crypto');
const {digest,fail}=require('./contract');
const {validateReview}=require('./fifo-release');
// Caller supplies an existing authorized pool. No credential lookup, Telegram, or runtime import.
async function reviewRelease(pool,{botId,id,operator,reason,late=false,dryRun=true,expected}={}){
 validateReview({id,operator,reason,late});
 if(reason==='ABANDONED_BY_OPERATOR')throw Object.assign(Error('ADMIN_CLOSURE_IS_NOT_FIFO_RELEASE'),{code:'ADMIN_CLOSURE_IS_NOT_FIFO_RELEASE'});
 if(typeof botId!=='string'||! /^[A-Za-z0-9_-]{1,64}$/.test(botId)||typeof dryRun!=='boolean')throw fail();
 if(!dryRun&&! /^[a-f0-9]{64}$/.test(expected||''))throw fail();
 const c=await pool.getConnection();
 try{
  if(dryRun)await c.query('SET TRANSACTION READ ONLY');
  await c.beginTransaction();
  const [[identity]]=await c.query('SELECT CURRENT_USER() AS account');
  const [[row]]=await c.execute('SELECT id,bot_id,created_at,state,attempts,last_error_code,fifo_order_id,fifo_release FROM hd2_courier_outbox WHERE id=? AND bot_id=?'+(dryRun?'':' FOR UPDATE'),[id,botId]);
  if(!row||row.state!=='DEAD')throw fail(409);
  const fingerprint=digest({id:row.id,botId:row.bot_id,createdAt:row.created_at,state:row.state,attempts:row.attempts,errorCode:row.last_error_code,orderId:row.fifo_order_id});
  if(!dryRun&&expected!==fingerprint)throw fail(409);
  const old=typeof row.fifo_release==='string'?JSON.parse(row.fifo_release):row.fifo_release;
  const duplicate=!!old&&(!late||old.late===true);
  if(old&&late&&old.late===true){const attestation=old.lateReview||old;if(attestation.operator!==operator||attestation.reason!==reason)throw fail(409);}
  if(old&&!late&&(old.source!=='MANUAL'||old.operator!==operator||old.reason!==reason||old.late!==false))throw fail(409);
  if(!dryRun&&!duplicate){
   const at=new Date().toISOString();
   const marker=old?{...old,late:true,lateReview:{operator,reason,at}}:{source:'MANUAL',operator,reason,at,late,...(late?{lateReview:{operator,reason,at}}:{})};
   await c.execute('UPDATE hd2_courier_outbox SET fifo_release=? WHERE id=? AND bot_id=?',[JSON.stringify(marker),id,botId]);
   await c.execute("INSERT INTO hd2_audit(id,action,detail) VALUES (?,"+(old?"'COURIER_FIFO_MANUAL_LATE'":"'COURIER_FIFO_MANUAL_RELEASE'")+",?)",[randomUUID(),JSON.stringify({outboxId:id,...marker,reviewOperator:operator,reviewReason:reason,reviewAt:at,databaseAccount:identity.account,expected:fingerprint})]);
  }
  if(dryRun)await c.rollback();else await c.commit();
  return {id,createdAt:row.created_at,state:row.state,attempts:row.attempts,errorCode:row.last_error_code,dryRun,duplicate,fingerprint,late,markerOnly:true};
 }catch(error){await c.rollback();throw error;}finally{c.release();}
}
module.exports={reviewRelease};

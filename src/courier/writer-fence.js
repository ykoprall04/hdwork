// Cooperative, durable per-bot writer barrier using already-granted 015 lanes.
// This reserved key is a control row, never a message conversation or FIFO release.
const {createHash,randomUUID}=require('node:crypto');
const KEY=createHash('sha256').update('HDWORK2_COURIER_WRITER_FENCE_V1').digest('hex');
const MAX=18446744073709551615n;
const fail=code=>Object.assign(Error(code),{code,statusCode:503});
function bot(value){if(typeof value!=='string'||!/^[a-z][a-z0-9_-]{1,63}$/.test(value))throw fail('WRITER_FENCE_BOT_REJECTED');return value;}
function epoch(value){if(!/^[1-9]\d*$/.test(String(value))||BigInt(value)<2n||BigInt(value)>=MAX)throw fail('WRITER_FENCE_EPOCH_REJECTED');return BigInt(value);}
function view(botId,row){if(!row)throw fail('WRITER_FENCE_NOT_INITIALIZED');const n=epoch(row.next_seq);return {botId,epoch:String(n),closed:n%2n===0n,enforcement:'COOPERATIVE_BOT_ROW_V1'};}
async function enter(c,botId){
 bot(botId);
 // MUST be called inside the same explicit transaction as enqueue and its business writes.
 const [[r]]=await c.execute('SELECT next_seq FROM hd2_courier_lanes WHERE bot_id=? AND conversation_key=? FOR SHARE',[botId,KEY]);
 const result=view(botId,r);if(result.closed)throw fail('WRITER_FENCE_CLOSED');return result;
}
function decision({operator,reason}){if(!/^[A-Za-z0-9_.@-]{1,64}$/.test(operator||'')||typeof reason!=='string'||!reason.trim()||reason.length>256||/[\x00-\x1f]/.test(reason))throw fail('WRITER_FENCE_DECISION_REQUIRED');}
async function inspect(pool,{botId}){
 bot(botId);const c=await pool.getConnection();try{await c.query('SET TRANSACTION READ ONLY');await c.beginTransaction();const [[r]]=await c.execute('SELECT next_seq FROM hd2_courier_lanes WHERE bot_id=? AND conversation_key=?',[botId,KEY]);const result=view(botId,r);await c.rollback();return result;}catch(e){await c.rollback();throw e;}finally{c.release();}
}
async function change(pool,{botId,action,expectedEpoch,operator,reason,expectedAccount}){
 bot(botId);decision({operator,reason});
 if(!['initialize','close','open'].includes(action))throw fail('WRITER_FENCE_ACTION_REJECTED');
 if(action!=='initialize')epoch(expectedEpoch);
 const c=await pool.getConnection();
 try{
  await c.beginTransaction();
  const [[identity]]=await c.query('SELECT CURRENT_USER() AS account,DATABASE() AS db');
  if(identity.db!=='hdwork2'||expectedAccount&&identity.account!==expectedAccount)throw fail('WRITER_FENCE_DATABASE_IDENTITY_REJECTED');
  // NOWAIT never manufactures a drain receipt while an in-flight writer owns a share lock.
  const [[row]]=await c.execute('SELECT next_seq FROM hd2_courier_lanes WHERE bot_id=? AND conversation_key=? FOR UPDATE NOWAIT',[botId,KEY]);
  let next,duplicate=false;
  if(action==='initialize'){
   if(row)throw fail('WRITER_FENCE_ALREADY_INITIALIZED');
   next=2n;await c.execute('INSERT INTO hd2_courier_lanes(bot_id,conversation_key,next_seq) VALUES (?,?,?)',[botId,KEY,String(next)]);
  }else{
   const current=view(botId,row);if(current.epoch!==String(expectedEpoch))throw fail('WRITER_FENCE_STALE_EPOCH');
   duplicate=current.closed===(action==='close');next=epoch(current.epoch);
   if(!duplicate){next++;if(next>=MAX)throw fail('WRITER_FENCE_EPOCH_EXHAUSTED');await c.execute('UPDATE hd2_courier_lanes SET next_seq=? WHERE bot_id=? AND conversation_key=? AND next_seq=?',[String(next),botId,KEY,current.epoch]);}
  }
  if(!duplicate)await c.execute("INSERT INTO hd2_audit(id,action,detail) VALUES (?,'COURIER_WRITER_FENCE',?)",[randomUUID(),JSON.stringify({botId,action,epoch:String(next),operator,reason,databaseAccount:identity.account})]);
  await c.commit();return {...view(botId,{next_seq:String(next)}),duplicate,inflightWritesDrained:next%2n===0n,observedAtUtc:new Date().toISOString()};
 }catch(e){await c.rollback();if(e.code==='ER_LOCK_NOWAIT')throw fail('WRITER_FENCE_BUSY');throw e;}finally{c.release();}
}
async function assertClosed(pool,{botId,expectedEpoch}){const r=await inspect(pool,{botId});if(!r.closed||r.epoch!==String(expectedEpoch))throw fail('WRITER_FENCE_LOST');return r;}
module.exports={KEY,enter,inspect,change,assertClosed};

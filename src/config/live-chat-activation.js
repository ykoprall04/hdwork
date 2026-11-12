// Pure planning and read-only checks. No driver, credentials, network or activation.
function prepare(env){
 if(env)profiles(env);
 const required={HDWORK2_SERVICE_AUTH_POLICY:'operational-write',HDWORK2_LOCAL_READ_ONLY:'false',OP_WRITE_ENABLED:'true',HDWORK2_OPERATIONAL_WRITE_APPROVED:'true',HDWORK2_AUTH_V2:'true',HDWORK2_OPERATIONS_ENABLED:'true',B2C_COMMAND_SCHEMA_READY:'true'};
 if(!env||Object.entries(required).some(([k,v])=>env[k]!==v))throw Error('LIVE_CHAT_REQUIRES_EXISTING_APPROVED_WRITER');
 const patch={HDWORK2_SYSTEM_MONITORING_ENABLED:'true',HDWORK2_LIVE_CHAT_ENABLED:'true'};
 const candidate={...env,...patch};require('./persistent-auth').validatePersistentAuth(candidate);
 // A trial overlay is per-account, not a restriction on the approved general writer.
 // Validate it without disabling its flag, changing its scope or altering the secret bundle.
 require('../operations/testing-solver-scope').configuration(candidate);
 return {patch,changes:Object.keys(patch).filter(k=>env[k]!==patch[k]).map(key=>({key,before:env[key]??null,after:patch[key]})),candidate};
}
function profiles(env){
 for(const key of ['HDWORK2_LIVE_CHAT_ENABLED','HDWORK2_SYSTEM_MONITORING_ENABLED','HDWORK2_COURIER_FIFO_ENABLED'])if(env[key]!==undefined&&!['true','false'].includes(env[key]))throw Error('LIVE_CHAT_INVALID_FLAG');
 if(env.HDWORK2_LIVE_CHAT_ENABLED==='true'&&env.HDWORK2_SYSTEM_MONITORING_ENABLED!=='true')throw Error('LIVE_CHAT_REQUIRES_SYSTEM_MONITORING');
 if(env.HDWORK2_COURIER_FIFO_ENABLED==='true'&&env.HDWORK2_LIVE_CHAT_ENABLED!=='true')throw Error('FIFO_REQUIRES_LIVE_CHAT');
 return env.HDWORK2_LIVE_CHAT_ENABLED==='true'?{read:'chatRead',write:env.HDWORK2_COURIER_FIFO_ENABLED==='true'?'chatWriteFifo':'chatWrite'}:env.HDWORK2_SYSTEM_MONITORING_ENABLED==='true'?{read:'systemRead',write:'systemWrite'}:{read:'read',write:'write'};
}
async function preflight({reader,writer,env}){
 const selected=profiles(env),review=require('./operational-grants').reviewOperationalGrants;
 for(const [pool,role]of [[reader,selected.read],[writer,selected.write]]){
  const [[identity]]=await pool.query('SELECT CURRENT_USER() AS account,DATABASE() AS db');
  if(identity.db!=='hdwork2'||identity.account!==(pool===reader?'hdwork_ops_read':'hdwork_ops_write')+'@localhost')throw Error('LIVE_CHAT_POOL_IDENTITY_REJECTED');
  const [grants]=await pool.query('SHOW GRANTS FOR CURRENT_USER');if(!review(grants,role).ok)throw Error('LIVE_CHAT_GRANTS_REJECTED');
 }
 if(env.HDWORK2_SYSTEM_MONITORING_ENABLED==='true'){
  await reader.execute('SELECT component,status,checked_at FROM hd2_system_state LIMIT 0');
  await reader.execute('SELECT delivered_at FROM hd2_courier_outbox LIMIT 0');
 }
 if(env.HDWORK2_LIVE_CHAT_ENABLED==='true')for(const pool of [reader,writer])await pool.execute('SELECT id,order_id FROM hd2_chat_messages LIMIT 0');
 return {status:'PASS',profiles:selected,writesPerformed:false,telegramVerified:false};
}
module.exports={prepare,profiles,preflight};

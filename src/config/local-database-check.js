async function checkDatabase(pool,{authOnly=process.env.HDWORK2_AUTH_ONLY==='true',operationalReadOnly=false}={}) {
  const [[row]] = await pool.query('SELECT DATABASE() AS name');
  if (row.name !== 'hdwork2') throw Error('Target database ditolak');
  const [columns] = await pool.query("SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('users','hd2_sessions','hd2_user_modules','hd2_security_audit','hd2_auth_guard','hd2_orders','hd2_audit','hd2_web_requests','hd2_live_events','hd2_courier_outbox')");
  const required = { users: ['id','password_hash','role','is_active'], hd2_sessions: ['token_hash','expires_at','revoked'], hd2_user_modules: ['module'], hd2_security_audit: ['action'], hd2_auth_guard: ['id'], hd2_orders: ['access_module','version','command_fields','raw_text','telegram_timestamp'], hd2_audit: ['detail','user_id'], hd2_web_requests: ['payload_hash','result'], hd2_live_events: ['module','kind'], hd2_courier_outbox: ['payload','state'] };
  if(authOnly)for(const table of Object.keys(required))if(!['users','hd2_sessions','hd2_user_modules','hd2_security_audit'].includes(table))delete required[table];
  if(operationalReadOnly){for(const table of Object.keys(required))if(!['users','hd2_user_modules','hd2_orders','hd2_audit','hd2_live_events'].includes(table))delete required[table];required.users=['id','name','role','is_active'];}
  if (Object.entries(required).some(([table, names]) => names.some(name => !columns.some(c => c.TABLE_NAME === table && c.COLUMN_NAME === name)))) throw Error('Schema API belum sesuai');
  return { ok: true, database: 'hdwork2', schema: 'ready', scope: operationalReadOnly?'operational-read':authOnly?'auth':'operations' };
}
async function checkRuntimeDatabases({authPool=require('./database'),readPool,operations=process.env.HDWORK2_OPERATIONS_ENABLED==='true'&&process.env.HDWORK2_AUTH_ONLY!=='true'}={}){
 const [[target]]=await authPool.query('SELECT DATABASE() AS db,CURRENT_USER() AS account');
 if(target.db!=='hdwork2'||target.account!=='hdwork_auth@localhost')throw Error('Auth identity rejected');
 const [grants]=await authPool.query('SHOW GRANTS FOR CURRENT_USER');
 if(!require('../access/database-audit').reviewGrants(grants).ok)throw Error('Auth grants rejected');
 await checkDatabase(authPool,{authOnly:true});
 if(operations)await checkDatabase(readPool||require('./operational-pools').getReadPool(),{operationalReadOnly:true,authOnly:false});
 return {ok:true,database:'hdwork2',schema:'ready',scope:operations?'operations':'auth'};
}
module.exports = { checkDatabase,checkRuntimeDatabases };

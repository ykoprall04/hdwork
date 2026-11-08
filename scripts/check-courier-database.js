// Real read-only readiness, independent of live/ingestion approval flags.
const fs=require('node:fs'),path=require('node:path');
const reject=code=>Object.assign(Error('Courier database check blocked'),{code});
async function run(){
 if(process.argv.slice(2).join(' ')!=='--read-only')throw reject('EXPLICIT_READ_ONLY_MODE_REQUIRED');
 const file=path.resolve(__dirname,'../.local/courier-secrets/courier-db-password.dpapi');
 if(!fs.existsSync(file)||!fs.statSync(file).size)throw reject('COURIER_DB_CREDENTIAL_MISSING');
 let password=await require('../src/config/private-database-env').readPrivateDpapi(file),c;
 try{
  c=await require('mysql2/promise').createConnection({host:'127.0.0.1',port:3306,user:'hdwork_courier',password,database:'hdwork2',multipleStatements:false,connectTimeout:5000});password='';
  const [[target]]=await c.query({sql:'SELECT DATABASE() AS db,CURRENT_USER() AS account',timeout:5000});
  if(target.db!=='hdwork2'||target.account!=='hdwork_courier@localhost')throw reject('COURIER_DB_IDENTITY_REJECTED');
  const [rows]=await c.query({sql:'SHOW GRANTS FOR CURRENT_USER',timeout:5000});
  const grants=require('../src/config/operational-grants').reviewOperationalGrants(rows,'courier');
  if(!grants.ok)throw reject('COURIER_DB_GRANTS_REJECTED');
  const required={hd2_orders:['id','bot_id','module','chat_id','message_id','thread_id','command','access_module','version','telegram_timestamp'],hd2_courier_inbox:['received_seq','payload','state'],hd2_daily_keys:['dedupe_key','order_id'],hd2_tial_keys:['dedupe_key','order_id'],hd2_audit:['inbox_id','order_id','action'],hd2_live_events:['module','kind'],hd2_courier_workers:['bot_id','lease_token'],hd2_courier_nonces:['nonce','expires_ms']};
  const [columns]=await c.query({sql:"SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='hdwork2' AND TABLE_NAME IN ("+Object.keys(required).map(()=>'?').join(',')+')',timeout:5000},Object.keys(required));
  if(Object.entries(required).some(([t,cs])=>cs.some(col=>!columns.some(r=>r.TABLE_NAME===t&&r.COLUMN_NAME===col))))throw reject('COURIER_DB_SCHEMA_REJECTED');
  console.log(JSON.stringify({connection:'PASS',database:'hdwork2',account:'hdwork_courier@localhost',grants:'PASS_RECEIVE_ONLY',schema:'PASS',writesPerformed:false,telegramCalls:0}));
 }finally{password='';if(c)await c.end();}
}
if(require.main===module)run().catch(e=>{console.error(JSON.stringify({status:'BLOCKED',code:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'COURIER_DB_CHECK_FAILED',writesPerformed:false}));process.exitCode=1;});
module.exports={run};

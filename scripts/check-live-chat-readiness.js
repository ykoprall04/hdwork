// Explicit operator-only read-only probe. No writes, records, Telegram or service operations.
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const schema={hd2_system_mappings:['id','bot_id','category','profile','chat_id','thread_id','route_key','enabled','verified','version','updated_at'],hd2_system_requests:['actor_id','request_id','payload_hash','result'],hd2_system_state:['component','status','checked_at','code'],hd2_system_incidents:['id','component','from_status','to_status','code','created_at'],hd2_system_targets:['bot_id','chat_id','thread_id','anchor_id','enabled','verified','updated_at'],hd2_system_alerts:['bot_id','alert_key','window_id','outbox_id'],hd2_system_jobs:['kind','window_id','state','filename','bytes','sha256','code','created_at','finished_at'],hd2_courier_outbox:['delivered_at'],hd2_chat_messages:['seq','id','order_id','bot_id','chat_id','thread_id','telegram_message_id','reply_to_id','direction','sender_id','user_id','body','attachments','outbox_id','telegram_timestamp','created_at']};
const statements={identity:'SELECT CURRENT_USER() AS account,DATABASE() AS db',grants:'SHOW GRANTS FOR CURRENT_USER',columns:'SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('+Object.keys(schema).map(()=>'?').join(',')+')',mappings:'SELECT bot_id,category,profile FROM hd2_system_mappings WHERE enabled=TRUE AND verified=TRUE',workers:'SELECT bot_id,expires_ms FROM hd2_courier_workers'};
const code=e=>['ER_DBACCESS_DENIED_ERROR','ER_ACCESS_DENIED_ERROR','ER_TABLEACCESS_DENIED_ERROR','ER_COLUMNACCESS_DENIED_ERROR','ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR','ECONNREFUSED','ETIMEDOUT'].includes(e?.code)?e.code:'CHECK_UNAVAILABLE';
async function inspect({reader,writer,now=Date.now}){
 const result={status:'BLOCKED',databaseAccess:'READ_ONLY_METADATA',writesPerformed:false,orderRowsRead:false,telegramAccessed:false,backendRestarted:false,accounts:{},schema:{status:'UNKNOWN',missingOrNotVisible:[]},routing:{status:'UNKNOWN'},courierTransportVerified:false};const visible=new Set();
 for(const [pool,role,account]of [[reader,'chatRead','hdwork_ops_read@localhost'],[writer,'chatWrite','hdwork_ops_write@localhost']]){
  if(!pool){result.accounts[role]={ok:false,code:'CONNECTION_UNAVAILABLE'};continue;}
  try{const [[identity]]=await pool.query(statements.identity);if(identity.db!=='hdwork2'||identity.account!==account){result.accounts[role]={ok:false,code:'POOL_IDENTITY_REJECTED'};continue;}
   const [grants]=await pool.query(statements.grants),review=require('../src/config/operational-grants').reviewOperationalGrants(grants,role);
   result.accounts[role]={ok:review.ok,unsafe:review.unsafe,missing:review.missing};
   const [columns]=await pool.query(statements.columns,Object.keys(schema));for(const row of columns)visible.add(row.TABLE_NAME+'.'+row.COLUMN_NAME);
  }catch(e){result.accounts[role]={...result.accounts[role],ok:false,code:code(e)};}
 }
 result.schema.missingOrNotVisible=Object.entries(schema).flatMap(([t,cols])=>cols.filter(c=>!visible.has(t+'.'+c)).map(c=>t+'.'+c));result.schema.status=result.schema.missingOrNotVisible.length?'MISSING_OR_NOT_VISIBLE':'PASS';
 if(result.accounts.chatRead?.ok&&reader){try{
  const [mappings]=await reader.query(statements.mappings),[workers]=await reader.query(statements.workers);
  const permitted={TIAL:['TIAL1','TIAL2'],LOGIC:['SOLVER1']};const covered=Object.fromEntries(Object.entries(permitted).map(([category,profiles])=>[category,mappings.some(m=>m.category===category&&profiles.includes(m.profile))]));
  const bots=[...new Set(mappings.map(m=>m.bot_id))],leases=bots.length>0&&bots.every(bot=>workers.some(w=>w.bot_id===bot&&Number(w.expires_ms)>now()));
  result.routing={status:Object.values(covered).every(Boolean)&&leases?'LEASE_EVIDENCE_ONLY':'INCOMPLETE',categories:covered,courierLeaseActive:leases};
 }catch(e){result.routing={status:'UNKNOWN',code:code(e)};}}
 result.status=Object.values(result.accounts).every(a=>a.ok)&&result.schema.status==='PASS'?'WEB_SCHEMA_GRANTS_PASS':'BLOCKED';return result;
}
async function validateInput(snapshot,reviewFile){
 snapshot=path.resolve(snapshot);const raw=await fs.readFile(path.join(snapshot,'service/environment.json')),review=JSON.parse(await fs.readFile(reviewFile,'utf8'));
 if(review.status!=='REVIEW_ONLY_NOT_ACTIVATED'||review.environmentSha256!==createHash('sha256').update(raw).digest('hex'))throw Error('ENVIRONMENT_CHANGED_PREPARE_AGAIN');
 const env=JSON.parse(raw.toString('utf8')),prepared=require('../src/config/live-chat-activation').prepare(env);
 if(JSON.stringify(review.patch)!==JSON.stringify(prepared.patch))throw Error('ACTIVATION_PATCH_MISMATCH');
 require('../src/config/operational-pools').options('read',prepared.candidate);require('../src/config/operational-pools').options('write',prepared.candidate);
 return {snapshot,env:prepared.candidate,environmentSha256:review.environmentSha256};
}
async function run({argv=process.argv.slice(2),input=process.stdin,connect,bootstrap=require('./office-web-service').bootstrap,report=value=>console.log(JSON.stringify(value,null,2))}={}){
 if(argv.length!==5||argv[0]!=='--approved-read-only'||argv[1]!=='--snapshot'||argv[3]!=='--review')throw Error('EXPLICIT_READ_ONLY_SNAPSHOT_REVIEW_REQUIRED');
 const {env,environmentSha256}=await validateInput(argv[2],argv[4]);
 const secrets=await bootstrap(input,{validate:v=>{if(!v||Object.keys(v).sort().join(',')!=='readPassword,writePassword'||!['readPassword','writePassword'].every(k=>typeof v[k]==='string'&&v[k]))throw Error('READ_ONLY_PROBE_SECRET_SCOPE_REJECTED');return v;}});
 const connections=[];try{
  const create=connect||require('mysql2/promise').createConnection,pools={},errors={};
  for(const [name,user,key]of [['reader','hdwork_ops_read','readPassword'],['writer','hdwork_ops_write','writePassword']]){
   try{const connection=await create({host:'127.0.0.1',port:3306,database:'hdwork2',user,password:secrets[key],connectTimeout:5000,multipleStatements:false});connections.push(connection);
    pools[name]={query(sql,params){if(!Object.values(statements).includes(sql))throw Error('READ_ONLY_STATEMENT_REJECTED');return connection.query({sql,timeout:5000},params);}};
   }catch(e){errors[name]=code(e);}
  }
  const result=await inspect({...pools});if(Object.keys(errors).length)result.connectionErrors=errors;
  // Presence/source hashes are reported as booleans/names only; no runtime configuration is printed.
  const files=['src/chat/routes.js','src/chat/service.js','src/config/operational-pools.js','src/config/live-chat-activation.js','src/operations/routes.js','src/system/routes.js','src/system/store.js'];const mismatch=[];
  for(const file of files){try{const [current,active]=await Promise.all([fs.readFile(path.resolve(__dirname,'..',file)),fs.readFile(path.join(path.resolve(argv[2]),file))]);if(!current.equals(active))mismatch.push(file);}catch{mismatch.push(file);}}
  result.backendSource={matchesRepository:mismatch.length===0,filesNeedingUpdate:mismatch};
  result.environmentUnchanged=createHash('sha256').update(await fs.readFile(path.join(path.resolve(argv[2]),'service/environment.json'))).digest('hex')===environmentSha256;
  if(!result.environmentUnchanged)result.status='ENVIRONMENT_CHANGED_PREPARE_AGAIN';
  // The candidate is validated, never installed, and the writer approval is not modified.
  result.writerApprovalPreserved=env.HDWORK2_OPERATIONAL_WRITE_APPROVED==='true';report(result);return result;
 }finally{await Promise.allSettled(connections.map(c=>c.end()));for(const key of Object.keys(secrets))secrets[key]='';}
}
if(require.main===module)run().catch(e=>{console.error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'LIVE_CHAT_READ_ONLY_CHECK_FAILED');process.exitCode=1;});
module.exports={inspect,run,validateInput,schema,statements};

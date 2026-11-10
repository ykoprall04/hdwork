// Management-only diagnostic. Actual snapshot code, no controller startup or queue writes.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),{createHash}=require('node:crypto');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const codes=new Set(['ENOENT','EACCES','EPERM','ECONNREFUSED','ETIMEDOUT','DPAPI_TIMEOUT','DPAPI_FILE_READ_FAILED','DPAPI_UNPROTECT_FAILED','DPAPI_MEMORY_READ_FAILED','DPAPI_PIPE_FAILED','PRIVATE_DB_CONFIG_REJECTED','PRODUCTION_TOKEN_BOT_ID_MISMATCH']);
const childCodes=new Set(['SOURCE_JOURNAL_PATH_REJECTED','TARGET_JOURNAL_PATH_REJECTED','SOURCE_NAMESPACE_MISMATCH','TARGET_NAMESPACE_MISMATCH','SOURCE_TOKEN_FINGERPRINT_MISMATCH','TARGET_TOKEN_FINGERPRINT_MISMATCH','TARGET_ACTIVATION_BOUNDARY_MISMATCH','TARGET_JOURNAL_NOT_EMPTY','SOURCE_OFFSET_INVALID','READ_ONLY_PROBES_PASS','READ_ONLY_PROBE_FAILED','TELEGRAM_IDENTITY_MISMATCH','TELEGRAM_WEBHOOK_CONFIGURED',...[400,401,403,409,429].map(n=>'TELEGRAM_API_'+n)]);
async function pythonProbe(snapshot,env){
 const code=fs.readFileSync(path.join(__dirname,'diagnose-production-courier.py'),'utf8');
 return new Promise((resolve,reject)=>{
  const childEnv=Object.fromEntries(['SystemRoot','WINDIR','PATH','Path','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  Object.assign(childEnv,{PYTHONPATH:path.join(snapshot,'courier_bot'),PYTHONDONTWRITEBYTECODE:'1'});
  const child=cp.spawn('python',['-B','-c',code],{cwd:snapshot,env:childEnv,windowsHide:true,stdio:['pipe','pipe','ignore']});
  let output='',settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
  const timer=setTimeout(()=>{child.kill();finish(Error('PYTHON_DIAGNOSTIC_TIMEOUT'));},40000);
  child.once('error',()=>finish(Error('PYTHON_DIAGNOSTIC_START_FAILED')));
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(env));
  child.stdout.on('data',b=>{output+=b.toString('utf8');if(output.length>4096){child.kill();finish(Error('PYTHON_DIAGNOSTIC_OUTPUT_REJECTED'));}});
  child.once('exit',code=>{try{const value=JSON.parse(output);if(code!==0||!childCodes.has(value.status)||!['PYTHON_IMPORT','PYTHON_CONFIG','JOURNAL_METADATA','TELEGRAM_IDENTITY'].includes(value.phase))throw Error();finish(null,{status:value.status,phase:value.phase});}catch{finish(Error('PYTHON_DIAGNOSTIC_OUTPUT_REJECTED'));}});
 });
}
async function run({snapshot,planFile,planSha256,connect,probe=pythonProbe,load,report=value=>console.log(JSON.stringify(value,null,2))}={}){
 let phase='PLAN',backendEnv,pythonEnv,connection;
 try{
  snapshot=path.resolve(snapshot);const bytes=fs.readFileSync(planFile);if(sha(bytes)!==planSha256)throw Error('APPROVED_PLAN_HASH_MISMATCH');
  const plan=JSON.parse(bytes),loader=load||require(path.join(snapshot,'src/config/production-courier')).load;
  phase='BACKEND_SECRETS';backendEnv=await loader(plan,{kind:'backend'});
  phase='PYTHON_SECRETS';pythonEnv=await loader(plan,{kind:'python'});
  phase='MYSQL';const create=connect||require(require.resolve('mysql2/promise',{paths:[snapshot]})).createConnection;
  connection=await create({host:'127.0.0.1',port:3306,database:'hdwork2',user:backendEnv.COURIER_DB_USER,password:backendEnv.COURIER_DB_PASSWORD,connectTimeout:5000,multipleStatements:false});
  const query=(sql,params)=>connection.query({sql,timeout:5000},params);
  const [[identity]]=await query('SELECT DATABASE() AS db,CURRENT_USER() AS account');
  if(identity.db!=='hdwork2'||identity.account!=='hdwork_courier@localhost')throw Error('COURIER_DB_IDENTITY_REJECTED');
  phase='GRANTS';const [grants]=await query('SHOW GRANTS FOR CURRENT_USER');
  const review=require(path.join(snapshot,'src/config/operational-grants')).reviewOperationalGrants(grants,'courierSendChat');
  if(!review.ok){const r={status:'BLOCKED_COURIER_GRANTS',phase,missing:review.missing,unsafe:review.unsafe};report(r);return r;}
  phase='WORKER_LEASE';const [workers]=await query('SELECT expires_ms FROM hd2_courier_workers WHERE bot_id=?',[plan.botId]);
  if(workers.some(w=>Number(w.expires_ms)>Date.now())){const r={status:'ACTIVE_BOT_LEASE',phase,controllerStarted:false,messagesSent:0};report(r);return r;}
  phase='ROUTING';
  await require(path.join(snapshot,'src/system/routing')).databasePolicy({system:{routing:async()=>{const [rows]=await query('SELECT category,profile,chat_id AS chatId,thread_id AS threadId FROM hd2_system_mappings WHERE bot_id=? AND enabled=TRUE AND verified=TRUE',[plan.botId]);return rows.map(r=>({...r,threadMode:r.threadId===null?'non_topic':'thread',commands:r.category==='LOGIC'?['config_psb','mo']:['order','req']}));}},botId:plan.botId,botUsername:plan.botUsername,chatEnabled:true,expectedGroups:plan.groups}).configuration();
  phase='PYTHON_READ_ONLY_PROBES';const result=await probe(snapshot,pythonEnv);
  if(!childCodes.has(result.status)||!['PYTHON_IMPORT','PYTHON_CONFIG','JOURNAL_METADATA','TELEGRAM_IDENTITY'].includes(result.phase))throw Error('PYTHON_DIAGNOSTIC_OUTPUT_REJECTED');
  const safe={status:result.status,phase:result.phase,controllerStarted:false,mysqlWrites:false,queueRowsRead:false,pollingPerformed:false,messagesSent:0};report(safe);return safe;
 }catch(error){const code=codes.has(error.code)?error.code:/^ER_[A-Z_]+$/.test(error.code||'')?error.code:['APPROVED_PLAN_HASH_MISMATCH','COURIER_DB_IDENTITY_REJECTED','PYTHON_DIAGNOSTIC_TIMEOUT','PYTHON_DIAGNOSTIC_START_FAILED','PYTHON_DIAGNOSTIC_OUTPUT_REJECTED'].includes(error.message)?error.message:'STARTUP_PHASE_FAILED';const result={status:'DIAGNOSTIC_BLOCKED',phase,code,controllerStarted:false,messagesSent:0};report(result);return result;}
 finally{if(connection)try{await connection.end();}catch{}for(const env of [backendEnv,pythonEnv])if(env)for(const key of ['COURIER_SERVICE_KEY','COURIER_DB_PASSWORD','COURIER_IDENTITY_KEY','COURIER_TELEGRAM_BOT_TOKEN'])delete env[key];}
}
if(require.main===module){const args=process.argv.slice(2);if(args.length!==6||args[0]!=='--snapshot'||args[2]!=='--plan'||args[4]!=='--plan-sha256'){console.error('EXPLICIT_DIAGNOSTIC_INPUTS_REQUIRED');process.exitCode=1;}else run({snapshot:args[1],planFile:args[3],planSha256:args[5]}).then(r=>{if(r.status!=='READ_ONLY_PROBES_PASS')process.exitCode=1;});}
module.exports={run,pythonProbe};

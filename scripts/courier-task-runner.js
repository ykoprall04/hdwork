// Private Scheduled Task child. Its owner's stdin is a lifetime lease, never a secret channel.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const startupPhases=new Set(['SECRET_LOAD','BACKEND_START','PYTHON_STARTUP','PYTHON_CONFIG','LOCK_DIRECTORY','JOURNAL_DIRECTORY','BOT_LOCK','JOURNAL_OPEN','JOURNAL_SEED','TELEGRAM_IDENTITY','INGRESS_POLICY','WORKER_LEASE','READY_HANDSHAKE','INBOX_WORKER_START']);
const startupTypes=new Set(['PermissionError','FileNotFoundError','OSError','ValueError','TypeError','RuntimeError','ImportError','ModuleNotFoundError','OperationalError','DatabaseError','IntegrityError','TransportError','TimeoutError','Error','RangeError','ReferenceError','OTHER_EXCEPTION']);
function safeStartupDiagnostic(value){
 if(value?.component==='PYTHON'&&!['PYTHON_STARTUP','PYTHON_CONFIG','LOCK_DIRECTORY','JOURNAL_DIRECTORY','BOT_LOCK','JOURNAL_OPEN','JOURNAL_SEED','TELEGRAM_IDENTITY','INGRESS_POLICY','WORKER_LEASE','READY_HANDSHAKE'].includes(value.phase))return null;
 if(value?.component==='NODE'&&!['SECRET_LOAD','BACKEND_START','PYTHON_STARTUP','READY_HANDSHAKE','INBOX_WORKER_START'].includes(value.phase))return null;
 if(!['NODE','PYTHON'].includes(value?.component)||!startupPhases.has(value.phase)||!startupTypes.has(value.exceptionType))return null;
 return {component:value.component,phase:value.phase,exceptionType:value.exceptionType,...([400,401,403,409,429,503].includes(value.httpStatus)?{httpStatus:value.httpStatus}:{}),...(Number.isInteger(value.osError)&&value.osError>0&&value.osError<256?{osError:value.osError}:{})};
}
function regular(file){const p=path.resolve(file),s=fs.lstatSync(p),real=fs.realpathSync(p);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>16*1024*1024||(process.platform==='win32'?real.toLowerCase()!==p.toLowerCase():real!==p))throw Error('TASK_INPUT_REJECTED');return fs.readFileSync(p);}
function verify(file,expected){if(hash(regular(file))!==expected)throw Error('TASK_VERSION_DRIFT');}
function configuration(file,expected){
 verify(file,expected);const value=JSON.parse(regular(file));
 if(value.version!==1||value.kind!=='HDWORK2_COURIER_AUTOSTART'||!path.isAbsolute(value.snapshot)||!path.isAbsolute(value.productionPlan)||!path.isAbsolute(value.pythonExecutable)||!path.isAbsolute(value.nodeExecutable)||!/^S-1-[0-9-]+$/.test(value.ownerSid)||!value.sourceHashes||Object.keys(value.sourceHashes).some(name=>name.split('/').includes('..')||path.isAbsolute(name)))throw Error('TASK_CONFIG_REJECTED');
 if(value.runtimeMode!==undefined&&!['flags-off','delivery'].includes(value.runtimeMode))throw Error('TASK_RUNTIME_MODE_REJECTED');
 verify(value.productionPlan,value.productionPlanSha256);
 for(const [name,digest]of Object.entries(value.sourceHashes))verify(path.join(value.snapshot,name),digest);
 verify(path.join(value.snapshot,'service/environment.json'),value.environmentSha256);
 verify(path.join(value.snapshot,'service/secrets.dpapi'),value.encryptedBundleSha256);
 if(value.binaryHashes){for(const name of ['nodeExecutable','pythonExecutable']){const digest=value.binaryHashes[name];if(!/^[a-f0-9]{64}$/.test(digest||''))throw Error('TASK_BINARY_PIN_REQUIRED');const h=crypto.createHash('sha256'),fd=fs.openSync(value[name],'r'),buffer=Buffer.alloc(1024*1024);try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null)))h.update(buffer.subarray(0,n));}finally{fs.closeSync(fd);}if(h.digest('hex')!==digest)throw Error('TASK_BINARY_DRIFT');}}
 return value;
}
function stateWriter(file){return value=>{const temp=file+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}};}
async function run(argv=process.argv.slice(2)){
 if(argv.length!==4||argv[0]!=='--config'||argv[2]!=='--config-sha256')throw Error('TASK_CONFIG_ARGUMENTS_REQUIRED');
 const configFile=path.resolve(argv[1]),config=configuration(configFile,argv[3]),save=stateWriter(path.join(path.dirname(configFile),'state.json'));
 const log=process.env.HDWORK2_RAW_LOG_ENABLED==='true'?require(path.join(config.snapshot,'src/observability/raw-log')).logger():{emit(){},async flush(){}};
 const restoreOutput=process.env.HDWORK2_RAW_LOG_ENABLED==='true'?require(path.join(config.snapshot,'src/observability/raw-log')).captureOutput(log):()=>{};
 log.emit('TASK_START',{status:'STARTING'});
 const originalSpawn=cp.spawn,originalLog=console.log;
 let python,ready=false,ownerGone=false,forceTimer,heartbeat;
 const startedAt=new Date().toISOString();let status='STARTING',failureDiagnostic=null;
 const record=code=>{log.emit('TASK_STATE',{status,reason:code});return save({status,code,runtimeMode:config.runtimeMode||'delivery',nodePid:process.pid,pythonPid:python?.pid||null,startedAt,updatedAt:new Date().toISOString(),ownerSid:config.ownerSid,botId:config.botId,telegramBotId:config.telegramBotId,baseCommit:config.baseCommit,patchCommit:config.patchCommit,configSha256:argv[3],productionPlanSha256:config.productionPlanSha256,liveChatEndToEndVerified:false,...(failureDiagnostic?{startupDiagnostic:failureDiagnostic}:{})});};
 const stop=()=>{
  if(ownerGone)return;ownerGone=true;status='STOPPING';record('OWNER_STOP');
  if(python&&python.exitCode===null){python.stdin.end('STOP\n');if(process.env.HDWORK2_NATIVE_GRACEFUL_ONLY!=='true')forceTimer=setTimeout(()=>{if(python.exitCode===null)python.kill();},15000);}
  if(ready)setImmediate(()=>process.emit('SIGTERM'));
 };
 process.stdin.once('end',stop);process.stdin.on('data',data=>{if(data.toString('utf8').includes('STOP'))stop();});process.stdin.resume();
 cp.spawn=(exe,args,options)=>{
  if(ownerGone)throw Error('TASK_OWNER_STOPPED');
  const target=exe==='python'&&(args?.join(' ')==='-B -m courier --run'||(args?.[0]==='-B'&&args?.[1]==='-c'&&args?.[3]==='--run'));
  const child=originalSpawn(target?config.pythonExecutable:exe,args,options);
  if(target){python=child;child.stdin.on('error',()=>{});}return child;
 };
 console.log=value=>{
  try{const event=JSON.parse(value);if(event.status==='COURIER_STARTED_IDENTITY_AND_LEASE_VERIFIED'&&event.botId===config.botId&&event.telegramBotId===config.telegramBotId){ready=true;status=ownerGone?'STOPPING':'READY';record('IDENTITY_AND_LEASE_VERIFIED');if(ownerGone)setImmediate(()=>process.emit('SIGTERM'));}}catch{}
  // Output is drained by the owner; no raw output is persisted to disk.
  originalLog(value);
 };
 record('START_REQUESTED');heartbeat=setInterval(()=>record(config.runtimeMode==='flags-off'?'FLAGS_OFF_NO_TRANSPORT':ready?'IDENTITY_AND_LEASE_VERIFIED':'STARTING'),5000);heartbeat.unref();
 try{
  if(config.runtimeMode==='flags-off'){
   // Verify existing local pins only. No loader, DPAPI, backend, Python or Telegram import.
   status='READY';record('FLAGS_OFF_NO_TRANSPORT');
   if(!ownerGone)await new Promise(resolve=>{const check=setInterval(()=>{if(ownerGone){clearInterval(check);resolve();}},50);});
   status='STOPPED';record('FLAGS_OFF_STOPPED');return;
  }
  await require(path.join(config.snapshot,'scripts/run-production-live-chat-courier.js')).run(['--run-production-approved','--plan',config.productionPlan]);status='STOPPED';record('COURIER_STOPPED');}
 catch(error){log.emit('TASK_FAILURE',{status:'ERROR'},error);status=ownerGone?'STOPPED':'FAILED';failureDiagnostic=safeStartupDiagnostic(error?.startupDiagnostic);const code=failureDiagnostic?'COURIER_STARTUP_FAILED':/^(ER_[A-Z_]+|EADDRINUSE|EACCES|EPERM|ENOENT|ECONNREFUSED|ETIMEDOUT|PRIVATE_DB_CONFIG_REJECTED|DPAPI_[A-Z_]+)$/.test(error.code||'')?error.code:'COURIER_TASK_FAILED';record(code);if(!ownerGone)process.exitCode=1;}
 finally{clearInterval(heartbeat);clearTimeout(forceTimer);cp.spawn=originalSpawn;console.log=originalLog;process.stdin.destroy();restoreOutput();await log.flush();}
}
if(require.main===module)run().catch(()=>{console.error('COURIER_TASK_BOOTSTRAP_REJECTED');process.exitCode=1;});
module.exports={configuration,verify,hash,run,safeStartupDiagnostic};

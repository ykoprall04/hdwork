// Run only after deployment approval on the Windows host owning the existing DPAPI refs.
// This supervisor owns one backend transport and one Python poller, never another bot.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {operatorJson}=require('../src/config/operator-json');
const {load,validate}=require('../src/config/production-courier');
const {clearSecrets}=require('../src/config/private-courier-env');
const startupPhases=new Set(['PYTHON_STARTUP','PYTHON_CONFIG','LOCK_DIRECTORY','JOURNAL_DIRECTORY','BOT_LOCK','JOURNAL_OPEN','JOURNAL_SEED','TELEGRAM_IDENTITY','INGRESS_POLICY','WORKER_LEASE']);
const startupTypes=new Set(['PermissionError','FileNotFoundError','OSError','ValueError','TypeError','RuntimeError','ImportError','ModuleNotFoundError','OperationalError','DatabaseError','IntegrityError','TransportError','TimeoutError','OTHER_EXCEPTION']);
function safeStartupDiagnostic(value){
 if(value?.event!=='STARTUP_FAILURE'||!startupPhases.has(value.phase)||!startupTypes.has(value.exceptionType))return null;
 return {component:'PYTHON',phase:value.phase,exceptionType:value.exceptionType,...([400,401,403,409,429,503].includes(value.httpStatus)?{httpStatus:value.httpStatus}:{}),...(Number.isInteger(value.osError)&&value.osError>0&&value.osError<256?{osError:value.osError}:{})};
}
async function run(argv=process.argv.slice(2)){
 if(argv.length!==3||argv[0]!=='--run-production-approved'||argv[1]!=='--plan')throw Error('EXPLICIT_PRODUCTION_DEPLOYMENT_APPROVAL_REQUIRED');
 const file=path.resolve(argv[2]),stat=fs.lstatSync(file);
 const actual=fs.realpathSync(file),same=process.platform==='win32'?actual.toLowerCase()===file.toLowerCase():actual===file;
 if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>1024*1024||!same)throw Error('PRIVATE_PRODUCTION_PLAN_REQUIRED');
 const plan=validate(operatorJson(fs.readFileSync(file)));
 const rawHash=require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 let backend,child,backendEnv,pythonEnv,childDone,closing=false,stopPromise,phase='PLAN_VALIDATION',startupDiagnostic=null;
 const stop=()=>stopPromise||=(async()=>{
  closing=true;
  if(child&&child.exitCode===null){child.stdin.end('STOP\n');const timer=process.env.HDWORK2_NATIVE_GRACEFUL_ONLY==='true'?null:setTimeout(()=>child.kill(),15000);try{await childDone;}finally{clearTimeout(timer);}}
  await backend?.close();
  if(backendEnv)clearSecrets(backendEnv);if(pythonEnv)clearSecrets(pythonEnv);
 })();
 try{
  phase='SECRET_LOAD';
  backendEnv=await load(plan,{kind:'backend'});pythonEnv=await load(plan,{kind:'python'});
  if(require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==rawHash)throw Error('PRODUCTION_PLAN_CHANGED');
  phase='BACKEND_START';
  backend=await require('../courier-b2c-server').startIntegration({env:backendEnv,deferInboxWorker:true});
  const childEnv=Object.fromEntries(['SystemRoot','WINDIR','PATH','Path','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramData','HDWORK2_RAW_LOG_ENABLED','HDWORK2_LOG_DIRECTORY'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  Object.assign(childEnv,pythonEnv,{PYTHONDONTWRITEBYTECODE:'1'});
  phase='PYTHON_STARTUP';
  const startupTrace=fs.readFileSync(path.join(__dirname,'courier-startup-trace.py'),'utf8');
  child=spawn('python',['-B','-c',startupTrace,'--run'],{cwd:path.resolve(__dirname,'../courier_bot'),env:childEnv,windowsHide:true,stdio:['pipe','pipe','pipe']});clearSecrets(childEnv);
  child.stdin.on('error',()=>{});
  childDone=new Promise(resolve=>{child.once('exit',resolve);child.once('error',resolve);});
  // Never echo Python stderr, environment, Telegram responses or payloads.
  let stderrPending='';
  child.stderr.on('data',bytes=>{
   require('../src/observability/raw-log').logger().emit('PYTHON_STDERR',{count:bytes.length});
   stderrPending+=bytes.toString('utf8');if(stderrPending.length>16384){stderrPending='';return;}
   let end;while((end=stderrPending.indexOf('\n'))>=0){const line=stderrPending.slice(0,end);stderrPending=stderrPending.slice(end+1);try{startupDiagnostic=safeStartupDiagnostic(JSON.parse(line))||startupDiagnostic;}catch{}}
  });
  phase='READY_HANDSHAKE';
  await new Promise((resolve,reject)=>{
   let output='';const timeout=setTimeout(()=>reject(Error('PRODUCTION_COURIER_READY_TIMEOUT')),30000);
   const fail=()=>{clearTimeout(timeout);const error=Error('PRODUCTION_COURIER_START_FAILED');error.code='COURIER_STARTUP_FAILED';error.startupDiagnostic=startupDiagnostic||{component:'PYTHON',phase:'READY_HANDSHAKE',exceptionType:'OTHER_EXCEPTION'};reject(error);};
   // `exit` can precede the final stderr bytes; wait for stdio closure so the
   // sanitized Python failure receipt reaches the supervisor before failing.
   child.once('error',fail);child.once('close',fail);
   child.stdout.on('data',bytes=>{
    require('../src/observability/raw-log').logger().emit('PYTHON_STDOUT',{count:bytes.length});
    output+=bytes.toString('utf8');if(output.length>4096)return fail();
    const end=output.indexOf('\n');if(end<0)return;
    try{const event=JSON.parse(output.slice(0,end));if(event.event!=='READY'||event.productionIdentityVerified!==true||event.send!==(plan.receiveOnly!==true))return fail();clearTimeout(timeout);resolve();}catch{fail();}
   });
  });
  phase='INBOX_WORKER_START';backend.startWorker();
  console.log(JSON.stringify({status:'COURIER_STARTED_IDENTITY_AND_LEASE_VERIFIED',botId:plan.botId,telegramBotId:plan.telegramBotId,activationNotBefore:plan.activationNotBefore,receiveOnly:plan.receiveOnly===true,send:plan.receiveOnly!==true,liveChatEndToEndVerified:false}));
  process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
  await childDone;
  if(!closing)throw Error('PRODUCTION_COURIER_EXITED');
 }catch(error){
  if(!error.startupDiagnostic)error.startupDiagnostic={component:'NODE',phase,exceptionType:['Error','TypeError','RangeError','ReferenceError'].includes(error?.name)?error.name:'OTHER_EXCEPTION',...(Number.isInteger(error?.errno)&&error.errno>0&&error.errno<256?{osError:error.errno}:{})};
  if(!error.code)error.code='COURIER_STARTUP_FAILED';throw error;
 }finally{await stop();}
}
if(require.main===module)run().catch(()=>{console.error(JSON.stringify({status:'STOPPED',code:'PRODUCTION_COURIER_NOT_READY_OR_STOPPED',queueRetained:true}));process.exitCode=1;});
module.exports={run,safeStartupDiagnostic};

// Management wrapper for the approved supervisor; production source is not patched.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const phases=new Set(['PYTHON_STARTUP','PYTHON_CONFIG','LOCK_DIRECTORY','JOURNAL_DIRECTORY','BOT_LOCK','JOURNAL_OPEN','JOURNAL_SEED','TELEGRAM_IDENTITY','INGRESS_POLICY','WORKER_LEASE']);
const types=new Set(['PermissionError','FileNotFoundError','OSError','ValueError','TypeError','RuntimeError','ImportError','ModuleNotFoundError','OperationalError','DatabaseError','IntegrityError','TransportError','TimeoutError','OTHER_EXCEPTION']);
function safeEvent(value){
 if(value?.event!=='STARTUP_FAILURE'||!phases.has(value.phase)||!types.has(value.exceptionType))return null;
 return {event:'STARTUP_FAILURE',phase:value.phase,exceptionType:value.exceptionType,...([400,401,403,409,429,503].includes(value.httpStatus)?{httpStatus:value.httpStatus}:{}),...(Number.isInteger(value.osError)&&value.osError>0&&value.osError<256?{osError:value.osError}:{})};
}
function instrument(spawn,source,report){return (exe,args,options)=>{
 if(exe!=='python'||args?.join(' ')!=='-B -m courier --run')return spawn(exe,args,options);
 const child=spawn(exe,['-B','-c',source,'--run'],options);let pending='',bytes=0;
 child.stderr.on('data',buffer=>{
  bytes+=buffer.length;if(bytes>16384)return;pending+=buffer.toString('utf8');let end;
  while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);try{const event=safeEvent(JSON.parse(line));if(event)report(event);}catch{}}
 });return child;
};}
async function run(argv=process.argv.slice(2)){
 if(argv.length!==8||argv[0]!=='--snapshot'||argv[2]!=='--plan'||argv[4]!=='--plan-sha256'||argv[6]!=='--approved-deployment'||argv[7]!=='yes')throw Error('APPROVED_SNAPSHOT_PLAN_REQUIRED');
 const snapshot=path.resolve(argv[1]),planFile=path.resolve(argv[3]);
 if(!/^[a-f0-9]{64}$/.test(argv[5])||require('node:crypto').createHash('sha256').update(fs.readFileSync(planFile)).digest('hex')!==argv[5])throw Error('APPROVED_PLAN_HASH_MISMATCH');
 const original=cp.spawn,source=fs.readFileSync(path.join(__dirname,'courier-startup-trace.py'),'utf8');
 cp.spawn=instrument(original,source,event=>console.error(JSON.stringify(event)));
 try{
  const launcher=path.join(snapshot,'scripts/run-production-live-chat-courier.js');
  await require(launcher).run(['--run-production-approved','--plan',planFile]);
 }catch(error){
  const code=/^(ER_[A-Z_]+|EADDRINUSE|EACCES|EPERM|ENOENT|ECONNREFUSED|ETIMEDOUT|PRIVATE_DB_CONFIG_REJECTED|DPAPI_[A-Z_]+)$/.test(error.code||'')?error.code:
   ['PRODUCTION_COURIER_START_FAILED','PRODUCTION_COURIER_READY_TIMEOUT','PRODUCTION_COURIER_EXITED','PRODUCTION_PLAN_CHANGED'].includes(error.message)?error.message:
   error.message==='Production routing drift'?'PRODUCTION_ROUTING_DRIFT':error.message==='Courier database grants rejected'?'COURIER_GRANTS_REJECTED':'COURIER_STARTUP_FAILED';
  console.error(JSON.stringify({status:'STOPPED',code,queueRetained:true}));process.exitCode=1;
 }finally{cp.spawn=original;}
}
if(require.main===module)run().catch(()=>{console.error('APPROVED_TRACE_INPUT_REQUIRED');process.exitCode=1;});
module.exports={run,instrument,safeEvent};

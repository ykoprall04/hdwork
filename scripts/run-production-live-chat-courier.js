// Run only after deployment approval on the Windows host owning the existing DPAPI refs.
// This supervisor owns one backend transport and one Python poller, never another bot.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {operatorJson}=require('../src/config/operator-json');
const {load,validate}=require('../src/config/production-courier');
const {clearSecrets}=require('../src/config/private-courier-env');
async function run(argv=process.argv.slice(2)){
 if(argv.length!==3||argv[0]!=='--run-production-approved'||argv[1]!=='--plan')throw Error('EXPLICIT_PRODUCTION_DEPLOYMENT_APPROVAL_REQUIRED');
 const file=path.resolve(argv[2]),stat=fs.lstatSync(file);
 const actual=fs.realpathSync(file),same=process.platform==='win32'?actual.toLowerCase()===file.toLowerCase():actual===file;
 if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>1024*1024||!same)throw Error('PRIVATE_PRODUCTION_PLAN_REQUIRED');
 const plan=validate(operatorJson(fs.readFileSync(file)));
 const rawHash=require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 let backend,child,backendEnv,pythonEnv,childDone,closing=false,stopPromise;
 const stop=()=>stopPromise||=(async()=>{
  closing=true;
  if(child&&child.exitCode===null){child.stdin.end('STOP\n');const timer=setTimeout(()=>child.kill(),15000);try{await childDone;}finally{clearTimeout(timer);}}
  await backend?.close();
  if(backendEnv)clearSecrets(backendEnv);if(pythonEnv)clearSecrets(pythonEnv);
 })();
 try{
  backendEnv=await load(plan,{kind:'backend'});pythonEnv=await load(plan,{kind:'python'});
  if(require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==rawHash)throw Error('PRODUCTION_PLAN_CHANGED');
  backend=await require('../courier-b2c-server').startIntegration({env:backendEnv,deferInboxWorker:true});
  const childEnv=Object.fromEntries(['SystemRoot','WINDIR','PATH','Path','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  Object.assign(childEnv,pythonEnv,{PYTHONDONTWRITEBYTECODE:'1'});
  child=spawn('python',['-B','-m','courier','--run'],{cwd:path.resolve(__dirname,'../courier_bot'),env:childEnv,windowsHide:true,stdio:['pipe','pipe','pipe']});clearSecrets(childEnv);
  child.stdin.on('error',()=>{});
  childDone=new Promise(resolve=>{child.once('exit',resolve);child.once('error',resolve);});
  // Never echo Python stderr, environment, Telegram responses or payloads.
  child.stderr.on('data',()=>{});
  await new Promise((resolve,reject)=>{
   let output='';const timeout=setTimeout(()=>reject(Error('PRODUCTION_COURIER_READY_TIMEOUT')),30000);
   const fail=()=>{clearTimeout(timeout);reject(Error('PRODUCTION_COURIER_START_FAILED'));};
   child.once('error',fail);child.once('exit',fail);
   child.stdout.on('data',bytes=>{
    output+=bytes.toString('utf8');if(output.length>4096)return fail();
    const end=output.indexOf('\n');if(end<0)return;
    try{const event=JSON.parse(output.slice(0,end));if(event.event!=='READY'||event.productionIdentityVerified!==true||event.send!==true)return fail();clearTimeout(timeout);resolve();}catch{fail();}
   });
  });
  backend.startWorker();
  console.log(JSON.stringify({status:'COURIER_STARTED_IDENTITY_AND_LEASE_VERIFIED',botId:plan.botId,telegramBotId:plan.telegramBotId,activationNotBefore:plan.activationNotBefore,liveChatEndToEndVerified:false}));
  process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
  await childDone;
  if(!closing)throw Error('PRODUCTION_COURIER_EXITED');
 }finally{await stop();}
}
if(require.main===module)run().catch(()=>{console.error(JSON.stringify({status:'STOPPED',code:'PRODUCTION_COURIER_NOT_READY_OR_STOPPED',queueRetained:true}));process.exitCode=1;});
module.exports={run};

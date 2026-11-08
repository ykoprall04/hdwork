// Explicit, time-limited receive-only entrypoint. No automatic dotenv imports.
const fs=require('node:fs'),path=require('node:path');
const {validatePlan,loadCourierSecrets,clearSecrets}=require('../src/config/private-courier-env');
async function run(){
 const mode=process.argv[2];if(process.argv.length!==3||!['--check','--run-backend-receive-only','--run-python-receive-only'].includes(mode))throw Error('Mode rejected');
 const plan=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../.local/courier.receive-only.plan.json'),'utf8'));
 if(mode==='--check'){try{validatePlan(plan);console.log(JSON.stringify({status:'PLAN_VALID_ONLY',started:false}));}catch{console.log(JSON.stringify({status:'BLOCKED',started:false,code:'PRIVATE_PLAN_INCOMPLETE_OR_NOT_APPROVED'}));process.exitCode=2;}return;}
 if(process.env.HDWORK2_COURIER_RUN_APPROVED!=='true')throw Error('Explicit runtime approval required');
 const until=validatePlan(plan),kind=mode.includes('backend')?'backend':'python';
 const env=await loadCourierSecrets(plan,{kind});let app,child,timer,forceTimer,closing=false;
 const close=async()=>{if(closing)return;closing=true;clearTimeout(timer);if(app)await app.close();if(child&&child.exitCode===null){child.stdin.end('STOP\n');forceTimer=setTimeout(()=>{if(child.exitCode===null)child.kill();},15000);}};
 try{
  validatePlan(plan);
  if(kind==='backend')app=await require('../courier-b2c-server').startIntegration({env});
  else{
   const childEnv={};for(const key of ['SystemRoot','PATH','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'])if(process.env[key])childEnv[key]=process.env[key];Object.assign(childEnv,env,{PYTHONDONTWRITEBYTECODE:'1'});
   child=require('node:child_process').spawn('python',['-B','-m','courier','--run'],{cwd:path.resolve(__dirname,'../courier_bot'),env:childEnv,windowsHide:true,stdio:['pipe','ignore','ignore']});clearSecrets(childEnv);
   child.stdin.on('error',()=>{});child.once('error',()=>{process.exitCode=1;void close().catch(()=>{process.exitCode=1;});});child.once('exit',code=>{clearTimeout(timer);clearTimeout(forceTimer);if(code)process.exitCode=1;});
  }
  const stop=()=>void close().catch(()=>{process.exitCode=1;console.error(JSON.stringify({code:'PRIVATE_COURIER_CLEANUP_FAILED'}));});
  timer=setTimeout(stop,Math.max(1,until-Date.now()));process.once('SIGINT',stop);process.once('SIGTERM',stop);
  console.log(JSON.stringify({status:kind==='backend'?'RECEIVE_ONLY_BACKEND_STARTED':'RECEIVE_ONLY_CHILD_REQUESTED',kind,send:false}));
 }catch{await close();throw Error('Private courier startup rejected');}
 finally{clearSecrets(env);}
}
if(require.main===module)run().catch(()=>{console.error(JSON.stringify({status:'BLOCKED',code:'PRIVATE_COURIER_REJECTED'}));process.exitCode=1;});
module.exports={run};

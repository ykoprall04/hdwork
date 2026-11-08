// Check is offline. Start requires a separately approved, fully populated plan.
// Remote-managed token is DPAPI -> process memory -> child env only; no argv/log.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),https=require('node:https');
const {spawn}=require('node:child_process'),{randomBytes}=require('node:crypto');
const {blockers}=require('../src/config/tunnel-plan');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'.local/cloudflare'),stateFile=path.join(folder,'run.json');
async function run(){
 const mode=process.argv[2];if(!['check','stop','--approved-start'].includes(mode)||process.argv.length!==3)throw Error('Invalid mode');
 if(mode==='stop'){
  if(!fs.existsSync(stateFile)){console.log(JSON.stringify({status:'NOT_RUNNING'}));return;}
  const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));if(!/^hdwork2-tunnel-[a-f0-9]{48}$/.test(state.pipeName||''))throw Error('Control pipe rejected');
  await new Promise((resolve,reject)=>{const client=net.createConnection('\\\\.\\pipe\\'+state.pipeName);client.setTimeout(3000,()=>client.destroy());client.once('connect',()=>client.end('stop'));client.on('error',reject);client.once('close',resolve);});
  console.log(JSON.stringify({status:'STOP_REQUESTED_ONLY_OWNED_TUNNEL'}));return;
 }
 const plan=JSON.parse(fs.readFileSync(path.join(folder,'plan.json'),'utf8')),reasons=blockers(plan);
 if(reasons.length){console.log(JSON.stringify({status:'BLOCKED',publicStarted:false,blockers:reasons}));process.exitCode=2;return;}
 if(mode==='check'){console.log(JSON.stringify({status:'PLAN_REVIEWED_NOT_STARTED',publicStarted:false}));return;}
 if(fs.existsSync(stateFile))throw Error('Existing state must be reviewed; not overwritten');
 // Health probe is mandatory before any external process can be launched.
 await new Promise((resolve,reject)=>{const req=https.get({hostname:'127.0.0.1',servername:'localhost',port:8443,path:'/ready',ca:fs.readFileSync(path.join(root,'.local/tls/ca.crt')),rejectUnauthorized:true,agent:false},res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>{try{const value=JSON.parse(body);res.statusCode===200&&value.ok&&value.scope==='operations'?resolve():reject(Error('Operational origin not ready'));}catch{reject(Error('Origin response rejected'));}});});req.setTimeout(5000,()=>req.destroy());req.on('error',reject);});
 const pipeName='hdwork2-tunnel-'+randomBytes(24).toString('hex');let child,timer,approvalTimer,attempt=0,stopping=false;
 const state={pipeName,status:'STARTING',attempt:0,childPid:null};const save=()=>fs.writeFileSync(stateFile,JSON.stringify(state,null,2)+'\n',{mode:0o600});
 const server=net.createServer(client=>{let text='';client.on('data',b=>{text+=b;if(text.length>64)client.destroy();});client.once('end',()=>{if(text==='stop')close();});});
 const close=()=>{if(stopping)return;stopping=true;clearTimeout(timer);clearTimeout(approvalTimer);if(child?.pid&&child.exitCode===null)child.kill();server.close();state.status='STOPPED';save();console.log(JSON.stringify({event:'tunnel-stopped'}));};
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen('\\\\.\\pipe\\'+pipeName,resolve);});save();
 const start=async()=>{
  if(stopping)return;if(blockers(plan).length){close();return;}
  let token=await require('../src/config/private-database-env').readPrivateDpapi(plan.tokenDpapiFile);
  const childEnv={};for(const name of ['SystemRoot','PATH','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'])if(process.env[name])childEnv[name]=process.env[name];childEnv.TUNNEL_TOKEN=token;
  child=spawn('C:/Program Files (x86)/cloudflared/cloudflared.exe',['tunnel','--config',path.join(folder,'remote-run.yml'),'--no-autoupdate','run',plan.tunnelId],{env:childEnv,windowsHide:true,stdio:'ignore'});delete childEnv.TUNNEL_TOKEN;token='';
  state.childPid=child.pid||null;state.attempt=attempt;state.status='STARTING_NOT_YET_ATTESTED_HEALTHY';save();console.log(JSON.stringify({event:'tunnel-process-started',attempt}));
  child.once('error',()=>close());child.once('exit',code=>{if(stopping)return;console.log(JSON.stringify({event:'tunnel-process-exit',code}));if(attempt>=Math.min(2,Number(plan.maxRestarts)||0)){close();return;}attempt++;timer=setTimeout(()=>start().catch(()=>close()),Math.min(10000,2000*2**(attempt-1)));});
 };
 process.once('SIGINT',close);process.once('SIGTERM',close);
 approvalTimer=setTimeout(close,Date.parse(plan.approvalUntil)-Date.now());
 try{await start();}catch{close();throw Error('Tunnel process rejected');}
}
if(require.main===module)run().catch(()=>{console.error(JSON.stringify({status:'BLOCKED',code:'TUNNEL_CONTROL_REJECTED'}));process.exitCode=1;});
module.exports={run};

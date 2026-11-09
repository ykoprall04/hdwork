// Explicit start modes run only the owned loopback runtime. No Tunnel commands.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'.local/office-web');
const {officeEnvironment,officeIngress,checkFiles}=require('../src/config/office-web');
function prepare(dist){
  if(typeof dist!=='string')throw Error('Supply existing public build directory');
  const publicEnv=officeEnvironment({dist:path.resolve(root,dist)}),localEnv=officeEnvironment({local:true});
  require('../src/config/web-build').webBuild(root,publicEnv);
  const files={'local.environment':localEnv,'public.environment':publicEnv};
  fs.mkdirSync(folder,{recursive:true});
  for(const [name,env]of Object.entries(files)){
    const target=path.join(folder,name);if(fs.existsSync(target))throw Error('Existing office profile preserved');
    fs.writeFileSync(target,Object.entries(env).map(([k,v])=>k+'='+v).join('\n')+'\n',{flag:'wx',mode:0o600});
  }
  fs.writeFileSync(path.join(folder,'ingress.review.yml'),officeIngress(),{flag:'wx',mode:0o600});
  const {checks}=require('../src/config/tunnel-plan');
  fs.writeFileSync(path.join(folder,'tunnel.plan.review.json'),JSON.stringify({tunnelName:'hdwork2',hostname:'hdwork.yoloo.space',tunnelId:null,securityMode:'application-session',access:{required:false},applicationAuth:{sessionV2:true,operationalReadOnly:true,endpointAllowlistVerified:false,loginRateLimitVerified:false,proxyBoundaryVerified:false,liveSessionVerified:false},origin:'https://127.0.0.1:8443',originServerName:'localhost',noTLSVerify:false,checks:Object.fromEntries(checks.map(key=>[key,false])),publicStartApproved:false,approvalUntil:null,tokenDpapiFile:'.local/cloudflare/hdwork2-token.dpapi',maxRestarts:2},null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({prepared:true,folder,...checkFiles(localEnv)}));
}
async function main(args=process.argv.slice(2)){
  if(args.length===2&&args[0]==='--prepare')return prepare(args[1]);
  if(!((args.length===1&&['--check','--check-public'].includes(args[0]))||(args.length===2&&['--start-local','--start-public-origin'].includes(args[0])&&args[1]==='--approved')))throw Error('Unsupported office web mode');
  const publicMode=['--check-public','--start-public-origin'].includes(args[0]);
  const env=require('dotenv').parse(fs.readFileSync(path.join(folder,publicMode?'public.environment':'local.environment'))),check=checkFiles(env);
  if(args[0].startsWith('--check')){console.log(JSON.stringify(check));if(!check.ok)process.exitCode=2;return;}
  if(!check.ok)throw Error('Office prerequisites incomplete; run --check');
  for(const key of Object.keys(process.env))if(/^(HDWORK2_|DB_|OP_READ_|OP_WRITE_|COURIER_|B2C_|JWT_SECRET|LOCAL_WEB_DIST|FRONTEND_ORIGIN)/.test(key))delete process.env[key];
  Object.assign(process.env,env,{HDWORK2_SERVICE_AUTH_APPROVED:'true',HDWORK2_ONLINE_RUNTIME_APPROVED:'true'});
  console.log('Starting owned loopback HTTPS only. Login/logout may write sessions/audit; operations read-only. Ctrl+C stops only this runtime.');
  process.argv=[process.execPath,path.join(root,'scripts/private-runtime.js'),'local'];
  await require('./private-runtime').run();
}
if(require.main===module)main().catch(()=>{console.error('OFFICE_WEB_BLOCKED: prerequisites or runtime validation failed; secrets hidden.');process.exitCode=1;});
module.exports={main};

// User-approved local auth window. Never submits login or reads browser fields.
const fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const {spawn}=require('node:child_process'),{X509Certificate,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),duration=14*60*1000;
function windowFlags(now=Date.now()){
 return {HDWORK2_AUTH_WRITE_ENABLED:'true',HDWORK2_AUTH_WRITE_APPROVAL:'APPROVED_AUTH_SESSION_AUDIT_ONLY',HDWORK2_AUTH_WRITE_UNTIL:new Date(now+duration).toISOString()};
}
function safe(error){return typeof error?.code==='string'&&/^[A-Z0-9_]+$/.test(error.code)?error.code:'AUTH_WINDOW_FAILED';}
async function main(){
 if(process.argv.length!==3||process.argv[2]!=='--approved-batch9')throw Error('Explicit approval argument required');
 const local=path.join(root,'.local'),work=fs.mkdtempSync(path.join(local,'real-auth-')),profile=path.join(work,'profile');fs.mkdirSync(profile);
 const flags=windowFlags(),report={state:'PREPARING',expiresAt:flags.HDWORK2_AUTH_WRITE_UNTIL,readOnly:true,authOnly:true,loginSubmittedByAgent:false,baseline:null,cleanupReason:null,chromeParentExited:null};
 const save=()=>fs.writeFileSync(path.join(work,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});save();
 let chrome,timer,stopping=false,reason='manual';
 function cleanup(){
  if(stopping)return;stopping=true;clearTimeout(timer);report.state='CLOSING';report.cleanupReason=reason;
  for(const name of Object.keys(flags))delete process.env[name];
  if(chrome?.pid&&chrome.exitCode===null&&chrome.signalCode===null)chrome.kill();
  save();const force=setTimeout(()=>{report.state='CLOSED_FORCED';save();process.exitCode=1;process.exit(1);},5000);force.unref();
 }
 try{
  Object.assign(process.env,flags);process.argv=[process.execPath,path.join(root,'scripts/private-runtime.js'),'auth-validation'];
  timer=setTimeout(()=>{reason='approval-deadline';process.emit('SIGTERM');},duration);
  await require('./private-runtime').run();
  process.once('SIGINT',cleanup);process.once('SIGTERM',cleanup);
  process.once('beforeExit',()=>{clearTimeout(timer);report.state='CLOSED';report.chromeParentExited=Boolean(!chrome||chrome.exitCode!==null||chrome.signalCode!==null);save();});
  const ca=fs.readFileSync(path.join(local,'tls/ca.crt'));
  async function probe(route,method='GET'){
   return new Promise((resolve,reject)=>{
    const req=https.request({hostname:'127.0.0.1',servername:'localhost',port:8443,path:route,method,ca,rejectUnauthorized:true,agent:false},res=>{let body='';res.setEncoding('utf8');res.on('data',b=>body+=b);res.on('end',()=>resolve({status:res.statusCode,body}));});
    req.setTimeout(5000,()=>req.destroy());req.on('error',reject);req.end();
   });
  }
  const ready=await probe('/ready'),anonymous=await probe('/api/auth/me'),admin=await probe('/api/admin/users','POST'),operations=await probe('/api/operations/orders','POST'),frontend=await probe('/login','HEAD');
  if(ready.status!==200||JSON.parse(ready.body).scope!=='auth'||anonymous.status!==401||admin.status!==503||operations.status!==503||frontend.status!==200)throw Error('Auth boundary check failed');
  report.boundaryChecks={ready:ready.status,scope:'auth',anonymousMe:anonymous.status,adminBlocked:admin.status,operationsBlocked:operations.status,frontend:frontend.status};
  const [[baseline]]=await require('../src/config/database').query("SELECT COUNT(*) AS total,COALESCE(SUM(revoked=TRUE),0) AS revoked,COALESCE(SUM(revoked=FALSE AND expires_at>UTC_TIMESTAMP(3)),0) AS active FROM hdwork2.hd2_sessions WHERE user_id IN (SELECT id FROM hdwork2.users WHERE role='SUPER_ADMIN' AND is_active=TRUE)");
  report.baseline=Object.fromEntries(Object.entries(baseline).map(([k,v])=>[k,Number(v)]));
  const leaf=new X509Certificate(fs.readFileSync(path.join(local,'tls/localhost.crt'))),pin=createHash('sha256').update(leaf.publicKey.export({type:'spki',format:'der'})).digest('base64');
  chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--new-window','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--no-proxy-server','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'--ignore-certificate-errors-spki-list='+pin,'https://localhost:8443/login'],{windowsHide:false,stdio:'ignore'});
  chrome.on('error',error=>{report.error=safe(error);reason='browser-start-failed';process.emit('SIGTERM');});
  chrome.on('exit',()=>{report.chromeParentExited=true;save();if(!stopping){reason='browser-closed';process.emit('SIGTERM');}});
  report.state='WAITING_FOR_USER_LOGIN';report.profilePreserved=true;save();
  console.log(JSON.stringify({state:report.state,url:'https://localhost:8443/login',expiresAt:report.expiresAt,expiresWIB:new Date(report.expiresAt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'}),boundaryChecks:report.boundaryChecks,report:path.relative(root,path.join(work,'report.json'))}));
 }catch(error){report.error=safe(error);reason='preflight-failed';process.emit('SIGTERM');cleanup();process.exitCode=1;console.error(JSON.stringify({state:'FAILED',code:report.error,report:path.relative(root,path.join(work,'report.json'))}));}
}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({state:'FAILED',code:safe(error)}));process.exitCode=1;});
module.exports={windowFlags};

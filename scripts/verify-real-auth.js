// Continue only after the user reports manual login. No credential-field access,
// screenshots, cookie extraction or network recording. Logout is through the UI.
const fs=require('node:fs'),path=require('node:path');
const {connectDevTools}=require('./diagnose-browser');
const {deadline,withSignal,sleep,safeCode,failure,retryBusy}=require('./browser-diagnosis-runtime');
const root=path.resolve(__dirname,'..');
async function run(){
 if(process.argv.length!==4||process.argv[2]!=='--user-confirmed')throw failure('USER_CONFIRMATION_REQUIRED');
 const folder=process.argv[3];if(!/^real-auth-[A-Za-z0-9]+$/.test(folder))throw failure('INVALID_WINDOW');
 const work=path.join(root,'.local',folder),file=path.join(work,'report.json'),window=JSON.parse(fs.readFileSync(file));
 if(window.state!=='WAITING_FOR_USER_LOGIN'||Date.now()+30000>=Date.parse(window.expiresAt))throw failure('AUTH_WINDOW_NOT_ACTIVE');
 const report={status:'running',stage:'preflight',me:null,refresh:null,logout:null,sessions:null,account:null,cleanupErrors:[],networkCodes:[],pageExceptionCount:0,blockedRequests:0,credentialFieldsRead:false};
 const budget=deadline(45000);let client,connection;
 const save=()=>fs.writeFileSync(path.join(work,'verification.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
 try{
  require('dotenv').config({path:path.join(root,'.env'),quiet:true});
  await require('../src/config/private-database-env').loadPrivatePassword();
  try{connection=await require('mysql2/promise').createConnection({host:'127.0.0.1',port:3306,user:'hdwork_auth',password:process.env.DB_PASSWORD,database:'hdwork2',connectTimeout:5000,multipleStatements:false});}finally{delete process.env.DB_PASSWORD;}
  const [[target]]=await connection.query('SELECT DATABASE() AS db,CURRENT_USER() AS account');
  if(target.db!=='hdwork2'||target.account!=='hdwork_auth@localhost')throw failure('SECURITY_DB_TARGET_MISMATCH');
  const [grants]=await connection.query('SHOW GRANTS FOR CURRENT_USER');if(!require('../src/access/database-audit').reviewGrants(grants).ok)throw failure('SECURITY_GRANTS_CHANGED');
  const data=await retryBusy('devtools-active-port-read',signal=>fs.promises.readFile(path.join(work,'profile/DevToolsActivePort'),{encoding:'utf8',signal}),{signal:budget.signal});
  const port=Number(data.split('\n')[0]);if(!Number.isInteger(port)||port<1||port>65535)throw failure('DEVTOOLS_PORT_REJECTED');
  const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list',{signal:budget.signal})).json();
  const page=pages.find(p=>{try{const url=new URL(p.url);return p.type==='page'&&url.origin==='https://localhost:8443'&&!url.pathname.startsWith('/preview');}catch{return false;}});
  if(!page)throw failure('AUTH_TAB_NOT_FOUND');const socket=new URL(page.webSocketDebuggerUrl);
  if(socket.protocol!=='ws:'||socket.hostname!=='127.0.0.1'||Number(socket.port)!==port)throw failure('DEVTOOLS_TARGET_REJECTED');
  client=await connectDevTools(socket.href,report,budget.signal,e=>budget.abort(e));
  const call=(method,params={})=>withSignal(client.call(method,params),budget.signal);
  await call('Page.enable');await call('Runtime.enable');
  const evaluate=async expression=>{const value=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(value.exceptionDetails)throw failure('AUTH_BROWSER_EVALUATION_FAILED');return value.result.value;};
  const me=()=>evaluate("fetch('/api/auth/me',{credentials:'include',cache:'no-store'}).then(async response=>{const value=await response.json();return {status:response.status,success:value.success===true,role:value.data?.role||null,userId:value.data?.id||null,csrfFormatValid:typeof value.csrf==='string'&&/^[a-f0-9]{64}$/.test(value.csrf)};})");
  report.stage='me-before-refresh';const initial=await me(),userId=initial.userId;delete initial.userId;report.me=initial;save();
  if(initial.status!==200||initial.role!=='SUPER_ADMIN'||!initial.csrfFormatValid||!userId)throw failure('REAL_SUPER_ADMIN_NOT_VERIFIED');
  const [[account]]=await connection.execute('SELECT role,is_active FROM hdwork2.users WHERE id=?',[userId]);
  if(account?.role!=='SUPER_ADMIN'||![1,true].includes(account.is_active))throw failure('SECURITY_ACCOUNT_MISMATCH');
  report.account={role:'SUPER_ADMIN',active:true,modifiedByAgent:false};
  const metrics=async()=>{const [[row]]=await connection.execute('SELECT COUNT(*) AS total,COALESCE(SUM(revoked=TRUE),0) AS revoked,COALESCE(SUM(revoked=FALSE AND expires_at>UTC_TIMESTAMP(3)),0) AS active,MIN(CASE WHEN revoked=FALSE AND expires_at>UTC_TIMESTAMP(3) THEN TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(3),expires_at) END) AS remaining FROM hdwork2.hd2_sessions WHERE user_id=?',[userId]);return Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v===null?null:Number(v)]));};
  const before=await metrics();if(before.total-window.baseline.total!==1||before.active-window.baseline.active!==1)throw failure('SESSION_DELTA_AMBIGUOUS');
  report.stage='refresh';await call('Page.reload',{ignoreCache:true});
  let uiReady=false;
  for(let i=0;i<60;i++){uiReady=await evaluate("location.origin==='https://localhost:8443'&&location.pathname!=='/login'&&Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Logout'&&!b.disabled)");if(uiReady)break;await sleep(150,budget.signal);}
  const refreshed=await me(),sameIdentity=refreshed.userId===userId;delete refreshed.userId;
  report.refresh={...refreshed,sameIdentity,authenticatedUi:uiReady};save();
  if(refreshed.status!==200||refreshed.role!=='SUPER_ADMIN'||!sameIdentity||!uiReady)throw failure('REFRESH_VALIDATION_FAILED');
  if(Date.now()+15000>=Date.parse(window.expiresAt))throw failure('AUTH_DEADLINE_TOO_CLOSE');
  report.stage='logout';
  await evaluate("(()=>{const button=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Logout'&&!b.disabled);if(!button)throw Error();button.click();return true;})()");
  let loginUi=false;
  for(let i=0;i<60;i++){loginUi=await evaluate("location.pathname==='/login'&&Boolean(document.querySelector('input[autocomplete=username]'))");if(loginUi)break;await sleep(150,budget.signal);}
  const afterMe=await me();delete afterMe.userId;const after=await metrics();
  report.logout={triggeredThroughUi:true,afterMe:afterMe.status,loginUi};
  report.sessions={createdDelta:after.total-window.baseline.total,revokedDelta:after.revoked-window.baseline.revoked,activeDelta:after.active-window.baseline.active,expiryWithinEightHours:before.remaining>0&&before.remaining<=28800&&before.remaining>=27900};
  if(afterMe.status!==401||!loginUi||report.sessions.createdDelta!==1||report.sessions.revokedDelta!==1||report.sessions.activeDelta!==0||!report.sessions.expiryWithinEightHours)throw failure('LOGOUT_REVOCATION_NOT_CONFIRMED');
  report.status='passed';report.stage='complete';
 }catch(error){report.status='failed';report.code=safeCode(error);process.exitCode=1;}
 finally{
  if(connection)await connection.end();delete process.env.DB_PASSWORD;
  if(client){try{await client.call('Browser.close',{},1000);}catch(error){if(error.code!=='DEVTOOLS_CLOSED')report.cleanupErrors.push({operation:'browser-close',code:safeCode(error)});}client.close();}
  budget.stop();budget.abort(failure('VERIFICATION_FINISHED'));save();
  console.log(JSON.stringify({...report,report:path.relative(root,path.join(work,'verification.json'))}));
 }
 return report;
}
if(require.main===module)run().catch(error=>{console.error(JSON.stringify({status:'failed',code:safeCode(error)}));process.exitCode=1;});
module.exports={run};

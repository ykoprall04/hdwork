// Real MySQL + visible Chrome. Credentials are entered by the user only.
const fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const {spawn}=require('node:child_process'),{X509Certificate,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),active=path.join(root,'.local/live-order-browser.active.json');
const orderId='7790b19e-f9d4-4c79-ae43-2ad10cdbf405',reference='LIVE-AO20261108142737';
const fail=code=>Object.assign(Error('Live browser check blocked'),{code});
function current(){const v=JSON.parse(fs.readFileSync(active,'utf8'));if(!path.resolve(v.folder).startsWith(path.join(root,'.local/live-browser-')))throw fail('CONTROL_PATH_REJECTED');return v;}
async function run(){
 const mode=process.argv.slice(2).join(' ');
 if(mode==='--status'){console.log(fs.readFileSync(path.join(current().folder,'report.json'),'utf8'));return;}
 if(mode==='--stop'){fs.writeFileSync(path.join(current().folder,'stop.request'),'stop\n',{flag:'wx'});console.log(JSON.stringify({stopRequested:true}));return;}
 if(mode!=='--run-approved')throw fail('EXPLICIT_BROWSER_APPROVAL_REQUIRED');
 if(fs.existsSync(active))throw fail('EXISTING_BROWSER_WINDOW_REQUIRES_REVIEW');
 require('dotenv').config({path:path.join(root,'.env'),quiet:true});
 const folder=fs.mkdtempSync(path.join(root,'.local/live-browser-')),profile=path.join(folder,'profile');fs.mkdirSync(profile);
 fs.writeFileSync(active,JSON.stringify({pid:process.pid,folder}),{flag:'wx'});
 const until=Date.now()+14*60000;
 Object.assign(process.env,{HDWORK2_AUTH_ONLY:'false',HDWORK2_AUTH_READ_DASHBOARD:'true',HDWORK2_AUTH_WRITE_ENABLED:'true',HDWORK2_AUTH_WRITE_APPROVAL:'APPROVED_AUTH_WITH_READ_ONLY_DASHBOARD',HDWORK2_AUTH_WRITE_UNTIL:new Date(until).toISOString(),HDWORK2_LOCAL_READ_ONLY:'true',HDWORK2_AUTH_V2:'true',HDWORK2_OPERATIONS_ENABLED:'true',B2C_WORKFLOW_READ_ENABLED:'false',B2C_STAGING_ENABLED:'false',COURIER_ENABLED:'false',COURIER_ALLOW_NETWORK:'false',OP_READ_ENABLED:'true',OP_READ_DB_USER:'hdwork_ops_read',OP_READ_DB_HOST:'127.0.0.1',OP_READ_DB_PORT:'3306',OP_READ_DB_NAME:'hdwork2',OP_READ_DB_PASSWORD_DPAPI_FILE:'.local/database-secrets/ops-read-password.dpapi',OP_WRITE_ENABLED:'false',HDWORK2_OPERATIONAL_WRITE_APPROVED:'false'});
 const report={status:'STARTING',orderId,reference,expiresAt:new Date(until).toISOString(),globalReadOnly:true,statusWritesAllowed:false,telegramEnabled:false,credentialsReadByAgent:false,cookiesRecorded:false,profilePreserved:true};
 const save=()=>fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2)+'\n');save();
 let app,chrome,timer,poll,stopping=false,pool;
 async function stop(reason){if(stopping)return;stopping=true;clearTimeout(timer);clearInterval(poll);report.stopReason=reason;
  try{if(chrome&&chrome.exitCode===null)chrome.kill();if(app)await app.close();else if(pool)await pool.end();await require('../src/config/operational-pools').close();report.cleanup=true;}finally{delete process.env.DB_PASSWORD;report.status='CLOSED';save();}
 }
 try{
  require('../src/config/auth-write-policy').validateAuthWriteScope();
  await require('../src/config/private-database-env').loadPrivatePassword();pool=require('../src/config/database');
  await require('../src/config/operational-pools').initialize();
  const read=require('../src/config/operational-pools').getReadPool();
  const [[order]]=await read.execute('SELECT id,status,version,chat_id,message_id,bot_id,sc_in FROM hd2_orders WHERE id=?',[orderId]);
  if(!order||order.chat_id!=='-5436357946'||order.message_id!=='6'||order.bot_id!=='hdworkopsbot-testing'||order.sc_in!==reference)throw fail('TEST_ORDER_TARGET_REJECTED');
  report.databaseOrder={id:order.id,status:order.status,version:Number(order.version),chatId:order.chat_id,messageId:order.message_id};
  app=await require('../local-web-server').startLocalWeb();delete process.env.DB_PASSWORD;
  const ca=fs.readFileSync(path.join(root,'.local/tls/ca.crt'));
  const probe=(route,method='GET')=>new Promise((resolve,reject)=>{const req=https.request({hostname:'127.0.0.1',servername:'localhost',port:8443,path:route,method,ca,agent:false},res=>{res.resume();res.once('end',()=>resolve(res.statusCode));});req.once('error',()=>reject(fail('HTTPS_PROBE_FAILED')));req.setTimeout(5000,()=>req.destroy());req.end();});
  report.boundary={health:await probe('/health'),anonymousMe:await probe('/api/auth/me'),anonymousOrders:await probe('/api/operations/orders'),operationalPost:await probe('/api/operations/orders','POST'),adminPost:await probe('/api/admin/users','POST')};
  if(report.boundary.health!==200||report.boundary.anonymousMe!==401||report.boundary.anonymousOrders!==401||report.boundary.operationalPost!==503||report.boundary.adminPost!==503)throw fail('BROWSER_BOUNDARY_FAILED');
  const cert=new X509Certificate(fs.readFileSync(path.join(root,'.local/tls/localhost.crt'))),pin=createHash('sha256').update(cert.publicKey.export({type:'spki',format:'der'})).digest('base64');
  chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--new-window','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--no-proxy-server','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'--ignore-certificate-errors-spki-list='+pin,'https://localhost:8443/login'],{windowsHide:false,stdio:'ignore'});
  chrome.once('error',()=>void stop('CHROME_FAILED'));chrome.once('exit',()=>void stop('CHROME_CLOSED'));
  report.status='WAITING_FOR_USER_LOGIN';report.profile=path.relative(root,profile);report.chromePid=chrome.pid;save();
  console.log(JSON.stringify({status:report.status,url:'https://localhost:8443/login',expiresAt:report.expiresAt,report:path.relative(root,path.join(folder,'report.json'))}));
  timer=setTimeout(()=>void stop('AUTH_WINDOW_EXPIRED'),Math.max(1,until-Date.now()));poll=setInterval(()=>{if(fs.existsSync(path.join(folder,'stop.request')))void stop('USER_STOP');},1000);process.once('SIGINT',()=>void stop('SIGNAL'));process.once('SIGTERM',()=>void stop('SIGNAL'));
 }catch(e){report.code=/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'LIVE_BROWSER_STARTUP_FAILED';save();await stop('STARTUP_FAILED');process.exitCode=1;}
}
if(require.main===module)run().catch(()=>{console.error(JSON.stringify({status:'FAIL',code:'LIVE_BROWSER_FAILED'}));process.exitCode=1;});

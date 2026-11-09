// Explicit live, one-order receive-only supervisor. Never imported by app startup.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),https=require('node:https');
const {spawn}=require('node:child_process'),{createHash,createHmac,randomBytes}=require('node:crypto');
const root=path.resolve(__dirname,'..'),active=path.join(root,'.local/live-ingestion.active.json');
const denied=code=>Object.assign(Error('Live test stopped'),{code});
function activeState(){const value=JSON.parse(fs.readFileSync(active,'utf8'));const folder=path.resolve(value.folder);if(!folder.startsWith(path.join(root,'.local/live-order-')))throw denied('CONTROL_PATH_REJECTED');return {...value,folder};}
async function telegram(token,method,body={}){
 if(!['getMe','getWebhookInfo','getChatMember'].includes(method))throw denied('TELEGRAM_METHOD_REJECTED');
 const payload=JSON.stringify(body);
 return new Promise((resolve,reject)=>{const req=https.request({hostname:'api.telegram.org',path:'/bot'+token+'/'+method,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)},timeout:10000},res=>{const chunks=[];let bytes=0;res.on('data',b=>{bytes+=b.length;if(bytes>65536){res.destroy();reject(denied('TELEGRAM_METADATA_TOO_LARGE'));}else chunks.push(b);});res.on('error',()=>reject(denied('TELEGRAM_METADATA_FAILED')));res.on('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(res.statusCode!==200||value.ok!==true)throw Error();resolve(value.result);}catch{reject(denied('TELEGRAM_METADATA_FAILED'));}finally{for(const b of chunks)b.fill(0);}});});req.once('error',()=>reject(denied('TELEGRAM_METADATA_FAILED')));req.once('timeout',()=>req.destroy());req.end(payload);});
}
async function run(){
 const mode=process.argv.slice(2).join(' ');
 if(mode==='--status'){if(!fs.existsSync(active))throw denied('NO_ACTIVE_LIVE_TEST');console.log(fs.readFileSync(path.join(activeState().folder,'report.json'),'utf8'));return;}
 if(mode==='--stop'){fs.writeFileSync(path.join(activeState().folder,'stop.request'),'stop\n',{flag:'wx'});console.log(JSON.stringify({stopRequested:true}));return;}
 if(mode!=='--run'||process.env.HDWORK2_COURIER_RUN_APPROVED!=='true')throw denied('EXPLICIT_LIVE_APPROVAL_REQUIRED');
 if(fs.existsSync(active))throw denied('EXISTING_LIVE_TEST_REQUIRES_REVIEW');
 const planFile=path.join(root,'.local/courier.receive-only.plan.json'),plan=JSON.parse(fs.readFileSync(planFile,'utf8'));
 const g=plan.groups?.[0];if(plan.botUsername!=='HDWorkOpsBot'||plan.telegramBotId!=='9133904377'||plan.database?.user!=='hdwork_courier'||plan.database?.name!=='hdwork2'||plan.groups?.length!==1||g.chatId!=='-5436357946'||g.threadId!==null||g.threadMode!=='non_topic'||g.profile!=='TIAL1'||g.commands?.join(',')!=='order'||plan.sendEnabled!==false)throw denied('LIVE_ALLOWLIST_REJECTED');
 const localEnv=require('dotenv').parse(fs.readFileSync(path.join(root,'.env')));if(localEnv.HDWORK2_LOCAL_READ_ONLY!=='true')throw denied('WEB_READ_ONLY_REQUIRED');
 await new Promise((resolve,reject)=>{const probe=net.createServer();probe.once('error',()=>reject(denied('COURIER_PORT_BUSY')));probe.listen(plan.port,'127.0.0.1',()=>probe.close(resolve));});
 const folder=fs.mkdtempSync(path.join(root,'.local/live-order-'));
 fs.writeFileSync(active,JSON.stringify({pid:process.pid,folder}),{flag:'wx'});
 fs.writeFileSync(path.join(folder,'plan-before.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
 const started=Date.now(),until=started+15*60000,reference='LIVE-AO'+new Date(started).toISOString().replace(/\D/g,'').slice(0,14),notBefore=Math.floor(started/1000);
 const report={status:'STARTING',bot:'HDWorkOpsBot',chatId:g.chatId,threadId:null,reference,startedAt:new Date(started).toISOString(),expiresAt:new Date(until).toISOString(),send:false,messagesSent:0,webReadOnly:true,orderId:null,orderStatus:null,cleanup:{backend:false,python:false}};
 const save=()=>fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2)+'\n');save();
 let app,child,readerManager,courierEnv,pythonEnv,timer,interval,closing=false,startupComplete=false,fatalReason,childDone,finishPromise,busy=false;
 const readEnv={HDWORK2_LOCAL_READ_ONLY:'true',OP_READ_ENABLED:'true',OP_READ_DB_USER:'hdwork_ops_read',OP_READ_DB_HOST:'127.0.0.1',OP_READ_DB_PORT:'3306',OP_READ_DB_NAME:'hdwork2',OP_READ_DB_PASSWORD_DPAPI_FILE:'.local/database-secrets/ops-read-password.dpapi'};
 const finish=(status,code)=>finishPromise||=(async()=>{
  closing=true;clearTimeout(timer);clearInterval(interval);report.status=status;if(code)report.code=code;save();
  if(child&&child.exitCode===null){child.stdin.end('STOP\n');let forced=false;const force=setTimeout(()=>{forced=true;if(child.exitCode===null)child.kill();},15000);await childDone;clearTimeout(force);report.cleanup.python=true;report.cleanup.pythonForced=forced;}else report.cleanup.python=true;
  if(app){const force=setTimeout(()=>app.server.closeAllConnections(),5000);try{app.server.closeIdleConnections?.();await app.close();report.cleanup.backend=true;}finally{clearTimeout(force);}}else report.cleanup.backend=true;
  if(readerManager)await readerManager.close();
  for(const env of [courierEnv,pythonEnv])if(env)require('../src/config/private-courier-env').clearSecrets(env);
  const current=JSON.parse(fs.readFileSync(planFile,'utf8'));if(current.approvalUntil===new Date(until).toISOString()){
   Object.assign(current,{enabled:false,ingestionWritesApproved:false,networkActivationApproved:false,approvalUntil:null,sendEnabled:false});fs.writeFileSync(planFile,JSON.stringify(current,null,2)+'\n');
  }
  report.finishedAt=new Date().toISOString();save();console.log(JSON.stringify({status:report.status,code:report.code,orderId:report.orderId,orderStatus:report.orderStatus,cleanup:report.cleanup,report:path.relative(root,path.join(folder,'report.json'))}));
 })();
 const fatal=code=>{fatalReason=code;if(startupComplete)void finish('FAIL',code).catch(()=>{process.exitCode=1;});};
 try{
  Object.assign(plan,{enabled:true,ingestionWritesApproved:true,networkActivationApproved:true,approvalUntil:new Date(until).toISOString(),sendEnabled:false});
  require('../src/config/private-courier-env').validatePlan(plan);fs.writeFileSync(planFile,JSON.stringify(plan,null,2)+'\n');
  courierEnv=await require('../src/config/private-courier-env').loadCourierSecrets(plan,{kind:'backend'});
  pythonEnv=await require('../src/config/private-courier-env').loadCourierSecrets(plan,{kind:'python'});
  const me=await telegram(pythonEnv.COURIER_TELEGRAM_BOT_TOKEN,'getMe');if(me.is_bot!==true||me.id!==9133904377||String(me.username).toLowerCase()!=='hdworkopsbot')throw denied('BOT_IDENTITY_REJECTED');
  const webhook=await telegram(pythonEnv.COURIER_TELEGRAM_BOT_TOKEN,'getWebhookInfo');if(webhook.url)throw denied('WEBHOOK_ALREADY_CONFIGURED');
  const member=await telegram(pythonEnv.COURIER_TELEGRAM_BOT_TOKEN,'getChatMember',{chat_id:g.chatId,user_id:9133904377});if(!['member','administrator','creator'].includes(member.status)&&!(member.status==='restricted'&&member.is_member))throw denied('BOT_NOT_IN_TESTING_GROUP');
  readerManager=require('../src/config/operational-pools').createManager({env:readEnv});await readerManager.initialize();const readPool=readerManager.get('read');
  const [[baseline]]=await readPool.query('SELECT COUNT(*) AS total FROM hd2_orders WHERE bot_id=?',[plan.botId]);if(Number(baseline.total)!==0)throw denied('TEST_BOT_ALREADY_HAS_ORDERS');report.baselineOrders=0;
  const audit=await require('mysql2/promise').createConnection({host:'127.0.0.1',port:3306,user:'hdwork_courier',password:courierEnv.COURIER_DB_PASSWORD,database:'hdwork2',multipleStatements:false,connectTimeout:5000});
  try{const [[pending]]=await audit.execute("SELECT COUNT(*) AS total FROM hd2_courier_inbox WHERE bot_id=? AND state='PENDING'",[plan.botId]);const [[leased]]=await audit.execute('SELECT COUNT(*) AS total FROM hd2_courier_workers WHERE bot_id=? AND expires_ms>?',[plan.botId,Date.now()]);if(Number(pending.total)||Number(leased.total))throw denied('EXISTING_PENDING_OR_ACTIVE_COURIER');}finally{await audit.end();}
  const serviceView={id:'courier-testing-service',role:'SHOW_ONLY',modules:['TIAL']};
  async function testingRead(body){
   if(body.reference!==reference||Object.keys(body).length!==1)throw denied('TEST_REFERENCE_REJECTED');
   const [orders]=await readPool.execute('SELECT id,status,message_id,chat_id FROM hd2_orders WHERE bot_id=? AND chat_id=? AND sc_in=? AND command=?',[plan.botId,g.chatId,reference,'order']);
   const view=require('../src/operations/read').reader(readPool);const list=await view.list({area:'TIAL',q:reference,mine:'false'},serviceView);
   if(orders.length>1)throw denied('MULTIPLE_TEST_ORDERS');
   if(!orders.length)return {count:0,dashboardQuery:true};
   const order=orders[0];if(!list.data.some(o=>o.id===order.id))throw denied('DASHBOARD_ORDER_NOT_VISIBLE');
   const detail=await view.detail(order.id,serviceView);if(detail.data.id!==order.id)throw denied('DASHBOARD_DETAIL_REJECTED');
   const [[copies]]=await readPool.execute('SELECT COUNT(*) AS total FROM hd2_orders WHERE bot_id=? AND chat_id=? AND message_id=?',[plan.botId,g.chatId,order.message_id]);
   if(Number(copies.total)!==1)throw denied('ORDER_NOT_EXACTLY_ONCE');
   return {count:1,orderId:order.id,status:order.status,messageId:order.message_id,dashboardQuery:true,detailReadable:true,historyEntries:detail.history.length,exactlyOnce:true};
  }
  app=await require('../courier-b2c-server').startIntegration({env:courierEnv,testWindow:{reference,notBefore,until},testingRead,report:()=>fatal('BACKEND_DATABASE_OR_API_FAILED')});if(fatalReason)throw denied(fatalReason);
  const apiRead=async()=>{const route='/internal/courier/v1/testing/order',body=JSON.stringify({reference}),stamp=String(Math.floor(Date.now()/1000)),nonce=randomBytes(16).toString('hex'),signature=createHmac('sha256',courierEnv.COURIER_SERVICE_KEY).update([plan.botId,stamp,nonce,'POST',route,createHash('sha256').update(body).digest('hex')].join('\n')).digest('hex');const res=await fetch('http://127.0.0.1:'+plan.port+route,{method:'POST',headers:{'Content-Type':'application/json','X-Courier-Id':plan.botId,'X-Courier-Time':stamp,'X-Courier-Nonce':nonce,'X-Courier-Signature':signature},body,signal:AbortSignal.timeout(5000)});if(res.status!==200)throw denied('AUTHENTICATED_READ_API_FAILED');return res.json();};
  if((await apiRead()).count!==0)throw denied('UNEXPECTED_ORDER_BEFORE_READY');
  const childEnv={};for(const key of ['SystemRoot','PATH','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'])if(process.env[key])childEnv[key]=process.env[key];Object.assign(childEnv,pythonEnv,{COURIER_SINGLE_TEST_REFERENCE:reference,COURIER_SINGLE_TEST_NOT_BEFORE:String(notBefore),PYTHONDONTWRITEBYTECODE:'1'});
  child=spawn('python',['-B','-m','courier','--run'],{cwd:path.join(root,'courier_bot'),env:childEnv,windowsHide:true,stdio:['pipe','pipe','pipe']});require('../src/config/private-courier-env').clearSecrets(childEnv);
  childDone=new Promise(resolve=>child.once('exit',resolve));child.stdin.on('error',()=>{});
  await new Promise((resolve,reject)=>{let output='';const readyTimer=setTimeout(()=>reject(denied('COURIER_READY_TIMEOUT')),20000);child.once('error',()=>{clearTimeout(readyTimer);reject(denied('COURIER_START_FAILED'));});child.once('exit',()=>{clearTimeout(readyTimer);reject(denied('COURIER_EXITED_BEFORE_READY'));});child.stdout.on('data',b=>{output+=b.toString('utf8');if(output.length>4096){reject(denied('COURIER_CONTROL_REJECTED'));return;}let cut;while((cut=output.indexOf('\n'))>=0){const line=output.slice(0,cut);output=output.slice(cut+1);try{const event=JSON.parse(line);if(event.event==='READY'){clearTimeout(readyTimer);resolve();}else if(event.event==='FAILED'){clearTimeout(readyTimer);fatal('COURIER_RUNTIME_FAILED');reject(denied('COURIER_RUNTIME_FAILED'));}}catch{fatal('COURIER_CONTROL_REJECTED');}}});child.stderr.on('data',()=>{clearTimeout(readyTimer);fatal('COURIER_RUNTIME_FAILED');reject(denied('COURIER_RUNTIME_FAILED'));});});
  child.once('exit',()=>{if(!closing)fatal('COURIER_EXITED_UNEXPECTEDLY');});
  startupComplete=true;if(fatalReason)throw denied(fatalReason);
  report.status='READY';report.authenticatedApiRead='PASS';report.backendPid=process.pid;report.pythonPid=child.pid;report.message=`/order@HDWorkOpsBot\nSC/IN:${reference}\nNO INET:000000001234\nSN ONT:DUMMY-ONT\nSTO:ABC\nKETERANGAN:HD Work 2.0 live testing dummy\nNIK:DUMMY`;save();
  console.log(JSON.stringify({status:'READY',chatId:g.chatId,reference,send:false,report:path.relative(root,path.join(folder,'report.json'))}));
  timer=setTimeout(()=>void finish('EXPIRED','APPROVAL_WINDOW_EXPIRED'),Math.max(1,until-Date.now()));
  interval=setInterval(()=>{if(closing||busy)return;busy=true;(async()=>{if(fs.existsSync(path.join(folder,'stop.request')))return finish('STOPPED','USER_STOP');const result=await apiRead();if(result.count===1){Object.assign(report,{orderId:result.orderId,orderStatus:result.status,messageId:result.messageId,exactlyOnce:result.exactlyOnce,dashboardApiRead:'PASS',dashboardDetail:'PASS',historyEntries:result.historyEntries,browserTested:false});await finish('PASS');}})().catch(()=>fatal('READ_VERIFICATION_FAILED')).finally(()=>{busy=false;});},2000);
  process.once('SIGINT',()=>void finish('STOPPED','SIGNAL'));process.once('SIGTERM',()=>void finish('STOPPED','SIGNAL'));
 }catch(e){await finish('FAIL',/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'LIVE_STARTUP_FAILED');process.exitCode=1;}
}
if(require.main===module)run().catch(()=>{console.error(JSON.stringify({status:'FAIL',code:'LIVE_SUPERVISOR_FAILED',send:false}));process.exitCode=1;});

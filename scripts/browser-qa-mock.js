// Standalone real Chrome + HTTPS + mock API. Never loads production environment.
const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),{spawn}=require('node:child_process'),{X509Certificate,createHash}=require('node:crypto');
const {deadline,withSignal,sleep,retryBusy,safeCode,failure}=require('./browser-diagnosis-runtime');
const {connectDevTools}=require('./diagnose-browser');
const {createMockApi}=require('../tests/helpers/browser-qa-api');
const root=path.resolve(__dirname,'..'),origin='https://localhost:8443';
async function run(){
 const local=path.join(root,'.local'),work=fs.mkdtempSync(path.join(local,'browser-qa-')),profile=path.join(work,'profile');fs.mkdirSync(profile);
 const report={status:'running',stage:'prerequisites',cases:[],bugs:[],cleanupErrors:[],networkCodes:[],pageExceptionCount:0,blockedRequests:0,realDatabaseUsed:false,profilePreserved:true};
 const save=()=>fs.writeFileSync(path.join(work,'report.json'),JSON.stringify(report,null,2)+'\n');
 const mark=stage=>{report.stage=stage;save();};const pass=name=>{report.cases.push({name,status:'PASS'});save();};
 const budget=deadline(90000);let chrome,server,devtools;const {app,state}=createMockApi();
 try{
  if(!fs.existsSync(path.join(root,'frontend/dist/index.html')))throw failure('BUILD_MISSING');
  const cert=fs.readFileSync(path.join(local,'tls/localhost.crt')),key=fs.readFileSync(path.join(local,'tls/localhost.key'));
  server=https.createServer({cert,key,minVersion:'TLSv1.2'},app);
  await withSignal(new Promise((resolve,reject)=>{server.once('error',reject);server.listen(8443,'127.0.0.1',resolve);}),budget.signal);
  const pin=createHash('sha256').update(new X509Certificate(cert).publicKey.export({type:'spki',format:'der'})).digest('base64');
  mark('chrome-startup');let spawnError;
  chrome=spawn(process.env.HDWORK2_TEST_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'--ignore-certificate-errors-spki-list='+pin,'about:blank'],{windowsHide:true,stdio:'ignore'});
  chrome.on('error',e=>spawnError=safeCode(e));let port;
  for(let i=0;i<100;i++){
   if(spawnError)throw failure(spawnError);if(chrome.exitCode!==null)throw failure('CHROME_EARLY_EXIT');
   try{const data=await retryBusy('devtools-active-port-read',signal=>fs.promises.readFile(path.join(profile,'DevToolsActivePort'),{encoding:'utf8',signal}),{signal:budget.signal});const n=Number(data.split('\n')[0]);if(Number.isInteger(n)&&n>0&&n<65536){port=n;break;}}
   catch(e){if(e.code!=='ENOENT')throw e;}await sleep(100,budget.signal);
  }
  if(!port)throw failure('CHROME_STARTUP_TIMEOUT');
  const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT',signal:budget.signal})).json();
  const ws=new URL(target.webSocketDebuggerUrl);if(ws.protocol!=='ws:'||ws.hostname!=='127.0.0.1'||Number(ws.port)!==port)throw failure('DEVTOOLS_TARGET_REJECTED');
  devtools=await connectDevTools(ws.href,report,budget.signal,e=>budget.abort(e),{allowMethods:['GET','HEAD','POST']});
  const call=(method,params={})=>{report.lastCommand=method;return withSignal(devtools.call(method,params),budget.signal);};
  await call('Runtime.enable');await call('Page.enable');await call('Network.enable');
  await call('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw failure('QA_EVALUATION_FAILED');return r.result.value;};
  const until=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(100,budget.signal);}throw failure('QA_STATE_TIMEOUT');};
  const click=async label=>{await until(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled)`);await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled).click()`);};
  const fill=async(label,value)=>evaluate(`(()=>{const n=Array.from(document.querySelectorAll('label')).find(l=>l.textContent.trim().startsWith(${JSON.stringify(label)}))?.querySelector('input');if(!n)throw Error();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const go=async pathname=>{const r=await call('Page.navigate',{url:origin+pathname});if(r.errorText)throw failure('QA_NAVIGATION_FAILED');};
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const native=fetch.bind(window);window.fetch=async(input,init)=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname==='/api/auth/me'&&(!sessionStorage.getItem('qa:initial-race')||window.__qaHoldNextMe)){sessionStorage.setItem('qa:initial-race','done');window.__qaHoldNextMe=false;const response=await native(input,{...init,signal:undefined});window.__qaHeld=true;await new Promise(resolve=>window.__qaReleaseMe=resolve);window.__qaHeld=false;return response;}return native(input,init);};const nativeTimeout=setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>{const id=nativeTimeout(fn,ms,...args);if(ms===60000)window.__qaRunPoll=()=>{clearTimeout(id);fn(...args);};return id;};})();`});
  mark('login-page-and-held-me');await go('/login');await until("Boolean(document.querySelector('input[autocomplete=username]'))&&window.__qaHeld===true");
  mark('login-fill');await fill('Username','qa.synthetic');await fill('Password','qa-only-not-a-real-password');mark('login-submit');await click('Masuk workspace');mark('login-check-in');await click('Lanjutkan ke Pilih Pekerjaan');await until("location.pathname==='/jobs'");
  await evaluate('window.__qaReleaseMe()');await sleep(150,budget.signal);if(!await evaluate("location.pathname==='/jobs'"))throw failure('STALE_ME_CLEARED_SESSION');pass('login-cookie-CSRF-and-stale-401-ignored');
  mark('workspace-navigation');
  await go('/dashboard');await until("location.pathname==='/recap'&&document.body.innerText.includes('TOTAL ORDER MASUK')");pass('dashboard-recap');
  await go('/work/B2C');await until("document.body.innerText.includes('Dashboard Pekerjaan')");
  for(const category of ['B2C/TIAL','ASSUREN','B2B','REPLACEMENT']){mark('navigation-'+category.replace('/','-'));await go('/work/'+category);await until(`document.body.innerText.includes(${JSON.stringify('QA-'+(category==='B2C/TIAL'?'TIAL':category))})`);pass('navigation-'+category.replace('/','-'));}
  await call('Page.reload');await until("document.body.innerText.includes('QA-REPLACEMENT')");pass('refresh-restores-cookie-session');
  mark('session-expiry');state.expired=true;await call('Page.reload');await until("location.pathname==='/login'&&Boolean(document.querySelector('input[autocomplete=username]'))");pass('expired-session-redirects-to-login');
  mark('limited-permission');state.role='SHOW_ONLY';state.modules=['B2B'];await fill('Username','qa.synthetic');await fill('Password','qa-only-not-a-real-password');await click('Masuk workspace');await click('Lanjutkan ke Pilih Pekerjaan');await until("location.pathname==='/jobs'");
  if(!await evaluate("Array.from(document.querySelectorAll('a[href^=\"/work/\"]')).every(a=>a.getAttribute('href')==='/work/B2B')"))throw failure('UNASSIGNED_WORKSPACE_LINK');
  await go('/work/ASSUREN');await until("document.body.innerText.includes('Akses ASSUREN belum diberikan')");
  if(await evaluate("fetch('/api/operations/orders?area=ASSUREN',{credentials:'include'}).then(r=>r.status)")!==403)throw failure('DIRECT_API_PERMISSION_FAILED');pass('direct-URL-and-API-permission-denied');
  await go('/work/B2B');await until("document.body.innerText.includes('QA-B2B')");if(!await evaluate("!document.body.innerText.includes('Simpan order')"))throw failure('VIEWER_MUTATION_VISIBLE');pass('SHOW_ONLY-has-no-create-action');
  mark('logout-race');await until("typeof window.__qaRunPoll==='function'");await evaluate('window.__qaHoldNextMe=true;window.__qaRunPoll()');await until('window.__qaHeld===true');await click('Logout');await until("location.pathname==='/login'");await evaluate('window.__qaReleaseMe()');await sleep(150,budget.signal);if(!await evaluate("location.pathname==='/login'"))throw failure('STALE_ME_RESTORED_LOGOUT');pass('logout-and-stale-success-ignored');
  mark('preview-and-mobile');await go('/preview/login');await until("document.body.innerText.includes('DATA DEMO')");pass('Preview-demo-preserved');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});if(!await evaluate('document.documentElement.scrollWidth<=innerWidth'))throw failure('MOBILE_OVERFLOW');pass('mobile-no-horizontal-overflow');
  const screenshot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(work,'preview-mobile.png'),Buffer.from(screenshot.data,'base64'));
  if(report.pageExceptionCount)throw failure('PAGE_EXCEPTION');if(state.loginCount!==2||state.logoutCount!==1)throw failure('MOCK_AUTH_COUNTS_MISMATCH');
  report.mockLogins=state.loginCount;report.mockLogouts=state.logoutCount;report.status='passed';mark('complete');
 }catch(error){report.status='failed';report.code=safeCode(error);report.bugs.push({stage:report.stage,code:report.code});report.mockLogins=state.loginCount;report.mockLogouts=state.logoutCount;process.exitCode=1;
  if(devtools&&!budget.signal.aborted)try{const stateResult=await devtools.call('Runtime.evaluate',{expression:"({onLogin:location.pathname==='/login',onJobs:location.pathname==='/jobs',onCheckIn:location.pathname==='/check-in',usernameField:Boolean(document.querySelector('input[autocomplete=username]')),heldMe:window.__qaHeld===true})",returnByValue:true});report.failureChecks=stateResult.result?.value;}catch{report.failureChecksUnavailable=true;}
 }
 finally{
  budget.stop();
  if(devtools){try{await devtools.call('Browser.close',{},1000);}catch(e){if(e.code!=='DEVTOOLS_CLOSED')report.cleanupErrors.push({operation:'chrome-close',code:safeCode(e)});}devtools.close();}
  budget.abort(failure('QA_FINISHED'));
  if(chrome?.pid&&chrome.exitCode===null&&chrome.signalCode===null){await new Promise(r=>setTimeout(r,500));if(chrome.exitCode===null&&chrome.signalCode===null){chrome.kill();await Promise.race([new Promise(r=>chrome.once('exit',r)),new Promise(r=>setTimeout(r,2000))]);}}
  report.ownedChromeParentExited=Boolean(chrome&&(chrome.exitCode!==null||chrome.signalCode!==null));
  if(server?.listening){server.closeAllConnections();await new Promise(r=>server.close(r));}
  if(report.cleanupErrors.length){report.status='failed';process.exitCode=1;}save();console.log(JSON.stringify({...report,report:path.relative(root,path.join(work,'report.json'))}));
 }
 return report;
}
if(require.main===module){if(process.argv.length!==3||process.argv[2]!=='--run')console.log('Usage: node scripts/browser-qa-mock.js --run');else run().catch(()=>{console.error('Mock browser QA could not initialize');process.exitCode=1;});}
module.exports={run};

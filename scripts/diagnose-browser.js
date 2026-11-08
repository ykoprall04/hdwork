// Standalone diagnosis: Node built-ins only. No dotenv, app, DB, migrations or bot.
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { spawn } = require('node:child_process');
const { X509Certificate, createHash } = require('node:crypto');
const {failure,safeCode,withSignal,sleep,deadline,retryBusy}=require('./browser-diagnosis-runtime');

const root = path.resolve(__dirname, '..');
const origin = 'https://localhost:8443';

function staticServer(cert, key, { file, signal, onFailure, onMissing }) {
  const dist=path.join(root,'frontend/dist');
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};
  return https.createServer({cert,key,minVersion:'TLSv1.2'},(req,res)=>{
    async function serve(){
      res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Content-Security-Policy',"connect-src 'self'; form-action 'none'");
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
      let pathname;try{pathname=decodeURIComponent(new URL(req.url,origin).pathname);}catch{res.writeHead(400);res.end();return;}
      if(pathname.startsWith('/api/')){res.writeHead(pathname==='/api/auth/me'?401:403,{'Content-Type':'application/json'});res.end('{"success":false}');return;}
      const target=path.resolve(dist,'.'+pathname);
      if(!target.startsWith(dist+path.sep)&&target!==dist||pathname.includes('\\')||pathname.split('/').some(part=>part.startsWith('.'))){res.writeHead(404);res.end();return;}
      let filename=target,stat;
      try{stat=await file('static-asset-stat',()=>fs.promises.stat(filename));}
      catch(error){if(error.code!=='ENOENT')throw error;onMissing();}
      if(!stat?.isFile()){
        if(!['/','/login'].includes(pathname)){res.writeHead(404);res.end();return;}
        filename=path.join(dist,'index.html');
      }
      res.setHeader('Content-Type',mime[path.extname(filename)]||'application/octet-stream');
      if(req.method==='HEAD'){res.end();return;}
      const content=await file('static-asset-read',()=>fs.promises.readFile(filename,{signal}));
      if(!res.destroyed)res.end(content);
    }
    void serve().catch(error=>{
      if(!signal.aborted)onFailure(error);
      if(!res.headersSent){res.writeHead(503);res.end();}else res.destroy();
    });
  });
}

function connectDevTools(url, report, signal, onFailure, {allowMethods=['GET','HEAD']}={}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url), pending = new Map(); let sequence = 0;
    function dispose(){clearTimeout(timeout);signal.removeEventListener('abort',abort);for(const item of pending.values()){clearTimeout(item.timer);item.fail(failure('DEVTOOLS_CLOSED'));}pending.clear();try{ws.close();}catch(error){report.cleanupErrors.push({operation:'devtools-close',code:safeCode(error)});}}
    const abort=()=>{dispose();reject(signal.reason);};
    const timeout = setTimeout(() => { dispose(); reject(failure('DEVTOOLS_CONNECT_TIMEOUT','devtools-connect')); }, 5000);
    signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted){abort();return;}
    const call = (method, params = {}, timeoutMs=8000) => new Promise((done, fail) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); fail(failure('DEVTOOLS_COMMAND_TIMEOUT','devtools-command')); }, timeoutMs);
      pending.set(id, { done, fail, timer });
      try { ws.send(JSON.stringify({ id, method, params })); }
      catch { pending.delete(id); clearTimeout(timer); fail(failure('DEVTOOLS_SEND_FAILED')); }
    });
    ws.addEventListener('open', () => { clearTimeout(timeout); resolve({ call, close: dispose }); }, { once: true });
    ws.addEventListener('error', () => { dispose(); reject(failure('DEVTOOLS_CONNECT_FAILED','devtools-connect')); });
    ws.addEventListener('close', () => { clearTimeout(timeout);reject(failure('DEVTOOLS_CLOSED'));for (const item of pending.values()) { clearTimeout(item.timer); item.fail(failure('DEVTOOLS_CLOSED')); } pending.clear(); });
    ws.addEventListener('message', event => {
      let message; try { message = JSON.parse(event.data); } catch { onFailure(failure('DEVTOOLS_INVALID_MESSAGE','devtools-message'));return; }
      if (message.id) {
        const item = pending.get(message.id); if (!item) return;
        pending.delete(message.id); clearTimeout(item.timer);
        message.error ? item.fail(failure('DEVTOOLS_COMMAND_FAILED')) : item.done(message.result);
      } else if (message.method === 'Fetch.requestPaused') {
        const { request, requestId } = message.params;
        let allowed = false;
        try { allowed = new URL(request.url).origin === origin && allowMethods.includes(request.method); } catch { /* blocked */ }
        if (!allowed) report.blockedRequests++;
        // Never record request URLs, headers, bodies or cookies.
        void call(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', allowed ? { requestId } : { requestId, errorReason: 'BlockedByClient' }).catch(error => {if(!signal.aborted){report.interceptionError=safeCode(error);onFailure(Object.assign(error,{operation:'request-interception'}));}});
      } else if (message.method === 'Runtime.exceptionThrown') {
        report.pageExceptionCount++;
      } else if (message.method === 'Network.loadingFailed') {
        const code = /\bERR_[A-Z0-9_]+\b/.exec(message.params.errorText || '')?.[0];
        if (code && report.networkCodes.length < 12) report.networkCodes.push(code);
      }
    });
  });
}

async function run() {
  const local = path.join(root, '.local');
  const budget = deadline(45000);
  const report = { status: 'running', stage: 'executable', code: null, failedOperation: null, stages: [], fileRetries: [], timeoutMs: 45000, cleanupTimeoutMs: 8000, cleanupErrors: [], executableExists: false, devtoolsReady: false, httpsVerified: false, loginFormVisible: false, blockedRequests: 0, networkCodes: [], pageExceptionCount: 0, ownedChromeParentExited: null, profilePreserved: true, browserTrust: 'isolated-leaf-SPKI-pin; OS trust unchanged' };
  let chrome, devtools, server, spawnCode, reportFile, profile;
  const onRetry = event => { if(report.fileRetries.length<60)report.fileRetries.push(event); };
  const file = async (operation, action, signal=budget.signal) => {
    report.activeOperation=operation;
    const value=await retryBusy(operation,action,{signal,onRetry});
    if(report.activeOperation===operation)report.activeOperation=null;
    return value;
  };
  const persist = async (signal=budget.signal) => {
    if(reportFile)await retryBusy('report-write',()=>fs.promises.writeFile(reportFile,JSON.stringify(report,null,2)+'\n',{mode:0o600,signal}),{signal,onRetry});
  };
  const stage = async name => { report.stage=name; await persist(); };
  const passed = async name => { report.stages.push({stage:name,status:'passed'});await persist(); };
  async function perform() {
    await file('local-directory-create',()=>fs.promises.mkdir(local,{recursive:true,mode:0o700}));
    // A new directory is used for every run; old reports/profiles are untouched.
    const work=await file('diagnosis-directory-create',()=>fs.promises.mkdtemp(path.join(local,'browser-diagnosis-')));
    profile=path.join(work,'profile');reportFile=path.join(work,'report.json');
    await file('profile-directory-create',()=>fs.promises.mkdir(profile));
    const exe=process.env.HDWORK2_TEST_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe';
    try { report.executableExists=(await file('chrome-executable-stat',()=>fs.promises.stat(exe))).isFile(); }
    catch(error){if(error.code==='ENOENT')throw failure('CHROME_EXECUTABLE_MISSING','chrome-executable-stat');throw error;}
    if(!report.executableExists)throw failure('CHROME_EXECUTABLE_MISSING','chrome-executable-stat');
    await passed('executable');

    await stage('local-prerequisites');
    const cert=await file('certificate-read',signal=>fs.promises.readFile(path.join(local,'tls/localhost.crt'),{signal}));
    const ca=await file('ca-certificate-read',signal=>fs.promises.readFile(path.join(local,'tls/ca.crt'),{signal}));
    const key=await file('private-key-read',signal=>fs.promises.readFile(path.join(local,'tls/localhost.key'),{signal}));
    const leaf=new X509Certificate(cert);
    if(!leaf.checkHost('localhost'))throw failure('CERTIFICATE_HOST_MISMATCH','certificate-validate');
    if(!(await file('frontend-index-stat',()=>fs.promises.stat(path.join(root,'frontend/dist/index.html')))).isFile())throw failure('FRONTEND_BUILD_MISSING','frontend-index-stat');
    const pin=createHash('sha256').update(leaf.publicKey.export({type:'spki',format:'der'})).digest('base64');

    await stage('startup');budget.signal.throwIfAborted();
    chrome=spawn(exe,['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'--ignore-certificate-errors-spki-list='+pin,'about:blank'],{windowsHide:true,stdio:'ignore'});
    chrome.on('error',error=>{spawnCode=safeCode(error);});
    let debugPort;
    const startupUntil=Date.now()+10000;
    while(Date.now()<startupUntil){
      budget.signal.throwIfAborted();
      if(spawnCode)throw failure(spawnCode,'chrome-spawn');
      if(chrome.exitCode!==null)throw failure('CHROME_EARLY_EXIT','chrome-startup');
      try{
        const content=await file('devtools-active-port-read',signal=>fs.promises.readFile(path.join(profile,'DevToolsActivePort'),{encoding:'utf8',signal}));
        const candidate=Number(content.split('\n')[0]);
        if(Number.isInteger(candidate)&&candidate>0&&candidate<=65535){debugPort=candidate;break;}
        report.devtoolsFileIncompleteCount=(report.devtoolsFileIncompleteCount||0)+1;
      }catch(error){
        // ENOENT is expected only while waiting for Chrome to create this file.
        if(error.code!=='ENOENT')throw error;
        report.devtoolsFileMissingCount=(report.devtoolsFileMissingCount||0)+1;report.activeOperation=null;
      }
      await sleep(100,budget.signal);
    }
    if(!debugPort)throw failure('CHROME_STARTUP_TIMEOUT','devtools-active-port-wait');
    await passed('startup');

    await stage('devtools');
    const response=await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`,{method:'PUT',signal:AbortSignal.any([budget.signal,AbortSignal.timeout(5000)])});
    if(!response.ok)throw failure('DEVTOOLS_HTTP_FAILED','devtools-http');
    const target=await withSignal(response.json(),budget.signal),socket=new URL(target.webSocketDebuggerUrl);
    if(socket.protocol!=='ws:'||!['127.0.0.1','localhost'].includes(socket.hostname)||Number(socket.port)!==debugPort)throw failure('DEVTOOLS_TARGET_REJECTED','devtools-target-validate');
    devtools=await connectDevTools(socket.href,report,budget.signal,error=>budget.abort(error));
    await devtools.call('Runtime.enable');await devtools.call('Page.enable');await devtools.call('Network.enable');
    await devtools.call('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
    report.devtoolsReady=true;await passed('devtools');

    await stage('https');
    server=staticServer(cert,key,{file,signal:budget.signal,onFailure:error=>budget.abort(error),onMissing:()=>{report.assetNotFoundCount=(report.assetNotFoundCount||0)+1;}});
    await withSignal(new Promise((resolve,reject)=>{server.once('error',reject);server.listen(8443,'127.0.0.1',resolve);}),budget.signal);
    const httpStatus=await withSignal(new Promise((resolve,reject)=>{
      const req=https.request({hostname:'127.0.0.1',servername:'localhost',port:8443,path:'/login',method:'HEAD',ca,rejectUnauthorized:true,agent:false,signal:budget.signal},res=>{res.resume();res.on('error',reject);res.on('end',()=>resolve(res.statusCode));});
      req.setTimeout(5000,()=>req.destroy(failure('HTTPS_TIMEOUT','https-probe')));req.once('error',reject);req.end();
    }),budget.signal);
    if(httpStatus!==200)throw failure('HTTPS_LOGIN_STATUS_FAILED','https-probe');
    report.httpsVerified=true;await passed('https');

    await stage('login-navigation');
    const navigation=await devtools.call('Page.navigate',{url:origin+'/login'});
    if(navigation.errorText)throw failure(/\bERR_[A-Z0-9_]+\b/.exec(navigation.errorText)?.[0]||'NAVIGATION_FAILED','login-navigate');
    const renderUntil=Date.now()+10000;
    while(Date.now()<renderUntil){
      budget.signal.throwIfAborted();
      const result=await devtools.call('Runtime.evaluate',{expression:"location.origin==='https://localhost:8443'&&location.pathname==='/login'&&Boolean(document.querySelector('input[autocomplete=username]'))&&Boolean(document.querySelector('input[type=password]'))",returnByValue:true});
      if(result.exceptionDetails)throw failure('LOGIN_DOM_CHECK_FAILED','login-dom-check');
      if(result.result.value===true){report.loginFormVisible=true;break;}
      await sleep(100,budget.signal);
    }
    if(report.interceptionError)throw failure(report.interceptionError,'request-interception');
    if(!report.loginFormVisible)throw failure('LOGIN_FORM_TIMEOUT','login-dom-check');
    await passed('login-navigation');report.status='passed';await stage('complete');
  }
  try { await withSignal(perform(),budget.signal); }
  catch(error){report.status='failed';report.code=safeCode(error);report.failedOperation=error.operation||report.activeOperation||report.stage;process.exitCode=1;}
  finally{
    budget.stop();
    // Separate bounded teardown budget: total run <=45s plus <=8s teardown,
    // barring an OS call that blocks the event loop itself.
    const cleanup=deadline(8000,'cleanup-timeout');
    const recordCleanup=(operation,error)=>report.cleanupErrors.push({operation,code:safeCode(error)});
    try{
      if(devtools&&!budget.signal.aborted){
        try{await withSignal(devtools.call('Browser.close',{},1000),cleanup.signal);}
        catch(error){if(error.code==='DEVTOOLS_CLOSED')report.browserClose='connection-closed';else recordCleanup('chrome-graceful-close',error);}
      }
      if(devtools)devtools.close();
      budget.abort(failure('DIAGNOSIS_FINISHED','cleanup'));
      if(chrome?.pid&&chrome.exitCode===null&&chrome.signalCode===null){
        for(let i=0;i<20&&chrome.exitCode===null&&chrome.signalCode===null;i++)await sleep(100,cleanup.signal);
        if(chrome.exitCode===null&&chrome.signalCode===null){
          if(!chrome.kill())recordCleanup('chrome-owned-process-stop',failure('CHROME_STOP_REJECTED'));
          await withSignal(Promise.race([new Promise(resolve=>chrome.once('exit',resolve)),sleep(2000,cleanup.signal)]),cleanup.signal);
        }
      }
      if(chrome)report.ownedChromeParentExited=chrome.exitCode!==null||chrome.signalCode!==null;
    }catch(error){recordCleanup('cleanup',error);}
    finally{
      // Attempt every cleanup independently, even if graceful Chrome close failed.
      try{if(devtools)devtools.close();}catch(error){recordCleanup('devtools-dispose',error);}
      budget.abort(failure('DIAGNOSIS_FINISHED','cleanup'));
      try{if(chrome?.pid&&chrome.exitCode===null&&chrome.signalCode===null)chrome.kill();}catch(error){recordCleanup('chrome-owned-process-stop',error);}
      try{if(server){server.closeAllConnections();await withSignal(new Promise((resolve,reject)=>server.close(error=>{if(error&&error.code!=='ERR_SERVER_NOT_RUNNING')reject(error);else{if(error)report.httpsWasNotListening=true;resolve();}})),cleanup.signal);}}catch(error){recordCleanup('https-server-close',error);}
      if(report.cleanupErrors.length){report.status='failed';process.exitCode=1;}
      try{await persist(cleanup.signal);}catch(error){recordCleanup('report-write',error);report.status='failed';process.exitCode=1;}
      cleanup.stop();
      console.log(JSON.stringify({...report,report:reportFile?path.relative(root,reportFile):null}));
    }
  }
  return report;
}

if (require.main === module) {
  if (process.argv.length !== 3 || process.argv[2] !== '--run') {
    console.log('Usage: node scripts/diagnose-browser.js --run');
  } else run().catch(error => { console.error(JSON.stringify({ status: 'failed', code: safeCode(error), operation:error.operation||'runner-setup' })); process.exitCode = 1; });
}
module.exports = { run, connectDevTools };

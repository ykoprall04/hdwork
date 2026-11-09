// Headless Chrome, disposable profile, only synthetic accounts on localhost.
// Pins the private test leaf key; this does NOT install a CA or claim OS trust.
const fs = require('node:fs'), path = require('node:path'), { spawn } = require('node:child_process');
const { createHash, X509Certificate } = require('node:crypto');
const assert = require('node:assert/strict');
const wait = ms => new Promise(r => setTimeout(r, ms));
let stage='startup';
const diagnostic={stage,profile:null,executableExists:false,devtoolsReady:false,chromeExitCode:null,spawnCode:null,network:[],exceptionCount:0,code:null,status:'pending'};
let diagnosticFile;
function persist(){if(diagnosticFile)fs.writeFileSync(diagnosticFile,JSON.stringify(diagnostic,null,2)+'\n',{mode:0o600});}
function mark(value){stage=value;diagnostic.stage=value;persist();}
function failure(code){const e=Error('Browser diagnostic failure');e.code=code;return e;}
function safeCode(e){return /^[A-Z][A-Z0-9_]{1,63}$/.test(e?.code||'')?e.code:'BROWSER_CHECK_FAILED';}
async function main(config) {
  const url = new URL(config.origin);
  if (url.hostname !== 'localhost' || url.protocol !== 'https:' || !/^test\./.test(config.username)) throw Error('Test target rejected');
  assert.equal(config.orders?.length,4);for(const o of config.orders){assert.match(o.id,/^[a-f0-9-]{36}$/i);assert.match(o.reference,/^E2E-BROWSER-/);assert.ok(['TIAL','ASSUREN','B2B','REPLACEMENT'].includes(o.module));}
  const root = path.resolve(__dirname, '../..'), localRoot = path.join(root, '.local');
  const dir = fs.mkdtempSync(path.join(localRoot, 'browser-test-'));
  diagnostic.profile=path.basename(dir);diagnosticFile=path.join(localRoot,diagnostic.profile+'-diagnostic.json');
  mark('certificate-read');
  const leaf = new X509Certificate(fs.readFileSync(path.join(localRoot, 'tls/localhost.crt')));
  const pin = createHash('sha256').update(leaf.publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
  const exe = process.env.HDWORK2_TEST_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  mark('executable');diagnostic.executableExists=fs.existsSync(exe);persist();
  if(!diagnostic.executableExists)throw failure('CHROME_EXECUTABLE_MISSING');
  mark('startup');
  const chrome = spawn(exe, ['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--user-data-dir=' + dir,'--ignore-certificate-errors-spki-list=' + pin,'about:blank'], { windowsHide: true, stdio: 'ignore' });
  chrome.on('error', e => {diagnostic.spawnCode=safeCode(e);persist();});
  chrome.on('exit',code=>{diagnostic.chromeExitCode=code;persist();});
  let ws;
  try {
    let debugPort;
    for (let i = 0; i < 100; i++) {
      const active = path.join(dir, 'DevToolsActivePort');
      if (fs.existsSync(active)) { debugPort = Number(fs.readFileSync(active, 'utf8').split('\n')[0]); break; }
      if(diagnostic.spawnCode)throw failure(diagnostic.spawnCode);
      if (chrome.exitCode !== null) throw failure('CHROME_EARLY_EXIT'); await wait(100);
    }
    if (!debugPort) throw failure('CHROME_STARTUP_TIMEOUT');
    if(!Number.isInteger(debugPort)||debugPort<1||debugPort>65535)throw failure('INVALID_DEVTOOLS_PORT');
    diagnostic.devtoolsReady=true;mark('devtools-connect');
    const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT',signal:AbortSignal.timeout(5000) })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { const timer=setTimeout(()=>reject(failure('DEVTOOLS_WEBSOCKET_TIMEOUT')),5000);ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});ws.addEventListener('error',()=>{clearTimeout(timer);reject(failure('DEVTOOLS_WEBSOCKET_FAILED'));},{once:true}); });
    let sequence = 0; const pending = new Map(), exceptions = [];
    ws.addEventListener('message', e => {
      const m=JSON.parse(e.data);
      if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(failure('CDP_COMMAND_FAILED')):p.resolve(m.result);}}
      else if(m.method==='Runtime.exceptionThrown'){exceptions.push(true);diagnostic.exceptionCount++;persist();}
      else if(m.method==='Network.responseReceived'){
        const r=m.params.response;let url;try{url=new URL(r.url);}catch{return;}
        // Only fixed endpoint names and HTTP status; never URL queries, headers or bodies.
        if(url.hostname==='localhost'&&['/login','/api/auth/login','/api/auth/me','/api/auth/logout'].includes(url.pathname)){
          diagnostic.network.push({path:url.pathname,status:r.status});diagnostic.network=diagnostic.network.slice(-20);persist();
        }
      }else if(m.method==='Network.loadingFailed'){
        const code=/\bERR_[A-Z0-9_]+\b/.exec(m.params.errorText||'')?.[0];
        if(code){diagnostic.network.push({code});diagnostic.network=diagnostic.network.slice(-20);persist();}
      }
    });
    const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 15000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); });
    const evaluate = async expression => { const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw failure('BROWSER_EVALUATION_FAILED'); return r.result.value; };
    const until = async expression => { for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; await wait(100); } throw failure('BROWSER_STATE_TIMEOUT'); };
    const click = async text => { await until(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled)`); await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled).click()`); };
    const fill = async (label, value) => evaluate(`(()=>{const label=Array.from(document.querySelectorAll('label')).find(l=>l.textContent.trim().startsWith(${JSON.stringify(label)}));const n=label?.querySelector('input,textarea,select');if(!n)throw Error('Field missing');Object.getOwnPropertyDescriptor(n instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:n instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await call('Runtime.enable'); await call('Page.enable');await call('Network.enable');
    mark('https-navigation');const navigation=await call('Page.navigate', { url: config.origin + '/login' });
    if(navigation.errorText)throw failure(/\bERR_[A-Z0-9_]+\b/.exec(navigation.errorText)?.[0]||'NAVIGATION_FAILED');
    mark('login-page-render');
    await until("document.querySelector('input[autocomplete=username]')!==null");
    mark('login-submit');await fill('Username', config.username); await fill('Password', config.password); await click('Masuk workspace');
    mark('check-in');
    await click('Lanjutkan ke Pilih Pekerjaan');
    await until("location.pathname==='/jobs'");
    assert.equal(await evaluate("localStorage.getItem('hdwork:operational:auth:v1')"), null);
    const checks = [];
    for (const order of config.orders) {
      const category=order.module==='TIAL'?'B2C':order.module;
      mark(category+'-list');
      await call('Page.navigate',{url:config.origin+'/work/'+category+(category==='B2C'?'/TIAL':'')});
      await until("document.body.innerText.includes('"+order.reference+"')");
      assert.equal(await evaluate("document.body.innerText.includes('Simpan order')"),false);
      await evaluate(`document.querySelector('a[href="/orders/${order.id}"]').click()`);
      await until("location.pathname==='/orders/"+order.id+"'&&document.body.innerText.includes('"+order.reference+"')");
      mark(category+'-pick');await click('PICK');
      await until("document.body.innerText.includes('Durasi proses')&&document.body.innerText.includes('ANTRE')");
      mark(category+'-done');await click('DONE');await until("document.body.innerText.includes('BUKA KEMBALI')");
      mark(category+'-reload');await call('Page.reload');
      await until("document.body.innerText.includes('BUKA KEMBALI')&&document.body.innerText.includes('"+order.reference+"')");
      assert.equal(await evaluate("document.body.innerText.includes('Riwayat aktivitas')"),true);
      checks.push(category+':UI-telegram-order-pick-done-refresh-history-feedback');
    }
    mark('mobile-layout');await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    mark('dashboard');await call('Page.navigate', { url: config.origin + '/recap' }); await until("document.body.innerText.includes('Dashboard Rekap')&&document.body.innerText.includes('TOTAL ORDER MASUK')");
    const screen = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(localRoot, 'browser-smoke.png'), Buffer.from(screen.data, 'base64'));
    mark('logout');await click('Logout'); await until("location.pathname==='/login'&&document.querySelector('input[autocomplete=username]')!==null");
    assert.equal(await evaluate('document.cookie.includes("hdwork2-session")'), false);
    assert.deepEqual(exceptions, []);
    diagnostic.status='passed';mark('complete');
    return { ok: true, checks: ['real-browser-cookie-login', 'mobile-layout', 'dashboard', 'logout', ...checks], certificate: 'isolated-leaf-SPKI-pin; OS trust unchanged' };
  } finally {
    ws?.close(); if (chrome.exitCode === null) { chrome.kill(); await Promise.race([new Promise(r => chrome.once('exit', r)), wait(5000)]); }
    // Preserve profiles for diagnosis. A separate ownership/use check is required
    // before any operator-approved cleanup; exit of the parent alone is insufficient.
    persist();
  }
}
let data = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', b => data += b);
process.stdin.on('end', () => Promise.resolve().then(()=>main(JSON.parse(data))).then(result => console.log(JSON.stringify(result))).catch(error => {
  diagnostic.status='failed';diagnostic.code=safeCode(error);persist();
  console.error('BROWSER_DIAGNOSTIC '+JSON.stringify(diagnostic));process.exitCode=1;
}));

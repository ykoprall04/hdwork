// Real Express + MySQL + TLS. This function accepts only an isolated test pool.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), https = require('node:https'), http = require('node:http');
const { randomUUID } = require('node:crypto');
async function exercise(pool) {
  const [[target]] = await pool.query('SELECT DATABASE() AS db,@@port AS port');
  assert.match(target.db, /^hdwork2_test_[a-f0-9]{16}$/); assert.notEqual(Number(target.port), 3306);
  // Injection is confined to this disposable test process; production validation stays strict.
  const databaseModule = require.resolve('../../src/config/database');
  require.cache[databaseModule] = { id: databaseModule, filename: databaseModule, loaded: true, exports: pool };
  Object.assign(process.env, { DB_NAME: 'hdwork2', HDWORK2_AUTH_V2: 'true', HDWORK2_OPERATIONS_ENABLED: 'true', B2C_COMMAND_SCHEMA_READY: 'true', B2C_WORKFLOW_READ_ENABLED: 'true', HDWORK2_LOCAL_READ_ONLY: 'false', JWT_SECRET: 'synthetic-local-https-integration-key-00000' });
  const service = require('../../src/access/http').service();
  const password = 'synthetic-test-password-only';
  const adminId = await service.bootstrap({ name: 'Test Admin', username: 'test.admin', password });
  const { modules } = require('../../src/operations/modules');
  await service.manage(adminId, null, { name: 'Test HD', username: 'test.hd', password, role: 'HD', modules, is_active: true });
  await service.manage(adminId, null, { name: 'Viewer', username: 'test.viewer', password, role: 'SHOW_ONLY', modules: ['B2B'], is_active: true });
  const tlsDir = path.resolve(__dirname, '../../.local/tls');
  const web = require('../../src/local-web').createLocalWeb({ cert: fs.readFileSync(path.join(tlsDir, 'localhost.crt')), key: fs.readFileSync(path.join(tlsDir, 'localhost.key')), dist: path.resolve(__dirname, '../../frontend/dist') });
  // Start the gateway first to obtain an exact origin, then attach its API upstream.
  // A second gateway uses the same reserved HTTPS port after its initial listener closes.
  await new Promise((r,reject) => {web.once('error',reject);web.listen(process.env.HDWORK2_BROWSER_TEST==='true'?8443:0, '127.0.0.1', r);});
  const webPort = web.address().port;
  await new Promise(r => web.close(r));
  const origin = `https://localhost:${webPort}`;
  process.env.FRONTEND_ORIGINS = origin;
  const app = require('../../src/api-only-app').createApiOnlyApp();
  const api = http.createServer(app);
  await new Promise(r => api.listen(0, '127.0.0.1', r));
  const gateway = require('../../src/local-web').createLocalWeb({ cert: fs.readFileSync(path.join(tlsDir, 'localhost.crt')), key: fs.readFileSync(path.join(tlsDir, 'localhost.key')), dist: path.resolve(__dirname, '../../frontend/dist'), apiPort: api.address().port });
  await new Promise(r => gateway.listen(webPort, '127.0.0.1', r));
  const ca = fs.readFileSync(path.join(tlsDir, 'ca.crt'));
  function send(url, { method = 'GET', body, session, csrf = session?.csrf, requestOrigin = origin } = {}) {
    return new Promise((resolve, reject) => {
      const content = body === undefined ? undefined : JSON.stringify(body);
      const headers = { Origin: requestOrigin, ...(content ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(content) } : {}), ...(session ? { Cookie: session.cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) };
      const req = https.request({ hostname: '127.0.0.1', servername: 'localhost', port: webPort, path: url, method, ca, headers, agent: false }, res => {
        let text = ''; res.setEncoding('utf8'); res.on('data', b => text += b); res.on('end', () => { let data; try { data = JSON.parse(text); } catch { data = text; } resolve({ status: res.statusCode, headers: res.headers, data }); });
      });
      req.setTimeout(10000, () => req.destroy(Error('HTTPS test timeout'))); req.on('error', reject); req.end(content);
    });
  }
  async function login(username) {
    const result = await send('/api/auth/login', { method: 'POST', body: { username, password } });
    assert.equal(result.status, 200);
    const cookie = result.headers['set-cookie'][0];
    for (const attr of ['__Host-hdwork2-session=', 'HttpOnly', 'Secure', 'SameSite=None', 'Path=/']) assert.ok(cookie.includes(attr));
    return { cookie: cookie.split(';')[0], csrf: result.data.data.csrf };
  }
  try {
    assert.equal((await send('/login')).status, 200);
    assert.equal((await send('/health')).data.mode, 'api-only');
    assert.equal((await send('/api/auth/me')).status, 401);
    const hd = await login('test.hd'), admin = await login('test.admin'), viewer = await login('test.viewer');
    const profile = await send('/api/auth/me', { session: hd }); assert.equal(profile.data.data.role, 'HD');
    assert.equal((await send('/api/admin/users', { session: hd })).status, 403);
    assert.equal((await send('/api/admin/users', { session: admin })).status, 200);
    assert.equal((await send('/api/auth/logout', { method: 'POST', session: hd, csrf: '0'.repeat(64) })).status, 403);
    const checks = [];
    for (const module of ['TIAL', 'ASSUREN', 'B2B', 'REPLACEMENT']) {
      const body = { requestId: randomUUID(), module, reference: 'TEST-' + module, description: 'Synthetic manual work' };
      assert.equal((await send('/api/operations/orders', { method: 'POST', session: viewer, body })).status, 403);
      const created = await send('/api/operations/orders', { method: 'POST', session: hd, body });
      assert.equal(created.status, 201);
      const id = created.data.id;
      assert.equal((await send('/api/operations/orders', { method: 'POST', session: hd, body })).data.id, id);
      assert.equal((await send('/api/operations/orders', { method: 'POST', session: hd, body: { ...body, description: 'different' } })).status, 409);
      const area = module === 'TIAL' ? 'TIAL' : module;
      const list = await send('/api/operations/orders?area=' + area, { session: hd });
      assert.ok(list.data.data.some(row => row.id === id));
      if (module !== 'B2B') assert.equal((await send('/api/operations/orders/' + id, { session: viewer })).status, 404);
      const action = (version, action, extra = {}) => send(`/api/operations/orders/${id}/actions`, { method: 'POST', session: hd, body: { requestId: randomUUID(), version, action, ...extra } });
      assert.equal((await action(0, 'PICK')).status, 200);
      assert.equal((await action(0, 'DONE')).status, 409);
      assert.equal((await action(1, 'DONE', { note: 'Checked' })).status, 200);
      let detail = await send('/api/operations/orders/' + id, { session: hd });
      assert.equal(detail.data.data.status, 'DONE'); assert.equal(detail.data.history.length, 3);
      assert.equal(detail.data.requestText, 'Synthetic manual work');
      assert.equal((await action(2, 'REOPEN', { confirm: true })).status, 200);
      assert.equal((await action(3, 'FAILED', { note: 'Synthetic failure' })).status, 200);
      const recap = await send('/api/operations/recap?area=' + area, { session: hd });
      assert.equal(recap.data.data.failed, 1);
      checks.push(module + ':create-idempotent-list-pick-done-history-reopen-failed');
    }
    const [[outbox]] = await pool.query('SELECT COUNT(*) AS n FROM hd2_courier_outbox'); assert.equal(Number(outbox.n), 0);
    assert.equal((await send('/api/auth/logout', { method: 'POST', session: hd })).status, 200);
    assert.equal((await send('/api/auth/me', { session: hd })).status, 401);
    const readOnlyApp = require('../../src/api-only-app').createApiOnlyApp({ ...process.env, HDWORK2_LOCAL_READ_ONLY: 'true' });
    const readOnlyServer = http.createServer(readOnlyApp);
    await new Promise(r => readOnlyServer.listen(0, '127.0.0.1', r));
    try { const result = await fetch(`http://127.0.0.1:${readOnlyServer.address().port}/api/auth/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'test.admin', password }) }); assert.equal(result.status, 503); }
    finally { readOnlyServer.closeAllConnections(); await new Promise(r => readOnlyServer.close(r)); }
    let browser;
    if(process.env.HDWORK2_BROWSER_TEST==='true') {
      const {spawn}=require('node:child_process');
      const child=spawn(process.execPath,[path.resolve(__dirname,'../helpers/local-browser-smoke.cjs')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
      let output='',errors='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>errors+=b);
      child.stdin.end(JSON.stringify({origin,username:'test.hd',password}));
      const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
      if(exit!==0){
        const line=errors.split(/\r?\n/).find(l=>l.startsWith('BROWSER_DIAGNOSTIC '));
        let report;try{report=JSON.parse(line?.slice('BROWSER_DIAGNOSTIC '.length)||'null');}catch{/* no raw stderr output */}
        const error=Error('Browser smoke failed');error.code='BROWSER_SMOKE_FAILED';
        error.browserDiagnostic={stage:typeof report?.stage==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(report.stage)?report.stage:'unknown',code:typeof report?.code==='string'&&/^[A-Z0-9_]{1,64}$/.test(report.code)?report.code:'HELPER_EXIT_FAILED',exitCode:exit};throw error;
      }
      browser=JSON.parse(output);
    }
    return { ok: true, ...(browser?{browser}:{}), checks: ['verified-TLS-no-bypass', 'real-cookie-session-CSRF-role', 'logout-revocation', 'no-Telegram-outbox-for-manual-orders', 'production-read-only-gate', ...checks] };
  } finally {
    gateway.closeAllConnections(); api.closeAllConnections();
    await Promise.all([new Promise(r => gateway.close(r)), new Promise(r => api.close(r))]);
  }
}
module.exports = { exercise };

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash, createHmac } = require('node:crypto');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { createRequire } = require('node:module');
const { createGroupPolicy } = require('../src/courier/groups');
const { configuration } = require('../src/courier/integration-config');
const { parseCommand } = require('../src/b2c-workflow/commands');
const { RuntimeStore } = require('../src/courier/runtime-store');
const { MysqlStore } = require('../src/courier/mysql-store');
const groups = [
  { chatId: '-1001', threadId: null, threadMode: 'non_topic', profile: 'TIAL1', commands: ['order', 'req'] },
  { chatId: '-1002', threadId: null, threadMode: 'non_topic', profile: 'SOLVER1', commands: ['config_psb', 'mo'] }
];
const botId = 'sandbox', key = 'synthetic-service-only-'.repeat(2);
const text = '/order\nSC/IN:X-AOi123\nNO INET:000123\nSN ONT:SN1\nSTO:ABC\nKETERANGAN:test\nNIK:SYNTHETIC';
const event = (content = text, chat = '-1001') => ({ version: 1, bot_id: botId, update_id: '1', event: {
  kind: 'message', chat_id: chat, message_id: '42', telegram_thread_id: null,
  sender_id: '9', reply_to_message_id: null, timestamp: 1700000000, text: content, attachments: []
} });
const policy = () => createGroupPolicy({ botId, botUsername: 'HDWorkOpsBot', groups });
const env = () => ({ HDWORK2_LOCAL_READ_ONLY:'false', COURIER_ENABLED: 'true', COURIER_INTEGRATION_ENABLED: 'true', COURIER_STORE: 'mysql',
  COURIER_SCHEMA_READY: 'true', HDWORK2_OPERATIONS_ENABLED: 'true', HDWORK2_AUTH_V2: 'true', B2C_COMMAND_SCHEMA_READY: 'true',
  COURIER_DB_NAME: 'hdwork2', COURIER_DB_HOST: '127.0.0.1', COURIER_DB_USER: 'courier_only',
  COURIER_DB_PASSWORD: 'synthetic-database-only', COURIER_BOT_ID: botId, COURIER_SERVICE_KEY: key,
  COURIER_IDENTITY_KEY: 'synthetic-identity-only-'.repeat(2), COURIER_BOT_USERNAME: 'HDWorkOpsBot', COURIER_COMMAND_GROUPS_JSON: JSON.stringify(groups) });

test('new ingress reuses four parsers, mentions, explicit allowlist and numeric non-topic groups', () => {
  const p = policy();
  for (const [body, chat, command] of [[text, '-1001', 'order'], [' /ReQ@hdworkopsbot original\n text', '-1001', 'req'],
    ['/CONFIG_PSB@HDWorkOpsBot\nOrder ID:X-AOi1\nSTO:ABC', '-1002', 'config_psb'], ['/MO\nSC/IN:X-MOk1\nSTO:ABC', '-1002', 'mo']]) {
    const e = p.ingress(event(body, chat));
    assert.equal(parseCommand(e.event.text, 'TIAL1', 'HDWorkOpsBot').command, command);
    assert.equal(e.event.chat_id, chat); assert.equal(e.event.message_id, '42'); assert.equal(e.event.telegram_thread_id, null);
  }
  for (const e of [event(text, '-1003'), event('/req@AnotherBot hello'), event('/config_psb\nOrder ID:X-AOi1\nSTO:X'),
    event('DONE'), { ...event(), event: { ...event().event, telegram_thread_id: '1' } },
    { ...event(), event: { ...event().event, kind: 'edited_message' } }]) assert.throws(() => p.ingress(e));
  assert.equal(parseCommand('/req@HDWorkOpsBot hello', 'TIAL1').valid, false);
  for (const g of [[], [{ ...groups[0], chatId: '<PENDING>' }], [{ ...groups[0], commands: [] }], [groups[0], groups[0]],
    [{ ...groups[1], commands: ['order'] }]]) assert.throws(() => createGroupPolicy({ botId, botUsername: 'HDWorkOpsBot', groups: g }));
});

test('outbox authorization requires allowed chat, original anchor and allowed command, never a forum topic', async () => {
  const p = policy(), c = { async execute() { return [[{ command: 'order' }]]; } };
  const payload = { method: 'sendMessage', chat_id: '-1001', telegram_thread_id: null, thread_mode: 'non_topic', reply_to_message_id: '42', text: 'safe' };
  assert.equal(await p.outgoing(payload, c), true);
  assert.equal(await p.outgoing({ ...payload, chat_id: '-1003' }, c), false);
  assert.equal(await p.outgoing({ ...payload, reply_to_message_id: null }, c), false);
  assert.equal(await p.outgoing({ ...payload, telegram_thread_id: '0' }, c), false);
  assert.equal(await p.outgoing(payload, { async execute() { return [[]]; } }), false);
  assert.equal(await p.outgoing(payload, { async execute() { return [[{ command: 'mo' }]]; } }), false);
});

test('integration config is disabled by default, isolated hdwork2 and does not permit old Telegram status actors', () => {
  assert.throws(() => configuration({}));
  const c = configuration(env()); assert.equal(c.database.database, 'hdwork2'); assert.equal(c.workflow.webOnly, true);
  assert.deepEqual(c.workflow.actors, []); assert.deepEqual(c.workflow.groups[1].allowedCommands, ['config_psb', 'mo']);
  for (const change of [{ COURIER_DB_NAME: 'hd_b2c' }, { COURIER_DB_HOST: 'external' }, { COURIER_STORE: 'memory' },
    { COURIER_SCHEMA_READY: 'false' }, { HDWORK2_OPERATIONS_ENABLED: 'false' }, { COURIER_DB_USER: 'root' },
    { COURIER_IDENTITY_KEY: key }, { NODE_APP_INSTANCE: '1' }, { COURIER_COMMAND_GROUPS_JSON: '[]' }, {COURIER_OUTBOX_ENABLED:'yes'}]) assert.throws(() => configuration({ ...env(), ...change }));
});

test('explicit courier startup uses mock hdwork2 readiness, loopback listener and separately gated inbox worker with clean shutdown', async () => {
  const filename=path.resolve('courier-b2c-server.js'), source=fs.readFileSync(filename,'utf8');
  for(const [enabled,defer] of [[false,false],[true,false],[true,true]]) {
    let ready;
    const calls=[],module={exports:{}},mockPool={async query(sql){calls.push(sql);if(sql.startsWith('SELECT'))return [[{db:'hdwork2',account:'courier_only@localhost'}]];return [Object.entries(require('../src/config/operational-grants').policies.courier).map(([t,ps])=>({grant:`GRANT ${ps.join(', ')} ON hdwork2.${t} TO synthetic`}))];},async execute(sql){calls.push(sql);return [[]];},async end(){calls.push('pool-end');}};
    const server={once(){},listen(port,host,cb){assert.equal(port,3091);assert.equal(host,'127.0.0.1');calls.push('listen');cb();},close(cb){calls.push('server-close');cb?.();}};
    const dependencies={
      './src/courier/integration-config':{configuration},'node:cluster':{isWorker:false},
      './src/config/operational-grants':require('../src/config/operational-grants'),
      'mysql2/promise':{createPool(config){assert.equal(config.database,'hdwork2');return mockPool;}},
      './src/courier/mysql-store':{MysqlStore:class{constructor(){}}},
      './src/courier/runtime-store':{RuntimeStore:class{constructor(){}}},
      './src/courier/groups':{createGroupPolicy:()=>({})},
      './src/courier/integration-app':{createIntegrationApp:opts=>{ready=opts.ready;assert.equal(opts.send,false);assert.equal(opts.receive,false);return {}; }},
      'node:http':{createServer:()=>server},
      './src/courier/inbox-worker':{startInboxWorker:()=>{calls.push('worker-start');return{async close(){calls.push('worker-close');}};}},
      './src/b2c-workflow/workflow':{createB2CProcessor:opts=>{assert.equal(opts.config.webOnly,true);return{};}}
    };
    const fakeRequire=n=>{assert.ok(Object.hasOwn(dependencies,n),'Unexpected dependency: '+n);return dependencies[n];};fakeRequire.main={};
    vm.runInNewContext(source,{module,require:fakeRequire,process:{env:{}},console});
    const app=await module.exports.startIntegration({env:{...env(),COURIER_WORKER_ENABLED:String(enabled)},deferInboxWorker:defer});
    assert.equal(calls.includes('worker-start'),enabled&&!defer);assert.ok(calls.filter(c=>c.startsWith('SELECT ')).length>=4);
    assert.equal(ready(),!defer);
    if(defer){app.startWorker();app.startWorker();assert.equal(calls.filter(c=>c==='worker-start').length,1);assert.equal(ready(),true);}
    await Promise.all([app.close(),app.close()]);assert.equal(calls.filter(c=>c==='pool-end').length,1);
    assert.equal(calls.includes('worker-close'),enabled);
    assert.equal(ready(),false);
    assert.throws(()=>app.startWorker(),/already closing/);
  }
});

test('Windows startup templates are inert and do not modify existing PM2, services, credentials or flags',()=>{
  for(const name of ['start-courier-bot.ps1','start-courier-backend.ps1']){
    const source=fs.readFileSync('ops/windows/'+name,'utf8');
    assert.doesNotMatch(source,/pm2\s+(?:start|stop|restart|save)|Register-ScheduledTask|Start-Service|Stop-Service|Set-Content|Get-Content.*\.env|=\s*['"]true['"]/i);
  }
  const cfg=fs.readFileSync('ops/windows/ecosystem.courier.config.cjs','utf8');assert.match(cfg,/instances: 1/);assert.match(cfg,/hdwork2-pm2/);assert.doesNotMatch(cfg,/pm2\.connect|exec\(|spawn\(/);
  assert.equal(JSON.parse(fs.readFileSync('package.json')).scripts.start,'node server.js');
  assert.equal(JSON.parse(fs.readFileSync('package.json')).scripts['start:courier'],'node courier-b2c-server.js --run');
});

function runtimePool() {
  let tail = Promise.resolve(); const state = { workers: new Map(), nonces: new Map() };
  async function execute(sql, p) {
    if (sql.startsWith('INSERT IGNORE')) { const k = p[0] + p[1]; if (state.nonces.has(k)) return [{ affectedRows: 0 }]; state.nonces.set(k, p[2]); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('DELETE')) { for (const [k, expires] of state.nonces) if (expires < p[0]) state.nonces.delete(k); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('INSERT')) { if (!state.workers.has(p[0])) state.workers.set(p[0], { worker_id: p[1], lease_token: p[2], expires_ms: 0 }); return [{}]; }
    if (sql.startsWith('SELECT')) return [[...state.workers.has(p[0]) ? [structuredClone(state.workers.get(p[0]))] : []]];
    if (sql.startsWith('UPDATE')) { state.workers.set(p[3], { worker_id: p[0], lease_token: p[1], expires_ms: p[2] }); return [{}]; }
    throw Error('Unexpected mock SQL');
  }
  return { execute, async getConnection() {
    const previous = tail; let unlock; tail = new Promise(r => { unlock = r; }); await previous;
    const snapshot = structuredClone(state);
    return { execute, async beginTransaction() {}, async commit() {}, async rollback() { state.workers = snapshot.workers; state.nonces = snapshot.nonces; }, release: unlock };
  } };
}

test('worker lease is exclusive, fenced on renewal/release and recovered after expiry; replay survives a new runtime', async () => {
  let now = 1000000; const pool = runtimePool(), store = new MysqlStore({ pool, botId, now: () => now });
  const runtime = new RuntimeStore(store), a = randomUUID(), b = randomUUID();
  const race = await Promise.allSettled([runtime.lease('acquire', { worker_id: a }), runtime.lease('acquire', { worker_id: b })]);
  assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
  const winner = race[0].status === 'fulfilled' ? a : b, lease = race.find(r => r.status === 'fulfilled').value;
  await runtime.assertWorker({ id: winner, lease_token: lease.lease_token });
  await assert.rejects(runtime.assertWorker({ id: winner === a ? b : a, lease_token: lease.lease_token }), { statusCode: 409 });
  await runtime.lease('renew', { worker_id: winner, lease_token: lease.lease_token });
  now += 60001; await assert.rejects(runtime.assertWorker({ id: winner, lease_token: lease.lease_token }), { statusCode: 409 });
  const next = await runtime.lease('acquire', { worker_id: b });
  await assert.rejects(runtime.lease('release', { worker_id: winner, lease_token: lease.lease_token }), { statusCode: 409 });
  await runtime.lease('release', { worker_id: b, lease_token: next.lease_token });
  const nonce = { nonce: 'a'.repeat(32), expiresMs: now + 120000 };
  await runtime.reserveNonce(nonce); await assert.rejects(new RuntimeStore(store).reserveNonce(nonce), { statusCode: 401 });
});

test('entrypoint import is inert and invalid startup rejects before loading any driver, server or legacy component', async () => {
  const module = { exports: {} }, filename = path.resolve('courier-b2c-server.js'), baseRequire = createRequire(filename), calls = [];
  const fakeRequire = name => { calls.push(name); if (name === './src/courier/integration-config') return baseRequire(name); throw Error('Unexpected dependency'); };
  fakeRequire.main = {};
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, require: fakeRequire, process: { env: {} } });
  assert.equal(calls.length, 0);
  await assert.rejects(module.exports.startIntegration()); assert.deepEqual(calls, ['./src/courier/integration-config']);
  const api = fs.readFileSync('api-only-server.js', 'utf8'); assert.doesNotMatch(api, /courier-b2c|startInboxWorker|TelegramClient/);
});

test('inbox worker backs off, does not overlap and waits for in-flight work on graceful close', async () => {
  const { startInboxWorker } = require('../src/courier/inbox-worker');
  let finish, calls = 0, scheduled = [];
  const worker = startInboxWorker({ processNext: () => { calls++; return new Promise(resolve => { finish = resolve; }); } },
    { timers: { setTimeout(fn, ms) { scheduled.push([fn, ms]); return 1; }, clearTimeout() {} } });
  const closing = worker.close(); finish(true); await closing;
  assert.equal(calls, 1); assert.equal(scheduled.length, 0);
  const retry = startInboxWorker({ async processNext() { throw Error('private SQL'); } },
    { timers: { setTimeout(fn, ms) { scheduled.push([fn, ms]); return 1; }, clearTimeout() {} } });
  await new Promise(r => setImmediate(r)); assert.equal(scheduled[0][1], 2000); await retry.close();
});

test('signed internal HTTP rejects spoof, stale timestamp, replay, unleased worker, disabled sending and oversize payload', async () => {
  const { createIntegrationApp } = require('../src/courier/integration-app');
  const nonces = new Set(), seen = [], worker = { id: randomUUID(), lease_token: randomUUID() };
  const runtime = { async reserveNonce(n) { if (nonces.has(n.nonce)) throw Object.assign(Error(), { statusCode: 401 }); nonces.add(n.nonce); },
    async assertWorker(value) { if (JSON.stringify(value) !== JSON.stringify(worker)) throw Object.assign(Error(), { statusCode: 409 }); },
    async lease() { return { lease_token: worker.lease_token, lease_ms: 60000 }; } };
  const store = { async accept(value) { seen.push(value); return { receipt_id: randomUUID() }; } };
  const server = require('node:http').createServer(createIntegrationApp({ botId, key, runtime, store, policy: policy(), receive: true }));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port;
  function signed(body, route, { stamp = String(Math.floor(Date.now() / 1000)), nonce = randomBytes(16).toString('hex') } = {}) {
    const raw = typeof body === 'string' ? body : JSON.stringify(body);
    const msg = [botId, stamp, nonce, 'POST', route, createHash('sha256').update(raw).digest('hex')].join('\n');
    return { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Courier-Id': botId, 'X-Courier-Time': stamp, 'X-Courier-Nonce': nonce, 'X-Courier-Signature': createHmac('sha256', key).update(msg).digest('hex') }, body: raw };
  }
  try {
    const route = '/internal/courier/v1/events';
    assert.equal((await fetch(url + route, { method: 'POST', body: '{}' })).status, 401);
    assert.equal((await fetch(url + route, signed({ ...event(), worker }, route, { stamp: '1000000000' }))).status, 401);
    const packet = signed({ ...event(), worker }, route);
    assert.equal((await fetch(url + route, packet)).status, 200);
    assert.equal((await fetch(url + route, packet)).status, 401);
    assert.equal(seen.length, 1); assert.equal(seen[0].worker, undefined);
    assert.equal((await fetch(url + route, signed(event(), route))).status, 409);
    const claim = '/internal/courier/v1/outbox/claim';
    assert.equal((await fetch(url + claim, signed({ worker, limit: 1 }, claim))).status, 503);
    assert.equal((await fetch(url + route, signed('x'.repeat(66000), route))).status, 413);
    const forbidden = { ...event(text, '-999'), worker };
    assert.equal((await fetch(url + route, signed(forbidden, route))).status, 403);
    const changed = signed({ ...event(), worker }, route); changed.headers['X-Courier-Signature'] = 'a'.repeat(64);
    assert.equal((await fetch(url + route, changed)).status, 401);
  } finally { await new Promise(r => server.close(r)); }
});

test('web-only processor refuses old Telegram DONE replies even if the web flag was not globally enabled', async () => {
  const { mockPool } = require('./helpers/courier-db');
  const pool = mockPool(), store = new MysqlStore({ pool, botId });
  const config = configuration(env()).workflow;
  const processor = require('../src/b2c-workflow/workflow').createB2CProcessor({ store, config });
  const e = event('DONE'); e.event.reply_to_message_id = '40'; await store.accept(e); await processor.processNext();
  assert.equal(pool.state.orders.length, 0); assert.equal(pool.state.outbox.length, 0);
  assert.equal(pool.state.audit[0].action, 'TELEGRAM_STATUS_NOT_AUTHORIZED');
});

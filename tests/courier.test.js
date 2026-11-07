const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac, createHash } = require('node:crypto');
const { MemoryStore } = require('../src/courier/memory-store');
const { createServiceAuth } = require('../src/courier/auth');
const { eventEnvelope } = require('../src/courier/contract');
const key = 'synthetic-only-'.repeat(3), botId = 'sandbox';
const event = (update = '1') => ({ version: 1, bot_id: botId, update_id: update, event: { kind: 'message', chat_id: '-1001234567890', message_id: '42', telegram_thread_id: null, sender_id: '17', reply_to_message_id: null, timestamp: 1700000000, text: 'synthetic', attachments: [] } });
const payload = { method: 'sendMessage', chat_id: '-1001234567890', telegram_thread_id: null, thread_mode: 'non_topic', reply_to_message_id: '42', text: 'synthetic reply' };
function signed(nonce = 'a'.repeat(32), path = '/internal/courier/v1/events') {
  const body = Buffer.from(JSON.stringify(event()));
  const content = [botId, '1700000000', nonce, 'POST', path, createHash('sha256').update(body).digest('hex')].join('\n');
  return { socket: { remoteAddress: '127.0.0.1' }, method: 'POST', originalUrl: path, body, headers: { 'x-courier-id': botId, 'x-courier-time': '1700000000', 'x-courier-nonce': nonce, 'x-courier-signature': createHmac('sha256', key).update(content).digest('hex') } };
}
test('service auth validates signature, origin, socket and replay without trusting IP headers', () => {
  const verify = createServiceAuth({ botId, key, now: () => 1700000000000 });
  const valid = signed(); verify(valid); assert.throws(() => verify(valid));
  for (const change of [r => { r.body = Buffer.from('{}'); }, r => { r.originalUrl += '?other=1'; }, r => { r.headers['x-courier-id'] = 'other'; }, r => { r.headers['x-courier-time'] = '1600000000'; }, r => { r.socket.remoteAddress = '198.51.100.1'; r.headers['x-forwarded-for'] = '127.0.0.1'; }, r => { r.headers.origin = 'https://web.example'; }, r => { delete r.headers['x-courier-signature']; }]) {
    const req = signed('b'.repeat(32)); change(req); assert.throws(() => verify(req));
  }
});
test('same update is inserted once, changed payload conflicts and different updates are preserved', () => {
  const db = new MemoryStore({ botId }); const first = db.accept(event());
  assert.equal(db.accept(event()).duplicate, true); assert.equal(db.inbox.size, 1);
  const changed = event(); changed.event.text = 'edited'; assert.throws(() => db.accept(changed), { statusCode: 409 });
  db.accept(event('2')); assert.equal(db.inbox.size, 2);
  const edited = event('3'); edited.event.kind = 'edited_message'; db.accept(edited); assert.equal(db.inbox.size, 3); assert.ok(first.receipt_id);
  const otherBot = event(); otherBot.bot_id = 'other'; assert.throws(() => db.accept(otherBot));
});
test('parser contract preserves exact strings and missing topic; malformed or oversized events rejected', () => {
  const e = event(); e.event.chat_id = '-4503599627370495'; assert.equal(eventEnvelope(e, botId).event.chat_id, '-4503599627370495');
  for (const value of ['0', '-1', '42.5', '1e3', '2147483648']) { const bad = event(); bad.event.message_id = value; assert.throws(() => eventEnvelope(bad, botId)); }
  const bad = event(); bad.event.telegram_thread_id = '0'; assert.throws(() => eventEnvelope(bad, botId));
  const extra = event(); extra.event.credentials = 'not copied'; assert.equal(eventEnvelope(extra, botId).event.credentials, undefined);
});
test('outbox deduplication, exclusive lease, ACK idempotency and late/stale lease protection', () => {
  let now = 0; const db = new MemoryStore({ botId, now: () => now });
  const id = db.enqueue('business-id-1', payload); assert.equal(db.enqueue('business-id-1', payload), id);
  assert.throws(() => db.enqueue('business-id-1', { ...payload, text: 'different' }));
  const [job] = db.claim(); assert.equal(job.delivery_id, id); assert.deepEqual(db.claim(), []);
  assert.throws(() => db.settle(id, { lease_token: 'wrong', result: 'sent', telegram_message_id: '55' }));
  const ack = { lease_token: job.lease_token, result: 'sent', telegram_message_id: '55' };
  assert.equal(db.settle(id, ack).duplicate, false); assert.equal(db.settle(id, ack).duplicate, true);
  assert.throws(() => db.settle(id, { ...ack, telegram_message_id: '56' })); assert.deepEqual(db.claim(), []);
  const id2 = db.enqueue('business-id-2', payload); const [expired] = db.claim(); now = 60001;
  assert.throws(() => db.settle(id2, { lease_token: expired.lease_token, result: 'sent', telegram_message_id: '55' }));
});
test('retry backoff and Telegram retry-after are enforced; five attempts become dead', () => {
  let now = 0; const db = new MemoryStore({ botId, now: () => now }); const id = db.enqueue('retry', payload);
  for (let attempt = 1; attempt <= 5; attempt++) {
    const [job] = db.claim(); assert.equal(job.attempt, attempt);
    db.settle(id, { lease_token: job.lease_token, result: 'retry', error_code: 'RATE_LIMIT', retry_after: 3 });
    assert.deepEqual(db.claim(), []); now = db.outbox.get(id).due;
  }
  assert.equal(db.outbox.get(id).status, 'dead'); assert.deepEqual(db.claim(), []);
});
test('lease timeout requeues with backoff and cannot exceed max attempts', () => {
  let now = 0; const db = new MemoryStore({ botId, now: () => now, maxAttempts: 1 }); const id = db.enqueue('expired', payload);
  db.claim(); now = 60001; assert.deepEqual(db.claim(), []); assert.equal(db.outbox.get(id).status, 'dead');
});
test('bounded mock database fails closed; explicit thread policy and attachment metadata supported', () => {
  const db = new MemoryStore({ botId, maxEntries: 1 }); db.accept(event()); assert.throws(() => db.accept(event('2')), { statusCode: 503 });
  assert.throws(() => db.enqueue('bad', { ...payload, thread_mode: 'thread' }));
  const e = event(); e.event.attachments = [{ kind: 'photo', file_id: 'dummy-file', file_unique_id: 'dummy-unique', name: null, mime_type: null, size: 42 }];
  assert.equal(eventEnvelope(e, botId).event.attachments[0].file_id, 'dummy-file');
});
test('courier startup is disabled and inert by default; no database or legacy imports', async () => {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'); const module = { exports: {} }, imported = [];
  function req(name) { imported.push(name); throw Error('No dependency allowed while disabled'); } req.main = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../courier-api-server.js'), 'utf8'), { module, require: req, process: { env: {} } });
  assert.deepEqual(imported, []); await assert.rejects(module.exports.startCourier()); assert.deepEqual(imported, []);
});

test('actual courier HTTP handlers require service auth, sanitize DB failures and have no enqueue/workflow route', async () => {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
  const module = { exports: {} }, stack = [];
  const express = Object.assign(() => ({ disable() {}, use(fn) { stack.push(['use', fn]); }, post(url, fn) { stack.push([url, fn]); } }), { raw: () => (_req, _res, next) => next() });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/courier/app.js'), 'utf8'), { module, require(name) { if (name === 'express') return express; if (name === './auth') return require('../src/courier/auth'); if (name === '../middlewares/api-rate-limit') return require('../src/middlewares/api-rate-limit'); throw Error('forbidden dependency'); } });
  const db = new MemoryStore({ botId });
  module.exports.createCourierApp({ store: db, botId, key, now: () => 1700000000000 });
  assert.deepEqual(stack.filter(([route]) => route !== 'use').map(([route]) => route), ['/internal/courier/v1/events', '/internal/courier/v1/outbox/claim', '/internal/courier/v1/outbox/:id/result']);
  async function dispatch(req) {
    const res = { code: 200, set() {}, status(n) { this.code = n; return this; }, json(body) { this.body = body; return this; } };
    for (const [, middleware] of stack.slice(0, 3)) { let passed = false; middleware(req, res, () => { passed = true; }); if (!passed) return res; }
    try { await stack.find(([route]) => route === req.originalUrl)[1](req, res); }
    catch (error) { stack.at(-1)[1](error, req, res, () => {}); }
    return res;
  }
  const unsigned = signed(); delete unsigned.headers['x-courier-signature']; assert.equal((await dispatch(unsigned)).code, 401);
  const accepted = await dispatch(signed('c'.repeat(32))); assert.equal(accepted.body.ok, true); assert.equal(db.inbox.size, 1);
  db.accept = () => { throw Error('private credentials and payload'); };
  const failed = await dispatch(signed('d'.repeat(32))); assert.equal(failed.code, 500); assert.doesNotMatch(JSON.stringify(failed.body), /private|credentials|payload/);
});

test('Python envelope interoperates with Node contract using synthetic data without network', () => {
  const { execFileSync } = require('node:child_process');
  const raw = execFileSync('python', ['-c', "import json; from courier.parser import parse_update; print(json.dumps(parse_update({'update_id':1,'message':{'chat':{'id':-1001234567890},'message_id':42,'date':1700000000,'from':{'id':17},'text':'synthetic'}},'sandbox')))"], { env: { ...process.env, PYTHONPATH: 'courier_bot' }, encoding: 'utf8' });
  assert.deepEqual(eventEnvelope(JSON.parse(raw), botId), event());
});

test('Python signed UTF-8 request is accepted by actual Node verifier without Telegram access', () => {
  const { execFileSync } = require('node:child_process');
  const source = "import json; from types import SimpleNamespace; from courier.clients import InternalClient; c=SimpleNamespace(bot_id='sandbox',service_key='synthetic-only-'*3,server='http://127.0.0.1:3091'); t=SimpleNamespace(post=lambda url,raw,headers: print(json.dumps({'raw':raw.decode(),'headers':headers}))); InternalClient(c,t,clock=lambda:1700000000,nonce=lambda:'e'*32).post('/internal/courier/v1/events',{'text':'synthetic \\u03a9'})";
  const result = JSON.parse(execFileSync('python', ['-c', source], { env: { ...process.env, PYTHONPATH: 'courier_bot' }, encoding: 'utf8' }));
  const req = { socket: { remoteAddress: '127.0.0.1' }, method: 'POST', originalUrl: '/internal/courier/v1/events', body: Buffer.from(result.raw), headers: Object.fromEntries(Object.entries(result.headers).map(([name, value]) => [name.toLowerCase(), value])) };
  createServiceAuth({ botId, key, now: () => 1700000000000 })(req);
});

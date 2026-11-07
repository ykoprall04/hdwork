const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { corsOptions } = require('../src/config/api-cors');
const { browserResult } = require('../src/adapters/staging-browser-dto');
function fixture() {
  const loaded = [], events = [], cache = new Map();
  const env = { PORT: '4321', FRONTEND_ORIGINS: 'https://hdwork.yoloo.space', TELEGRAM_BOT_TOKEN: 'dummy', TELEGRAM_POLLING_ENABLED: 'true' };
  let app;
  function router() {
    const r = { stack: [], disable() {} };
    for (const method of ['use', 'get', 'post']) r[method] = (...args) => { r.stack.push([method, ...args]); return r; };
    return r;
  }
  const express = Object.assign(() => { app = router(); return app; }, { Router: router, json: () => () => {} });
  const external = {
    express, cors: () => () => {}, bcrypt: {},
    jsonwebtoken: { verify(token) { if (token === 'dummy-super') return { role: 'SUPER_ADMIN' }; if (token === 'dummy-hd') return { role: 'HD' }; throw Error('bad'); } },
    'mysql2/promise': { createPool() { return { query() { throw Error('No DB access allowed'); } }; } },
    'node:http': { createServer() { return { once() {}, listen(port, host, ready) { assert.equal(port, 4321); assert.equal(host, '127.0.0.1'); events.push('listen'); ready(); } }; } },
  };
  function load(file) {
    file = path.resolve(file); if (cache.has(file)) return cache.get(file).exports;
    loaded.push(file); assert.doesNotMatch(file, /telegram\.service|scheduler|collector|agent-realtime|terminal-realtime|sync/i);
    const module = { exports: {} }; cache.set(file, module);
    function requireMock(name) {
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + (name.endsWith('.js') ? '' : '.js')));
      if (name === 'node:crypto') return require(name);
      assert.ok(Object.hasOwn(external, name), `Forbidden external import: ${name}`); return external[name];
    }
    requireMock.main = {};
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, require: requireMock, process: { env }, URL, console: { log() {}, error() {} } });
    return module.exports;
  }
  return { load, loaded, events, get app() { return app; } };
}
test('actual API-only dependency graph starts with mocks without Telegram/workers/socket imports', async () => {
  const f = fixture(); const entry = f.load(path.join(__dirname, '../api-only-server.js'));
  assert.deepEqual(f.events, []); await entry.startApiOnly(); assert.deepEqual(f.events, ['listen']);
  assert.ok(!f.loaded.some(name => name.endsWith('/src/app.js')));
  const mounts = f.app.stack.filter(([m, url]) => m === 'use' && typeof url === 'string').map(([, url]) => url);
  assert.deepEqual(mounts, ['/api/auth', '/api/b2c-staging/orders']);
});
test('actual staging route rejects unauthenticated/bad tokens, HD and disabled Super Admin without DB', async () => {
  const f = fixture(); f.load(path.join(__dirname, '../src/api-only-app.js')).createApiOnlyApp();
  const mounted = f.app.stack.find(([, url]) => url === '/api/b2c-staging/orders')[2];
  const auth = mounted.stack.find(([method]) => method === 'use')[1];
  const list = mounted.stack.find(([method]) => method === 'get')[2];
  for (const [token, expected] of [[null, 401], ['bad', 401], ['dummy-hd', 403], ['dummy-super', 503]]) {
    const req = { headers: token ? { authorization: `Bearer ${token}` } : {}, query: {} };
    let status = 200, next = false;
    const res = { set() {}, status(code) { status = code; return this; }, json() {} };
    auth(req, res, () => { next = true; }); if (next) await list(req, res);
    assert.equal(status, expected);
  }
});
test('CORS allowlist rejects wildcard/malformed configuration and foreign origins', () => {
  for (const value of ['', '*', 'https://web.example/path', 'https://user:password@web.example']) assert.throws(() => corsOptions({ FRONTEND_ORIGINS: value }));
  const options = corsOptions({ FRONTEND_ORIGINS: 'https://hdwork.yoloo.space,http://localhost:5173' });
  options.origin('https://hdwork.yoloo.space', (error, allow) => { assert.equal(error, null); assert.equal(allow, true); });
  options.origin('https://foreign.example', error => assert.equal(error.statusCode, 403));
});
test('browser DTO strips internal Telegram references and any unexpected secrets', () => {
  const result = browserResult({ data: [{ id: 'dummy', module: 'TIAL', reference_verified: true, reference_syntax_valid: true, reference_complete: true, telegram_chat_id: 'private', telegram_message_id: 'private', telegram_thread_id: 'private', source_bot: 'private', password: 'private', token: 'private', payload: {} }], page: 1, hasMore: false });
  assert.equal(result.data[0].reference_verified, false);
  for (const key of ['telegram_chat_id', 'telegram_message_id', 'telegram_thread_id', 'source_bot', 'password', 'token', 'payload']) assert.equal(Object.hasOwn(result.data[0], key), false);
});

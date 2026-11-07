const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { createRateLimit } = require('../src/middlewares/api-rate-limit');
function response() { return { code: 200, headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(n) { this.code = n; return this; }, json(body) { this.body = body; return this; } }; }
test('login limit blocks attempts, emits Retry-After, ignores spoofed forwarded IP and resets', () => {
  let now = 0, passed = 0;
  const limit = createRateLimit({ limit: 2, windowMs: 60000, now: () => now });
  for (let i = 0; i < 3; i++) {
    const res = response(); limit({ socket: { remoteAddress: 'loopback' }, headers: { 'x-forwarded-for': `dummy-${i}` } }, res, () => passed++);
    assert.equal(res.code, i < 2 ? 200 : 429); if (i === 2) assert.equal(res.headers['Retry-After'], '60');
  }
  assert.equal(passed, 2); now = 60000;
  const res = response(); limit({ socket: { remoteAddress: 'loopback' } }, res, () => passed++); assert.equal(passed, 3);
});
test('limiter has bounded storage and fails closed for new keys at capacity', () => {
  const limit = createRateLimit({ limit: 1, windowMs: 60000, maxKeys: 1, now: () => 0 });
  limit({ socket: { remoteAddress: 'a' } }, response(), () => {});
  const res = response(); limit({ socket: { remoteAddress: 'b' } }, res, () => assert.fail()); assert.equal(res.code, 429);
});
function controller(actor, fail = false) {
  let calls = 0, reads = 0;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/controllers/b2c-staging.controller.js'), 'utf8'), {
    module, process: { env: { B2C_STAGING_ENABLED: 'true' } },
    require(name) {
      if (name.endsWith('staging-account-limit')) return { allow: () => true };
      if (name.endsWith('auth.repository')) return { async findAccessById(id) { calls++; assert.equal(id, 1); if (fail) throw Error('password=secret SQL host.internal'); return actor; } };
      if (name.endsWith('staging-browser-dto')) return { browserResult: value => value };
      if (name.endsWith('tial-staging')) return { createTialReader: () => async () => { reads++; return { data: [] }; } };
      if (name.endsWith('b2c-staging')) return { validateQuery: () => ({ module: 'TIAL' }) };
      throw Error('unexpected dependency');
    },
  });
  return { list: module.exports.list, counts: () => ({ calls, reads }) };
}
test('staging rejects inactive, removed and downgraded users despite Super Admin JWT', async () => {
  for (const actor of [null, { role: 'SUPER_ADMIN', is_active: 0 }, { role: 'HD', is_active: 1 }, { role: 'ADMIN', is_active: 1 }]) {
    const f = controller(actor), res = response(); await f.list({ user: { id: 1, role: 'SUPER_ADMIN' }, query: {} }, res);
    assert.equal(res.code, 403); assert.deepEqual(f.counts(), { calls: 1, reads: 0 });
  }
});
test('staging rechecks active role on every call and denies after deactivation', async () => {
  const actor = { role: 'SUPER_ADMIN', is_active: 1 }, f = controller(actor);
  const req = { user: { id: 1, role: 'SUPER_ADMIN' }, query: {} };
  const first = response(); await f.list(req, first); assert.equal(first.code, 200);
  actor.is_active = 0; const second = response(); await f.list(req, second); assert.equal(second.code, 403);
  assert.deepEqual(f.counts(), { calls: 2, reads: 1 });
});
test('database failure fails closed with sanitized error before staging read', async () => {
  const f = controller(null, true), res = response(); await f.list({ user: { id: 1, role: 'SUPER_ADMIN' }, query: {} }, res);
  assert.equal(res.code, 503); assert.doesNotMatch(JSON.stringify(res.body), /password|SQL|host.internal|secret/);
  assert.equal(f.counts().reads, 0);
});
test('login never returns or logs raw dependency errors', async () => {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/controllers/auth.controller.js'), 'utf8'), { module, console: { error: () => assert.fail('raw logging forbidden') }, require: () => ({ login: async () => { throw Error('password=secret SQL internal'); } }) });
  const res = response(); await module.exports.login({ body: { username: 'dummy', password: 'dummy' } }, res);
  assert.equal(res.code, 503); assert.doesNotMatch(JSON.stringify(res.body), /password|SQL|internal|secret/);
});


test('account quota isolates users behind same tunnel and ignores arbitrary proxy headers', () => {
  const limiter = createRateLimit({ limit: 1, windowMs: 60000, now: () => 0, keyFor: req => String(req.databaseId) });
  const request = (id, header) => ({ databaseId: id, socket: { remoteAddress: '127.0.0.1' }, headers: { 'cf-connecting-ip': header, 'x-forwarded-for': header } });
  const a = response(); limiter(request(1, 'fake-a'), a, () => {}); assert.equal(a.code, 200);
  const b = response(); limiter(request(2, 'fake-a'), b, () => {}); assert.equal(b.code, 200);
  const again = response(); limiter(request(1, 'fake-b'), again, () => assert.fail()); assert.equal(again.code, 429);
});
test('connection quota cannot be bypassed by CF or Forwarded headers', () => {
  const limiter = createRateLimit({ limit: 1, windowMs: 60000, now: () => 0 });
  limiter({ socket: { remoteAddress: '127.0.0.1' } }, response(), () => {});
  const res = response(); limiter({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'cf-connecting-ip': 'fake', forwarded: 'for=fake', 'x-forwarded-for': 'fake' } }, res, () => assert.fail());
  assert.equal(res.code, 429);
});
function meFixture(actor, fail = false) {
  const module = { exports: {} }; let calls = 0;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/controllers/auth.controller.js'), 'utf8'), { module, require(name) {
    if (name.endsWith('auth.service')) return {};
    if (name.endsWith('auth.repository')) return { findAccessById: async () => { calls++; if (fail) throw Error('secret database'); return actor; } };
    throw Error('unexpected');
  } });
  return { getMe: module.exports.getMe, count: () => calls };
}
test('me reads current active role rather than stale JWT and never returns injected claims', async () => {
  const actor = { id: 1, name: 'Dummy', username: 'dummy', city_id: 1, role: 'HD', is_active: 1, password_hash: 'private' };
  const f = meFixture(actor), req = { user: { id: 1, role: 'SUPER_ADMIN', password: 'private', token: 'private' } };
  const first = response(); await f.getMe(req, first); assert.equal(first.body.data.role, 'HD'); assert.equal(first.headers['Cache-Control'], 'no-store');
  assert.equal(first.body.data.password_hash, undefined); assert.equal(first.body.data.token, undefined);
  actor.role = 'ADMIN'; const second = response(); await f.getMe(req, second); assert.equal(second.body.data.role, 'ADMIN');
  actor.is_active = 0; const third = response(); await f.getMe(req, third); assert.equal(third.code, 403); assert.equal(f.count(), 3);
});
test('me denies deleted/malformed identities and sanitizes database failure', async () => {
  const deleted = response(); await meFixture(null).getMe({ user: { id: 1 } }, deleted); assert.equal(deleted.code, 403);
  const bad = meFixture(null), res = response(); await bad.getMe({ user: { id: '../bad' } }, res); assert.equal(res.code, 401); assert.equal(bad.count(), 0);
  const error = response(); await meFixture(null, true).getMe({ user: { id: 1 } }, error); assert.equal(error.code, 503); assert.doesNotMatch(JSON.stringify(error.body), /secret|database/);
});


test('actual staging account limiter has 30-request budget independent of network location', () => {
  const { allow } = require('../src/middlewares/staging-account-limit');
  for (let i = 0; i < 30; i++) assert.equal(allow('9001', response()), true);
  const blocked = response(); assert.equal(allow('9001', blocked), false); assert.equal(blocked.code, 429);
  assert.equal(allow('9002', response()), true);
});

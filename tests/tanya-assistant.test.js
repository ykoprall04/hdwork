const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { createStore } = require('../src/assistant/store');
const { createRoutes } = require('../src/assistant/routes');
const { AssistantError, baseUrl, publicAddress, providerRequest } = require('../src/assistant/provider');

test('provider rejects unsafe targets and mixed public/private DNS before connecting', async () => {
  for (const url of ['http://provider.net/v1','https://127.0.0.1','https://[::1]','https://user:secret@provider.net','https://provider.net:123','https://provider.net/v1?x=y']) {
    assert.throws(() => baseUrl(url), AssistantError);
  }
  for (const ip of ['::1','::ffff:8.8.8.8','fe80::1','fc00::1','169.254.169.254','192.168.1.1','100.64.0.1','2002:7f00:1::','0.0.0.0']) {
    assert.equal(publicAddress(ip), false, ip);
  }
  assert.equal(publicAddress('8.8.8.8'), true);
  assert.equal(publicAddress('2606:4700:4700::1111'), true);
  assert.equal(baseUrl('https://api.dinero.web.id/v1/'), 'https://api.dinero.web.id/v1');
  await assert.rejects(providerRequest({ baseUrl: 'https://provider.net', apiKey: 'secret' }, '/models', undefined, undefined, {
    resolve: async () => [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }],
    request: () => assert.fail('unsafe DNS must never open a connection')
  }), { status: 400 });
  const { EventEmitter } = require('node:events');
  await assert.rejects(providerRequest({ baseUrl: 'https://provider.net', apiKey: 'secret' }, '/models', undefined, undefined, {
    resolve: async () => [{ address: '8.8.8.8', family: 4 }],
    request: (url, options, callback) => {
      assert.equal(url.hostname, 'provider.net');
      options.lookup(url.hostname, { all: true }, (_error, addresses) => assert.deepEqual(addresses, [{ address: '8.8.8.8', family: 4 }]));
      const request = new EventEmitter();
      request.end = () => callback({ statusCode: 302, destroy() {} });
      return request;
    }
  }), { status: 502 });
});

test('assistant RBAC, knowledge, general conversation, safe failure, backup and restart', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tanya-test-'));
  const secret = 'synthetic-provider-key';
  const testEncryptionKey = crypto.randomBytes(32);
  const codec = {
    async seal(bytes) {
      const nonce = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', testEncryptionKey, nonce);
      const body = Buffer.concat([cipher.update(bytes), cipher.final()]);
      return Buffer.concat([nonce, cipher.getAuthTag(), body]);
    },
    async open(bytes) {
      const cipher = crypto.createDecipheriv('aes-256-gcm', testEncryptionKey, bytes.subarray(0, 12));
      cipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]);
    }
  };
  const exposed = [];
  let failure;
  const store = createStore(root, codec);
  const app = express();
  app.use(express.json(), (req, res, next) => {
    const role = req.get('x-role');
    if (!role) return res.sendStatus(401);
    req.user = { id: role, role, modules: req.get('x-scope') === 'other' ? ['ASSUREN'] : ['TIAL'] };
    next();
  });
  app.use(createRoutes({ store, http: { csrf(req) {
    if (req.get('x-csrf') !== 'test') throw Object.assign(Error('CSRF'), { statusCode: 403 });
  } }, provider: async (config, endpoint, body) => {
    assert.equal(config.apiKey, secret);
    exposed.push({ endpoint, body });
    if (failure) throw failure;
    if (endpoint === '/models') return { data: [{ id: 'synthetic' }, { id: secret }] };
    const prompt = body.messages.at(-1).content;
    return { choices: [{ message: { content: prompt === 'Jawab hanya: OK' ? 'OK' : 'Jawaban singkat.' } }] };
  } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(root, { recursive: true, force: true }); });
  const request = async (endpoint, role, body, extra) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(role ? { 'x-role': role } : {}), 'x-csrf': 'test', ...extra },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    assert.ok(!text.includes(secret));
    return { status: response.status, body: response.status === 401 ? null : JSON.parse(text) };
  };
  const admin = 'SUPER_ADMIN';
  const config = { baseUrl: 'https://api.dinero.web.id/v1', model: 'synthetic', enabled: true };
  assert.equal((await request('/settings')).status, 401);
  for (const role of ['HD', 'ADMIN', 'SHOW_ONLY']) {
    assert.equal((await request('/settings', role)).status, 403);
    for (const endpoint of ['/test', '/settings', '/articles', '/backup', '/restore']) assert.equal((await request(endpoint, role, {})).status, 403);
  }
  assert.equal((await request('/settings', admin, config, { 'x-csrf': 'bad' })).status, 403);
  assert.equal((await request('/chat', 'HD', { question: 'Apa itu hujan?' })).status, 503);
  assert.equal((await request('/settings', admin, { ...config, apiKey: secret })).status, 409);
  assert.equal((await request('/settings', admin, { ...config, enabled: false, apiKey: secret })).body.keyConfigured, true);
  assert.equal((await request('/settings', admin, config)).status, 409);
  assert.equal((await request('/settings', admin, { ...config, baseUrl: 'https://other.net/v1', apiKey: secret })).status, 400);
  assert.deepEqual((await request('/test', admin, {})).body, { models: ['synthetic'], modelVerified: true });
  assert.equal((await request('/settings', admin, config)).body.enabled, true);
  assert.equal((await request('/settings', admin, { ...config, model: 'changed' })).status, 409);
  const article = { operation: 'save', title: 'Kebijakan Rhorium', tags: 'rhorium', text: 'Panduan Rhorium khusus petugas TIAL.', roles: ['HD'], modules: ['TIAL'], published: false };
  const draft = (await request('/articles', admin, article)).body.articles.at(-1);
  assert.equal(draft.text, undefined);
  assert.equal((await request('/articles/' + draft.id, 'HD')).status, 403);
  assert.equal((await request('/articles/' + draft.id, admin)).body.text, article.text);
  await request('/chat', 'HD', { question: 'Rhorium?' });
  assert.doesNotMatch(exposed.at(-1).body.messages[0].content, /Panduan Rhorium/);
  await request('/articles', admin, { ...article, id: draft.id, published: true });
  const question = 'Bagaimana Rhorium?';
  assert.equal((await request('/chat', 'HD', { question })).body.answer, 'Jawaban singkat.');
  assert.match(exposed.at(-1).body.messages[0].content, /Panduan Rhorium/);
  await request('/chat', 'HD', { question: 'Lalu bagaimana?', history: [{ role: 'user', content: question }, { role: 'assistant', content: 'Jawaban singkat.' }] });
  assert.match(exposed.at(-1).body.messages[0].content, /Panduan Rhorium/);
  await request('/chat', 'HD', { question }, { 'x-scope': 'other' });
  assert.doesNotMatch(exposed.at(-1).body.messages[0].content, /Panduan Rhorium/);
  await request('/chat', 'HD', { question: 'Mengapa hujan turun?' });
  assert.match(exposed.at(-1).body.messages[0].content, /Referensi HD Work tidak tersedia/);
  assert.equal((await request('/chat', 'HD', { question: 'NO INET: 123456789000' })).status, 400);
  assert.equal((await request('/chat', 'SHOW_ONLY', { question })).status, 403);
  for (const status of [429, 504]) {
    failure = new AssistantError(status, 'Kesalahan penyedia.');
    assert.equal((await request('/chat', 'HD', { question })).status, status);
  }
  failure = Error(secret);
  assert.equal((await request('/chat', 'HD', { question })).status, 503);
  await request('/backup', admin, {});
  await request('/articles', admin, { operation: 'delete', id: draft.id });
  await request('/settings', admin, { ...config, enabled: false });
  const restarted = createStore(root, codec);
  assert.equal((await restarted.get()).apiKey, secret);
  assert.equal((await restarted.get()).enabled, false);
  const restored = (await request('/restore', admin, {})).body;
  assert.equal(restored.enabled, false);
  assert.equal(restored.providerVerified, false);
  assert.equal((await request('/settings', admin, config)).status, 409);
  for (const file of await fs.readdir(root)) {
    const bytes = await fs.readFile(path.join(root, file));
    for (const value of [secret, question, 'Jawaban singkat.', article.text]) assert.ok(!bytes.includes(value));
  }
  await fs.writeFile(path.join(root, 'tanya-state.dpapi'), 'corrupted');
  const recovery = createStore(root, codec);
  await assert.rejects(recovery.get());
  await recovery.restore();
  assert.equal((await recovery.get()).apiKey, secret);
  assert.equal((await recovery.get()).articles.at(-1).id, draft.id);
});

test('Windows DPAPI reopens encrypted state and backup under the same identity', { skip: process.platform !== 'win32' }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tanya-dpapi-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const apiKey = 'synthetic-dpapi-key';
  const store = createStore(root);
  await store.update(state => ({ ...state, apiKey, model: 'synthetic', enabled: true }));
  await store.backup();
  const fresh = createStore(root);
  assert.equal((await fresh.get()).apiKey, apiKey);
  await fresh.update(state => ({ ...state, apiKey: '', enabled: false }));
  await fresh.restore();
  assert.equal((await createStore(root).get()).apiKey, apiKey);
  assert.ok(!(await fs.readFile(path.join(root, 'tanya-backup.dpapi'))).includes(apiKey));
});

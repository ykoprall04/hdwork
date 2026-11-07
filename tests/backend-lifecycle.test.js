const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function startupFixture(main = false, failDatabase = false) {
  const events = [];
  const module = { exports: {} };
  const env = { PORT: '4321', TELEGRAM_BOT_TOKEN: 'test-only', TELEGRAM_POLLING_ENABLED: 'true' };
  const dependencies = {
    dotenv: { config() { events.push('dotenv'); } },
    http: { createServer() { events.push('http'); return { listen(port, ready) { assert.equal(port, 4321); events.push('listen'); ready(); } }; } },
    'socket.io': { Server: class { use() { events.push('auth'); } } },
    jsonwebtoken: { verify() {} },
    './src/app': {},
    './src/config/database': { async getConnection() { events.push('db'); if (failDatabase) throw new Error('mock DB unavailable'); return { release() { events.push('release'); } }; } },
  };
  for (const name of ['realtime', 'agent-realtime', 'terminal-realtime']) {
    dependencies[`./src/services/${name}.service`] = { initialize() { events.push(name); } };
  }
  function requireMock(name) {
    assert.ok(Object.hasOwn(dependencies, name), `Forbidden/unexpected startup dependency: ${name}`);
    return dependencies[name];
  }
  requireMock.main = main ? module : {};
  const context = { module, require: requireMock, process: { env, exit(code) { events.push(`exit:${code}`); } }, console: { log() {}, error() {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8'), context);
  return { events, start: module.exports.startServer };
}

test('importing backend has no operational side effects or env loading', () => {
  assert.deepEqual(startupFixture().events, []);
});

test('explicit API startup never loads polling, collector or scheduler even with a token', async () => {
  const f = startupFixture();
  await f.start();
  assert.ok(f.events.includes('listen'));
  assert.ok(f.events.indexOf('release') < f.events.indexOf('listen'));
  assert.ok(f.events.includes('terminal-realtime'));
});

test('CLI path starts API only with fully mocked I/O', async () => {
  const f = startupFixture(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.events.includes('dotenv'));
  assert.ok(f.events.includes('listen'));
});

test('database failure does not listen or start background consumers', async () => {
  const f = startupFixture(false, true);
  await f.start();
  assert.ok(f.events.includes('exit:1'));
  assert.ok(!f.events.includes('listen'));
});

// Evaluate actual app and routers, replacing every controller/middleware with
// inert functions. No MySQL, Telegram, upload filesystem or listener is loaded.
test('all existing API mounts and route handlers remain registered', () => {
  const routers = [];
  function router() {
    const result = { stack: [] };
    for (const method of ['use', 'get', 'post', 'put', 'patch', 'delete']) {
      result[method] = (...args) => { result.stack.push([method, ...args]); return result; };
    }
    routers.push(result);
    return result;
  }
  const express = Object.assign(router, { Router: router, json: () => () => {}, static: () => () => {} });
  const noop = () => {};
  const controller = new Proxy({}, { get: () => noop });
  function evaluate(file) {
    const module = { exports: {} };
    const root = path.join(__dirname, '..');
    vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
      module, __dirname: path.dirname(path.join(root, file)), console,
      require(name) {
        if (name === 'express') return express;
        if (name === 'cors') return () => noop;
        if (name === 'path') return path;
        if (name.startsWith('./routes/')) return evaluate(`src/routes/${name.slice('./routes/'.length)}.js`);
        if (name.includes('/controllers/')) return controller;
        if (name.endsWith('upload.middleware')) return { array: () => noop };
        if (name.includes('/middlewares/')) return noop;
        throw new Error(`Unexpected app/route dependency: ${name}`);
      },
    });
    return module.exports;
  }
  const app = evaluate('src/app.js');
  const mounts = app.stack.filter(([method, prefix]) => method === 'use' && typeof prefix === 'string' && prefix.startsWith('/api/'));
  assert.deepEqual(mounts.map(([, prefix]) => prefix).sort(), ['/api/agents', '/api/attendance', '/api/auth', '/api/b2c-staging/orders', '/api/dashboard', '/api/groups', '/api/network', '/api/orders', '/api/users']);
  for (const [, prefix, mounted] of mounts) {
    const handlers = mounted.stack.filter(([method]) => method !== 'use');
    assert.ok(handlers.length, `${prefix} has handlers`);
    for (const [method, url, ...callbacks] of handlers) {
      assert.ok(callbacks.length && callbacks.every(fn => typeof fn === 'function'), `${method} ${prefix}${url} resolves its handlers`);
    }
  }
  const orders = mounts.find(([, prefix]) => prefix === '/api/orders')[2];
  for (const action of ['claim', 'reassign', 'escalate', 'results', 'complete']) {
    assert.ok(orders.stack.some(([method, url]) => method === 'post' && url === `/:id/${action}`));
  }
});

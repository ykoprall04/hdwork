const express = require('express');
const { createServiceAuth } = require('./auth');
const { createRateLimit } = require('../middlewares/api-rate-limit');
function createCourierApp({ store, botId, key, now }) {
  const app = express(), verify = createServiceAuth({ botId, key, now });
  app.disable('x-powered-by');
  app.use(createRateLimit({ limit: 300, windowMs: 60000 }));
  app.use(express.raw({ type: 'application/json', limit: '64kb' }));
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try { verify(req); req.body = JSON.parse(req.body.toString('utf8')); next(); }
    catch (error) { res.status([401, 403].includes(error.statusCode) ? error.statusCode : 400).json({ ok: false, code: 'REQUEST_REJECTED' }); }
  });
  app.post('/internal/courier/v1/events', async (req, res) => res.json({ ok: true, ...await store.accept(req.body) }));
  app.post('/internal/courier/v1/outbox/claim', async (req, res) => res.json({ ok: true, messages: await store.claim(req.body.limit) }));
  app.post('/internal/courier/v1/outbox/:id/result', async (req, res) => res.json({ ok: true, ...await store.settle(req.params.id, req.body) }));
  app.use((_req, res) => res.status(404).json({ ok: false, code: 'NOT_FOUND' }));
  app.use((error, _req, res, _next) => res.status([400, 409, 503].includes(error.statusCode) ? error.statusCode : error.type === 'entity.too.large' ? 413 : 500).json({ ok: false, code: 'COURIER_REQUEST_FAILED' }));
  return app;
}
module.exports = { createCourierApp };

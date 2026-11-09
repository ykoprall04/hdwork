const express = require('express');
const { createServiceAuth } = require('./auth');
const { createRateLimit } = require('../middlewares/api-rate-limit');
const { fail } = require('./contract');

function createIntegrationApp({ store, runtime, policy, botId, key, receive = false, send = false, now,testingRead,onFailure }) {
  const app = express(), verify = createServiceAuth({ botId, key, now });
  app.disable('x-powered-by');
  app.use(createRateLimit({ limit: 300, windowMs: 60000 }));
  app.use(express.raw({ type: 'application/json', limit: '64kb' }));
  app.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
      const nonce = verify(req);
      await runtime.reserveNonce(nonce);
      req.body = JSON.parse(req.body.toString('utf8'));
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw fail();
      next();
    } catch (error) { next(error); }
  });
  for (const action of ['acquire', 'renew', 'release']) app.post('/internal/courier/v1/worker/' + action, async (req, res) => {
    res.json({ ok: true, ...await runtime.lease(action, req.body) });
  });
  if(testingRead)app.post('/internal/courier/v1/testing/order',async(req,res)=>res.json({ok:true,...await testingRead(req.body)}));
  app.post('/internal/courier/v1/events', async (req, res) => {
    if (!receive) throw fail(503);
    await runtime.assertWorker(req.body.worker);
    const payload = policy.ingress(req.body);
    // The ACK is emitted only after the inbox transaction has committed.
    res.json({ ok: true, ...await store.accept(payload) });
  });
  app.post('/internal/courier/v1/outbox/claim', async (req, res) => {
    if (!send) throw fail(503);
    if (req.body.limit !== 1) throw fail();
    const messages = await store.claim(1, {
      before: c => runtime.assertWorker(req.body.worker, c),
      authorize: (payload, c) => policy.outgoing(payload, c)
    });
    res.json({ ok: true, messages });
  });
  app.post('/internal/courier/v1/outbox/:id/result', async (req, res) => {
    if (!send) throw fail(503);
    await runtime.assertWorker(req.body.worker);
    res.json({ ok: true, ...await store.settle(req.params.id, req.body) });
  });
  app.use((_req, res) => res.status(404).json({ ok: false, code: 'NOT_FOUND' }));
  app.use((error, _req, res, _next) => {
    onFailure?.('LIVE_TEST_API_REJECTED');
    const status = error.type === 'entity.too.large' ? 413 : [400, 401, 403, 409, 429].includes(error.statusCode) ? error.statusCode : 503;
    res.status(status).json({ ok: false, code: 'COURIER_REQUEST_REJECTED' });
  });
  return app;
}
module.exports = { createIntegrationApp };

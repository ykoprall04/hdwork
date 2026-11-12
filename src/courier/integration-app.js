const express = require('express');
const { createServiceAuth } = require('./auth');
const { createRateLimit } = require('../middlewares/api-rate-limit');
const { fail } = require('./contract');

function createIntegrationApp({ store, runtime, policy, botId, key, receive = false, send = false, now,testingRead,onFailure,ready=()=>true }) {
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
  if(policy.configuration)app.post('/internal/courier/v1/routing',async(req,res)=>{await runtime.assertWorker(req.body.worker);res.json({ok:true,...await policy.configuration()});});
  if(testingRead)app.post('/internal/courier/v1/testing/order',async(req,res)=>res.json({ok:true,...await testingRead(req.body)}));
  app.post('/internal/courier/v1/events', async (req, res) => {
    if (!receive||!ready()) throw fail(503);
    await runtime.assertWorker(req.body.worker);
    const payload = await policy.ingress(req.body);
    // The ACK is emitted only after the inbox transaction has committed.
    res.json({ ok: true, ...await store.accept(payload) });
  });
  app.post('/internal/courier/v1/capabilities',async(req,res)=>{await runtime.assertWorker(req.body.worker);res.json({ok:true,delivery_protocol:store.fifo?'fifo-ack-v2':'legacy'});});
  app.post('/internal/courier/v1/outbox/claim', async (req, res) => {
    if (!send||!ready()) throw fail(503);
    if (req.body.limit !== 1) throw fail();
    if(req.body.delivery_protocol!==undefined&&(req.body.delivery_protocol!=='fifo-ack-v2'||!store.fifo))throw fail(409);
    const messages = await store.claim(1, {
      before: c => runtime.assertWorker(req.body.worker, c),
      authorize: (payload, c) => policy.outgoing(payload, c)
    });
    res.json({ ok: true, messages,...(store.fifo?{delivery_protocol:'fifo-ack-v2'}:{}) });
  });
  if(store.routeFence)app.post('/internal/courier/v1/outbox/:id/authorize',async(req,res)=>{if(!send||!ready())throw fail(503);if(typeof req.body.lease_token!=='string')throw fail();const allowed=await store.authorizeDelivery(req.params.id,req.body,{before:c=>runtime.assertWorker(req.body.worker,c),authorize:(payload,c)=>policy.outgoing(payload,c)});res.json({ok:true,allowed});});
  app.post('/internal/courier/v1/outbox/:id/result', async (req, res) => {
    if (!send||!ready()) throw fail(503);
    await runtime.assertWorker(req.body.worker);
    res.json({ ok: true, ...await store.settle(req.params.id, req.body) });
  });
  app.use((_req, res) => res.status(404).json({ ok: false, code: 'NOT_FOUND' }));
  app.use((error, _req, res, _next) => {
    require('../observability/raw-log').logger().emit('COURIER_API_FAILURE',{status:'ERROR'},error);
    onFailure?.('LIVE_TEST_API_REJECTED');
    const status = error.type === 'entity.too.large' ? 413 : [400, 401, 403, 409, 429].includes(error.statusCode) ? error.statusCode : 503;
    res.status(status).json({ ok: false, code: 'COURIER_REQUEST_REJECTED' });
  });
  return app;
}
module.exports = { createIntegrationApp };

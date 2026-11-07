const express = require('express');
const cors = require('cors');
const { createRateLimit } = require('./middlewares/api-rate-limit');
const { corsOptions } = require('./config/api-cors');
function createApiOnlyApp(env = process.env) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors(corsOptions(env)));
  app.post('/api/auth/login', createRateLimit({ limit: 10, windowMs: 15 * 60_000 }));
  app.get('/api/auth/me', createRateLimit({ limit: 120, windowMs: 60_000 }));
  app.use(express.json({ limit: '32kb' }));
  app.get('/health', (_req, res) => res.json({ ok: true, mode: 'api-only' }));
  app.use('/api/auth', require('./routes/auth.routes'));
  app.use('/api/b2c-staging/orders', createRateLimit({ limit: 120, windowMs: 60_000 }), require('./routes/b2c-staging.routes'));
  app.use((_req, res) => res.status(404).json({ success: false, message: 'Endpoint tidak tersedia pada API-only' }));
  app.use((error, _req, res, _next) => {
    const status = error.statusCode === 403 ? 403 : error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500;
    const message = { 403: 'Origin tidak diizinkan', 413: 'Ukuran permintaan terlalu besar', 400: 'Format permintaan tidak valid', 500: 'Permintaan tidak dapat diproses' }[status];
    return res.status(status).json({ success: false, message });
  });
  return app;
}
module.exports = { createApiOnlyApp };

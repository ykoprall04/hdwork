const express = require('express');
const cors = require('cors');
const { corsOptions } = require('./config/api-cors');
function createApiOnlyApp(env = process.env) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors(corsOptions(env)));
  app.use(express.json({ limit: '32kb' }));
  app.get('/health', (_req, res) => res.json({ ok: true, mode: 'api-only' }));
  app.use('/api/auth', require('./routes/auth.routes'));
  app.use('/api/b2c-staging/orders', require('./routes/b2c-staging.routes'));
  app.use((_req, res) => res.status(404).json({ success: false, message: 'Endpoint tidak tersedia pada API-only' }));
  app.use((error, _req, res, _next) => res.status(error.statusCode === 403 ? 403 : 500).json({ success: false, message: error.statusCode === 403 ? 'Origin tidak diizinkan' : 'Permintaan tidak dapat diproses' }));
  return app;
}
module.exports = { createApiOnlyApp };

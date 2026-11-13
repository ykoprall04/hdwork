const express = require('express');
const cors = require('cors');
const { createRateLimit } = require('./middlewares/api-rate-limit');
const { corsOptions } = require('./config/api-cors');
function apiError(error,_req,res,_next){
  const status=error.statusCode===403?403:error.type==='entity.too.large'?413:error.type==='entity.parse.failed'?400:500;
  const message={403:'Origin tidak diizinkan',413:'Ukuran permintaan terlalu besar',400:'Format permintaan tidak valid',500:'Permintaan tidak dapat diproses'}[status];
  return res.status(status).json({success:false,message});
}
function createApiOnlyApp(env = process.env,{readinessCheck}={}) {
  const app = express();
  const readiness=require('./config/readiness-probe').create({check:readinessCheck||(()=>require('./config/local-database-check').checkRuntimeDatabases())});
  app.disable('x-powered-by');
  if(env.HDWORK2_EDGE_AUTH_MODE==='application-session')app.use(require('./middlewares/application-session-boundary').applicationSessionBoundary);
  app.use(cors(corsOptions(env)));
  // The local launcher defaults to observation until production writes are approved.
  if (env.HDWORK2_SERVICE_AUTH_POLICY !== undefined || env.HDWORK2_LOCAL_READ_ONLY === 'true' || env.HDWORK2_AUTH_ONLY === 'true' || env.HDWORK2_AUTH_WRITE_ENABLED !== undefined) app.use(require('./config/auth-write-policy').authWritePolicy(env));
  app.post('/api/auth/login', createRateLimit({ limit: 10, windowMs: 15 * 60_000 }));
  app.get('/api/auth/me', createRateLimit({ limit: 120, windowMs: 60_000 }));
  app.use(express.json({ limit: '32kb' }));
  app.get('/health', (_req, res) => res.json({ ok: true, mode: 'api-only' }));
  app.get('/ready', createRateLimit({limit:10,windowMs:60000}), async (_req,res) => {
    res.set('Cache-Control','no-store');
    try { res.json(await readiness.probe()); }
    catch { res.status(503).json({ok:false,message:'Database/schema belum siap'}); }
  });
  app.use('/api/auth', (env.HDWORK2_AUTH_V2 === 'true' ? require('./access/routes') : require('./routes/auth.routes')));
  if(env.HDWORK2_AUTH_ONLY==='true'){
    app.use((_req,res)=>res.status(404).json({success:false,message:'Endpoint tidak tersedia pada validasi autentikasi'}));
    app.use(apiError);
    return app;
  }
  if(env.HDWORK2_AUTH_V2 === 'true') app.use('/api/admin/users', createRateLimit({limit:60,windowMs:60000}),require('./access/admin-routes'));
  app.use('/api/b2c-staging/orders', createRateLimit({ limit: 120, windowMs: 60_000 }), (env.HDWORK2_AUTH_V2 === 'true' ? (_req,res)=>res.status(503).json({success:false,message:'Staging tidak tersedia pada mode sesi baru'}) : require('./routes/b2c-staging.routes')));
  if(env.HDWORK2_OPERATIONS_ENABLED==='true')app.use('/api/operations',createRateLimit({limit:240,windowMs:60000}),require('./operations/routes'));
  app.use('/api/b2c/orders', createRateLimit({ limit: 120, windowMs: 60_000 }), require('./b2c-read/routes'));
  app.use((_req, res) => res.status(404).json({ success: false, message: 'Endpoint tidak tersedia pada API-only' }));
  app.use(apiError);
  return app;
}
module.exports = { createApiOnlyApp };

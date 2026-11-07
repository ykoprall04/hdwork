function corsOptions(env = process.env) {
  const origins = (env.FRONTEND_ORIGINS || env.FRONTEND_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!origins.length || origins.some(origin => { try { const url = new URL(origin); return !['http:', 'https:'].includes(url.protocol) || url.origin !== origin || Boolean(url.username || url.password); } catch { return true; } })) throw new Error('Konfigurasikan FRONTEND_ORIGINS sebagai daftar origin eksplisit');
  return {
    origin(origin, callback) {
      // CLI/health requests without Origin still require endpoint authentication.
      if (!origin || origins.includes(origin)) return callback(null, true);
      return callback(Object.assign(new Error('Origin tidak diizinkan'), { statusCode: 403 }));
    },
    methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type'], credentials: false, maxAge: 600,
  };
}
module.exports = { corsOptions };

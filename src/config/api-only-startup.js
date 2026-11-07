const { corsOptions } = require('./api-cors');
function invalid(field) { return Object.assign(new Error(`Konfigurasi API-only tidak valid: ${field}`), { statusCode: 503 }); }
function required(env, field) {
  if (typeof env[field] !== 'string' || !env[field].trim()) throw invalid(field);
  return env[field];
}
function port(value, field, fallback) {
  const text = value === undefined ? String(fallback) : value;
  if (typeof text !== 'string' || !/^[1-9]\d{0,4}$/.test(text) || Number(text) > 65535) throw invalid(field);
  return Number(text);
}
function stagingOptions(env) {
  if (env.B2C_STAGING_ENABLED !== 'true') throw invalid('B2C_STAGING_ENABLED');
  if (env.B2C_STAGING_DB_NAME !== undefined && env.B2C_STAGING_DB_NAME !== 'hd_b2c') throw invalid('B2C_STAGING_DB_NAME');
  const user = required(env, 'B2C_STAGING_DB_USER');
  if (user === env.DB_USER || ['root', 'mysql.sys', 'mysql.session'].includes(user.toLowerCase())) throw invalid('akun SELECT staging terpisah');
  return {
    host: required(env, 'B2C_STAGING_DB_HOST'),
    port: port(env.B2C_STAGING_DB_PORT, 'B2C_STAGING_DB_PORT', 3306),
    user, password: required(env, 'B2C_STAGING_DB_PASSWORD'), database: 'hd_b2c',
    connectionLimit: 2, connectTimeout: 5000, dateStrings: true,
    multipleStatements: false, supportBigNumbers: true, bigNumberStrings: true,
  };
}
function validateApiOnlyConfig(env = process.env) {
  if (env.DB_NAME !== 'hdwork2') throw invalid('DB_NAME harus hdwork2');
  for (const field of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET']) required(env, field);
  const listenPort = port(env.PORT, 'PORT', 3090);
  port(env.DB_PORT, 'DB_PORT', 3306);
  corsOptions(env);
  if (env.B2C_STAGING_ENABLED !== undefined && !['true', 'false'].includes(env.B2C_STAGING_ENABLED)) throw invalid('B2C_STAGING_ENABLED');
  const staging = env.B2C_STAGING_ENABLED === 'true' ? stagingOptions(env) : null;
  return { port: listenPort, database: 'hdwork2', staging };
}
module.exports = { validateApiOnlyConfig, stagingOptions };

let pool;
function getPool() {
  const env = process.env;
  if (env.B2C_STAGING_ENABLED !== 'true' || !['HOST', 'PORT', 'USER', 'PASSWORD'].every(key => env[`B2C_STAGING_DB_${key}`])) {
    throw Object.assign(new Error('Konfigurasi database staging belum lengkap'), { statusCode: 503 });
  }
  if (!pool) pool = require('mysql2/promise').createPool({
    host: env.B2C_STAGING_DB_HOST, port: Number(env.B2C_STAGING_DB_PORT),
    user: env.B2C_STAGING_DB_USER, password: env.B2C_STAGING_DB_PASSWORD,
    database: 'hd_b2c', connectionLimit: 2, connectTimeout: 5000,
    dateStrings: true, multipleStatements: false,
  });
  return pool;
}
module.exports = { getPool };

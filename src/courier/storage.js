function createStore(env = process.env) {
  if (env.COURIER_ENABLED !== 'true') throw Error('Courier disabled');
  if (env.COURIER_STORE === 'memory') return new (require('./memory-store').MemoryStore)({ botId: env.COURIER_BOT_ID });
  if (env.COURIER_STORE !== 'mysql' || env.COURIER_DB_NAME !== 'hdwork2' || !['HOST', 'USER', 'PASSWORD'].every(key => typeof env[`COURIER_DB_${key}`] === 'string' && env[`COURIER_DB_${key}`].trim()) || ['root', env.DB_USER, env.B2C_STAGING_DB_USER].includes(env.COURIER_DB_USER)) throw Error('Courier database configuration rejected');
  const port = env.COURIER_DB_PORT || '3306';
  if (!/^[1-9]\d{0,4}$/.test(port) || Number(port) > 65535) throw Error('Courier database configuration rejected');
  const pool = require('mysql2/promise').createPool({ host: env.COURIER_DB_HOST, port: Number(port), user: env.COURIER_DB_USER, password: env.COURIER_DB_PASSWORD, database: 'hdwork2', connectionLimit: 2, connectTimeout: 5000, multipleStatements: false, timezone: 'Z', supportBigNumbers: true, bigNumberStrings: true });
  return new (require('./mysql-store').MysqlStore)({ pool, botId: env.COURIER_BOT_ID,fifo:env.HDWORK2_COURIER_FIFO_ENABLED==='true' });
}
module.exports = { createStore };

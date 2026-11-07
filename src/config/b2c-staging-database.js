const { stagingOptions } = require('./api-only-startup');
let pool;
// Do not expose the raw pool/query API to staging consumers.
async function execute(sql, values) {
  const options = stagingOptions(process.env);
  if (typeof sql !== 'string' || !/^\s*SELECT\b/i.test(sql) || !/FROM\s+`hd_b2c`\.`sheet_import_test`\s+WHERE\b/i.test(sql)) {
    throw Object.assign(new Error('Query staging tidak diizinkan'), { statusCode: 503 });
  }
  if (!pool) pool = require('mysql2/promise').createPool(options);
  const connection = await pool.getConnection();
  try {
    await connection.query('START TRANSACTION READ ONLY');
    return await connection.execute(sql, values);
  } finally {
    try { await connection.rollback(); } finally { connection.release(); }
  }
}
const reader = Object.freeze({ execute });
function getPool() {
  // Disabled/malformed configuration must not load the driver or make a pool.
  stagingOptions(process.env);
  return reader;
}
module.exports = { getPool };

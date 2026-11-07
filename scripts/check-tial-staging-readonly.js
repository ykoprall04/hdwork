// Opt-in diagnostic only. No server/app/Telegram module is imported.
const { createTialReader } = require('../src/adapters/tial-staging');
async function check({ env = process.env, connect, output = console.log } = {}) {
  if (!['HOST', 'PORT', 'USER', 'PASSWORD'].every(key => env[`B2C_STAGING_DB_${key}`])) throw new Error('Konfigurasi SELECT staging belum lengkap');
  let connection;
  const read = createTialReader({
    execute: (sql, values) => connection.execute(sql, values),
    identityKey: env.B2C_STAGING_IDENTITY_KEY, datasetId: env.B2C_TIAL_DATASET_ID,
    stoKey: env.B2C_TIAL_STO_JSON_KEY, sourceBot: env.B2C_TIAL_SOURCE_BOT,
  });
  try {
    const create = connect || require('mysql2/promise').createConnection;
    connection = await create({ host: env.B2C_STAGING_DB_HOST, port: Number(env.B2C_STAGING_DB_PORT), user: env.B2C_STAGING_DB_USER, password: env.B2C_STAGING_DB_PASSWORD, database: 'hd_b2c', multipleStatements: false, supportBigNumbers: true, bigNumberStrings: true });
    await connection.query('START TRANSACTION READ ONLY');
    const result = await read({ module: 'TIAL', date: env.B2C_TIAL_CHECK_DATE || '', status: env.B2C_TIAL_CHECK_STATUS || '', sto: env.B2C_TIAL_CHECK_STO || '', q: env.B2C_TIAL_CHECK_SEARCH || '', limit: 3 });
    // Never output rows, references, IDs, credentials or raw errors.
    output(JSON.stringify({ ok: true, sampled: result.data.length, hasMore: result.hasMore, dateBasis: result.dateBasis, identityScope: result.identityScope, verified: result.data.filter(row => row.reference_verified).length }));
    return result.data.length;
  } finally {
    if (connection) { try { await connection.rollback(); } finally { await connection.end(); } }
  }
}
if (require.main === module) {
  if (process.argv[2] !== '--read-only-check') { console.error('Gunakan --read-only-check hanya setelah persetujuan akses database.'); process.exitCode = 1; }
  else check().catch(() => { console.error('Pemeriksaan gagal. Tinjau konfigurasi/schema secara lokal; detail sensitif tidak dicetak.'); process.exitCode = 1; });
}
module.exports = { check };

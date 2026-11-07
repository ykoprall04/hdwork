const { browserResult } = require('../adapters/staging-browser-dto');
const { createTialReader } = require('../adapters/tial-staging');
const { createStagingReader, validateQuery } = require('../adapters/b2c-staging');

async function list(req, res) {
  res.set('Cache-Control', 'no-store');
  // Cross-city staging has no confirmed scope fields yet. Fail closed for HD/admin.
  if (req.user?.role !== 'SUPER_ADMIN') return res.status(403).json({ success: false, message: 'Akses staging terbatas sampai pemetaan hak akses disetujui' });
  if (process.env.B2C_STAGING_ENABLED !== 'true') return res.status(503).json({ success: false, message: 'Integrasi staging belum diaktifkan' });
  try {
    const filter = validateQuery(req.query);
    if (filter.module === 'TIAL') {
      const read = createTialReader({
        execute: (sql, values) => require('../config/b2c-staging-database').getPool().execute(sql, values),
        identityKey: process.env.B2C_STAGING_IDENTITY_KEY,
        datasetId: process.env.B2C_TIAL_DATASET_ID,
        stoKey: process.env.B2C_TIAL_STO_JSON_KEY,
        sourceBot: process.env.B2C_TIAL_SOURCE_BOT,
      });
      return res.json({ success: true, ...browserResult(await read(req.query)) });
    }
    const columns = JSON.parse(process.env.B2C_STAGING_COLUMNS_JSON || '{}');
    if (!columns.payload) throw Object.assign(new Error('Kolom payload JSON staging belum dikonfigurasi'), { statusCode: 503 });
    const jsonFields = JSON.parse(process.env.B2C_STAGING_JSON_FIELDS || '{}');
    const telegramGroups = JSON.parse(process.env.B2C_STAGING_TELEGRAM_GROUPS || '{}');
    // Separate pool: never fall back to the operational DB credentials/pool.
    const pool = require('../config/b2c-staging-database').getPool();
    const read = createStagingReader({ execute: (sql, values) => pool.execute(sql, values), columns, jsonFields, telegramGroups, identityKey: process.env.B2C_STAGING_IDENTITY_KEY });
    return res.json({ success: true, ...browserResult(await read(req.query)) });
  } catch (error) {
    return res.status(error.statusCode || 503).json({ success: false, message: error.statusCode ? error.message : 'Staging belum siap atau kontrak schema tidak sesuai' });
  }
}
module.exports = { list };

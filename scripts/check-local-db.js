const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
async function main() {
  require('../src/config/api-only-startup').validateApiOnlyConfig();
  const pool = require('../src/config/database');
  try { console.log(JSON.stringify(await require('../src/config/local-database-check').checkDatabase(pool))); }
  finally { await pool.end(); }
}
main().catch(() => { console.error('Pemeriksaan DB gagal; periksa keberadaan kredensial privat, target dan izin/schema. Tidak ada data diubah.'); process.exitCode = 1; });

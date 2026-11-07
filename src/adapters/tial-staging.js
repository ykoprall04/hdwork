const { createHmac } = require('node:crypto');
const { validateQuery } = require('./b2c-staging');
const { normalizeTelegramReference } = require('./telegram-reference');
const fail = (message) => Object.assign(new Error(message), { statusCode: 503 });
function createTialReader({ execute, identityKey, datasetId, stoKey, sourceBot }) {
  if (typeof identityKey !== 'string' || Buffer.byteLength(identityKey) < 32 || typeof datasetId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(datasetId)) throw fail('Kunci dan namespace dataset TIAL belum siap');
  if (stoKey && (typeof stoKey !== 'string' || !/^[A-Za-z0-9_ /-]{1,100}$/.test(stoKey))) throw fail('Pemetaan STO TIAL tidak valid');
  const json = key => `JSON_UNQUOTE(JSON_EXTRACT(\`data_json\`, '$."${key}"'))`;
  const sc = json('SC/IN'), inet = json('NO INET/TELP'), status = json('STATUS');
  const sto = stoKey ? json(stoKey) : 'NULL';
  // Import date, not an invented order timestamp. Fixed UTC+07 without TZ tables.
  const date = "DATE_FORMAT(TIMESTAMPADD(SECOND, UNIX_TIMESTAMP(`created_at`) + 25200, '1970-01-01 00:00:00'), '%Y-%m-%d')";
  return async function read(query) {
    const filter = validateQuery({ ...query, module: query.module || 'TIAL' });
    if (filter.module !== 'TIAL') throw Object.assign(new Error('Reader khusus TIAL'), { statusCode: 400 });
    if (filter.sto && !stoKey) throw fail('Key JSON STO TIAL belum dikonfirmasi');
    const where = ['BINARY `sumber_tab` = BINARY ?'], values = ['Orders'];
    if (filter.date) { where.push(`${date} = ?`); values.push(filter.date); }
    if (filter.status) { where.push(`${status} = ?`); values.push(filter.status); }
    if (filter.sto) { where.push(`${sto} = ?`); values.push(filter.sto); }
    if (filter.q) { where.push(`(LOCATE(?, ${sc}) > 0 OR LOCATE(?, ${inet}) > 0)`); values.push(filter.q, filter.q); }
    const sql = `SELECT CAST(\`id\` AS CHAR) AS source_key, ${date} AS order_date, ${status} AS status, ${sto} AS sto, ${sc} AS sc_in, ${inet} AS inet, ${json('Message ID')} AS chat_reference FROM \`hd_b2c\`.\`sheet_import_test\` WHERE ${where.join(' AND ')} ORDER BY \`created_at\` DESC, \`id\` DESC LIMIT ? OFFSET ?`;
    const [rows] = await execute(sql, [...values, filter.limit + 1, (filter.page - 1) * filter.limit]);
    const data = rows.slice(0, filter.limit).map(row => {
      if (typeof row.source_key !== 'string' || !/^[1-9]\d*$/.test(row.source_key)) throw fail('ID baris staging TIAL tidak valid');
      return {
        id: `stg_${createHmac('sha256', identityKey).update(JSON.stringify([datasetId, 'Orders', row.source_key])).digest('hex')}`,
        identity_scope: 'staging_row', date_basis: 'import_created_at_jakarta',
        module: 'TIAL', date: row.order_date, status: row.status, sto: row.sto,
        scIn: row.sc_in, inet: row.inet,
        ...normalizeTelegramReference('TIAL', { 'Message ID': row.chat_reference }, { TIAL: { source_bot: sourceBot } }),
      };
    });
    if (new Set(data.map(row => row.id)).size !== data.length) throw fail('ID baris staging tidak unik');
    return { source: 'MYSQL_STAGING', readOnly: true, identityScope: 'staging_row', dateBasis: 'import_created_at_jakarta', stoFilterAvailable: Boolean(stoKey), data, page: filter.page, hasMore: rows.length > filter.limit };
  };
}
module.exports = { createTialReader };

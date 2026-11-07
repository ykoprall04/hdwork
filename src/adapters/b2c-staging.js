const { normalizeTelegramReference } = require('./telegram-reference');
const { createHmac } = require('node:crypto');
const SOURCES = Object.freeze({ TIAL: 'Orders', LOGIC_PSB: 'solver', LOGIC_MO: 'MO' });
const FIELDS = ['source', 'source_key', 'order_date', 'status', 'sto', 'sc_in', 'inet'];
function problem(message, statusCode = 400) { return Object.assign(new Error(message), { statusCode }); }
function identifier(value) {
  if (typeof value !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw problem('Konfigurasi kolom staging tidak valid', 503);
  return `\`${value}\``;
}
function validateQuery(query) {
  const module = query.module || 'TIAL';
  if (typeof module !== 'string' || !Object.hasOwn(SOURCES, module)) throw problem('Modul tidak valid');
  const date = query.date || '';
  if (typeof date !== 'string') throw problem('Tanggal tidak valid');
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw problem('Tanggal tidak valid');
  const text = (name, max) => {
    const value = query[name] || '';
    if (typeof value !== 'string' || value.length > max) throw problem(`Filter ${name} tidak valid`);
    return value.trim();
  };
  const page = Number(query.page || 1), limit = Number(query.limit || 25);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw problem('Pagination tidak valid');
  return { module, date, status: text('status', 64), sto: text('sto', 64), q: text('q', 100), page, limit };
}
function createStagingReader({ execute, columns, identityKey, jsonFields, telegramGroups = {} }) {
  if (typeof identityKey !== 'string' || Buffer.byteLength(identityKey) < 32) throw problem('Kunci identitas staging belum siap', 503);
  const jsonMode = Boolean(columns?.payload);
  const base = Object.fromEntries((jsonMode ? ['source', 'source_key', 'payload'] : FIELDS).map(field => [field, identifier(columns?.[field])]));
  function expressions(module) {
    if (!jsonMode) return base;
    const result = { ...base };
    for (const field of FIELDS.filter(name => !['source', 'source_key'].includes(name))) {
      const key = jsonFields?.[module]?.[field];
      // JSON key names only, no SQL/JSON path expressions supplied by config.
      if (typeof key !== 'string' || !/^[A-Za-z0-9_ /-]{1,100}$/.test(key)) throw problem('Pemetaan field JSON staging belum valid', 503);
      result[field] = `JSON_UNQUOTE(JSON_EXTRACT(${base.payload}, '$."${key}"'))`;
    }
    return result;
  }
  return async function read(query) {
    const filter = validateQuery(query);
    const c = expressions(filter.module);
    const where = [`BINARY ${c.source} = BINARY ?`], values = [SOURCES[filter.module]];
    if (filter.date) { where.push(`${c.order_date} = ?`); values.push(filter.date); }
    for (const field of ['status', 'sto']) if (filter[field]) { where.push(`${c[field]} = ?`); values.push(filter[field]); }
    if (filter.q) {
      where.push(`(LOCATE(?, ${c.sc_in}) > 0 OR LOCATE(?, ${c.inet}) > 0)`);
      values.push(filter.q, filter.q);
    }
    const select = FIELDS.map(field => `${c[field]} AS ${identifier(field)}`).join(', ') + (jsonMode ? `, ${base.payload} AS payload` : '');
    const [rows] = await execute(`SELECT ${select} FROM \`hd_b2c\`.\`sheet_import_test\` WHERE ${where.join(' AND ')} ORDER BY ${c.order_date} DESC, ${c.source_key} ASC LIMIT ? OFFSET ?`, [...values, filter.limit + 1, (filter.page - 1) * filter.limit]);
    const data = rows.slice(0, filter.limit).map(row => {
      if (row.source !== SOURCES[filter.module] || typeof row.source_key !== 'string' || !row.source_key.trim()) throw problem('Kontrak identitas staging belum valid', 503);
      let payload = row.payload || {};
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch { throw problem('Payload JSON staging tidak valid', 503); }
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw problem('Payload JSON staging tidak valid', 503);
      return {
        ...normalizeTelegramReference(filter.module, payload, telegramGroups),
        id: `stg_${createHmac('sha256', identityKey).update(JSON.stringify([row.source, row.source_key])).digest('hex')}`,
        module: filter.module, date: row.order_date, status: row.status, sto: row.sto,
        scIn: row.sc_in, inet: row.inet,
      };
    });
    if (new Set(data.map(row => row.id)).size !== data.length) throw problem('Identitas staging tidak unik', 503);
    return { source: 'MYSQL_STAGING', readOnly: true, data, page: filter.page, hasMore: rows.length > filter.limit };
  };
}
module.exports = { SOURCES, validateQuery, createStagingReader };

const reject = (statusCode = 400) => Object.assign(new Error('Read request rejected'), { statusCode });
const modules = ['TIAL', 'LOGIC_PSB', 'LOGIC_MO'];
const statuses = ['WAITING', 'IN_PROGRESS', 'DONE', 'FAILED', 'DUPLICATE', 'FINISHED'];
const actions = Object.freeze({ PICK: false, CEK: false, RECEK: false, DONE: false, GAGAL: false });
const uuid = value => { if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw reject(); return value; };
function integer(value, fallback, max) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d{0,3}$/.test(value) || Number(value) > max) throw reject();
  return Number(value);
}
function filters(query, history = false) {
  const allowed = history ? ['page','limit'] : ['module','date','status','sto','q','page','limit'];
  if (!query || Object.keys(query).some(key => !allowed.includes(key) || typeof query[key] !== 'string')) throw reject();
  const page = integer(query.page, 1, 1000), limit = integer(query.limit, 25, 50);
  if (history) return { page, limit };
  const module = query.module || 'TIAL', status = query.status || '', date = query.date || '', q = (query.q || '').trim();
  if (!modules.includes(module) || (status && !statuses.includes(status)) || (query.sto || '') !== '' || q.length > 100 || /[\x00-\x1f\x7f]/.test(query.q || '')) throw reject();
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date)) throw reject();
  return { page, limit, module, status, date, q };
}
const columns = "id,module,DATE_FORMAT(business_day,'%Y-%m-%d') AS date,status,sc_in,inet,duplicate_of,DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS received_at,DATE_FORMAT(started_at,'%Y-%m-%dT%H:%i:%sZ') AS started_at,DATE_FORMAT(finished_at,'%Y-%m-%dT%H:%i:%sZ') AS finished_at";
function orderDto(row) {
  const safeRef = value => typeof value === 'string' && /^[A-Z0-9][A-Z0-9/_-]{0,99}$/i.test(value) ? value : null;
  const inet = safeRef(row.inet);
  return { id: row.id, module: row.module, date: row.date, status: row.status, scIn: safeRef(row.sc_in), inetMasked: inet ? (inet.length > 4 ? `••••${inet.slice(-4)}` : '••••') : null, sto: null, duplicateOf: row.duplicate_of || null, receivedAt: row.received_at || null, startedAt: row.started_at || null, finishedAt: row.finished_at || null };
}
const metadata = { source: 'HDWORK2', readOnly: true, dateBasis: 'telegram_business_day_jakarta', stoFilterAvailable: false, actions };
function createOrderReader(pool) {
  async function read(run) {
    const c = await pool.getConnection();
    try { await c.query('SET TRANSACTION READ ONLY'); await c.beginTransaction(); const value = await run(c); await c.commit(); return value; }
    catch (error) { try { await c.rollback(); } catch { /* release below */ } throw error; }
    finally { c.release(); }
  }
  return {
    async list(query) {
      const f = filters(query), where = ['module=?'], values = [f.module];
      if (f.date) { where.push('business_day=?'); values.push(f.date); }
      if (f.status === 'FINISHED') where.push("status IN ('DONE','FAILED')");
      else if (f.status) { where.push('status=?'); values.push(f.status); }
      // Literal substring search: %, _ and = are escaped, never interpolated.
      if (f.q) { where.push("(sc_in LIKE ? ESCAPE '=' OR inet LIKE ? ESCAPE '=')"); const term = `%${f.q.replace(/[=%_]/g,'=$&')}%`; values.push(term,term); }
      return read(async c => {
        const [rows] = await c.execute(`SELECT ${columns} FROM hd2_orders WHERE ${where.join(' AND ')} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`, [...values,f.limit+1,(f.page-1)*f.limit]);
        return { ...metadata, data: rows.slice(0,f.limit).map(orderDto), page: f.page, pageSize: f.limit, hasMore: rows.length > f.limit };
      });
    },
    async detail(id) {
      uuid(id);
      return read(async c => {
        const [[row]] = await c.execute(`SELECT ${columns} FROM hd2_orders WHERE id=? LIMIT 1`,[id]);
        if (!row) throw reject(404);
        return { ...metadata, data: orderDto(row) };
      });
    },
    async history(id, query) {
      uuid(id); const f = filters(query,true);
      return read(async c => {
        const [[order]] = await c.execute('SELECT id FROM hd2_orders WHERE id=? LIMIT 1',[id]);
        if (!order) throw reject(404);
        const [rows] = await c.execute("SELECT id,action,from_status,to_status,DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS at FROM hd2_audit WHERE order_id=? AND action IN ('ORDER_RECEIVED','DUPLICATE_ORDER_RECORDED','STATUS_CHANGED') ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",[id,f.limit+1,(f.page-1)*f.limit]);
        return { ...metadata, data: rows.slice(0,f.limit).map(row=>({id:row.id,action:row.action,fromStatus:row.from_status || null,toStatus:row.to_status || null,at:row.at})), page:f.page,pageSize:f.limit,hasMore:rows.length>f.limit };
      });
    }
  };
}
module.exports = { createOrderReader, filters, uuid, actions };

const { randomBytes, randomUUID } = require('node:crypto');
const { digest } = require('../access/service');
const { modules } = require('./modules');
const { fail, uuid, hash } = require('./policy');

function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(k => !['requestId', 'module', 'reference', 'description'].includes(k))) throw fail();
  uuid(input.requestId);
  if (!modules.includes(input.module)) throw fail();
  for (const [key, max] of [['reference', 100], ['description', 4000]]) {
    if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input[key])) throw fail();
  }
  return { ...input, reference: input.reference.trim(), description: input.description.trim() };
}

async function create(pool, token, userId, body) {
  const input = validate(body), payloadHash = hash(input);
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    // Account is read-only. The unique user/request key arbitrates retry races;
    // a losing transaction rolls back its new order and can retry the request.
    const [[user]] = await c.execute('SELECT id,name,role,is_active FROM users WHERE id=? FOR SHARE', [userId]);
    if (!user || ![1, true].includes(user.is_active) || !['SUPER_ADMIN', 'ADMIN', 'HD'].includes(user.role)) throw fail(403);
    const [[session]] = await c.execute('SELECT token_hash FROM hd2_sessions WHERE token_hash=? AND user_id=? AND revoked=FALSE AND expires_at>UTC_TIMESTAMP(3) FOR SHARE', [digest(token), userId]);
    if (!session) throw fail(401);
    if (user.role !== 'SUPER_ADMIN') {
      const [grants] = await c.execute('SELECT module FROM hd2_user_modules WHERE user_id=? FOR SHARE', [userId]);
      if (!grants.some(g => g.module === input.module)) throw fail(403);
    }
    const [[previous]] = await c.execute('SELECT payload_hash,result FROM hd2_web_requests WHERE user_id=? AND request_id=?', [userId, input.requestId]);
    if (previous) {
      if (previous.payload_hash !== payloadHash || !previous.result) throw fail(409);
      await c.commit();
      return typeof previous.result === 'string' ? JSON.parse(previous.result) : previous.result;
    }
    const id = randomUUID();
    await c.execute("INSERT INTO hd2_orders(id,bot_id,module,business_day,chat_id,message_id,status,sc_in,command,command_fields,raw_text,telegram_timestamp) VALUES (?,'web-local',?,DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 HOUR)),'web',?,'WAITING',?,NULL,?,?,UNIX_TIMESTAMP())", [id, input.module, randomBytes(9).toString('hex'), input.reference, JSON.stringify({ description: input.description }), input.description]);
    await c.execute("INSERT INTO hd2_audit(id,inbox_id,order_id,action,user_id,from_status,to_status,detail) VALUES (?,NULL,?,'WEB_ORDER_CREATED',?,NULL,'WAITING',?)", [randomUUID(), id, userId, JSON.stringify({ actorName: user.name })]);
    await c.execute("INSERT INTO hd2_live_events(module,kind) VALUES (?,'arrival')", [input.module]);
    const result = { success: true, id, version: 0, status: 'WAITING' };
    await c.execute('INSERT INTO hd2_web_requests(user_id,request_id,order_id,payload_hash,result) VALUES (?,?,?,?,?)', [userId, input.requestId, id, payloadHash, JSON.stringify(result)]);
    await c.commit();
    return result;
  } catch (error) { await c.rollback();if(['ER_DUP_ENTRY','ER_LOCK_DEADLOCK'].includes(error.code))throw fail(409,'Permintaan bersamaan; ulangi dengan requestId yang sama');throw error; }
  finally { c.release(); }
}
module.exports = { create, validate };

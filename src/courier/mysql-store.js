const { randomUUID } = require('node:crypto');
const { eventEnvelope, outbound, digest, fail, messageId } = require('./contract');
const json = value => typeof value === 'string' ? JSON.parse(value) : value;
const backoff = attempt => Math.min(60000, 2000 * 2 ** (attempt - 1));
class MysqlStore {
  constructor({ pool, botId, now = Date.now, maxAttempts = 5, orderedInbox = false }) {
    this.pool = pool; this.botId = botId; this.now = now; this.maxAttempts = maxAttempts;
    this.orderedInbox = orderedInbox;
  }
  async transaction(run) {
    const connection = await this.pool.getConnection();
    try { await connection.beginTransaction(); const result = await run(connection); await connection.commit(); return result; }
    catch (error) { try { await connection.rollback(); } catch { /* release still required */ } throw error; }
    finally { connection.release(); }
  }
  async accept(body) {
    const payload = eventEnvelope(body, this.botId), hash = digest(payload), id = randomUUID();
    return this.transaction(async c => {
      await c.execute('INSERT INTO hd2_courier_inbox (id,bot_id,update_id,payload_hash,payload,due_ms) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id', [id, this.botId, payload.update_id, hash, JSON.stringify(payload), this.now()]);
      const [[row]] = await c.execute('SELECT id,payload_hash FROM hd2_courier_inbox WHERE bot_id=? AND update_id=? FOR UPDATE', [this.botId, payload.update_id]);
      if (!row || row.payload_hash !== hash) throw fail(409);
      return { receipt_id: row.id, duplicate: row.id !== id };
    });
  }
  async enqueueOn(c, key, body) {
    if (typeof key !== 'string' || !/^[\x21-\x7e]{1,200}$/.test(key)) throw fail();
    const payload = outbound(body), hash = digest(payload), id = randomUUID();
    await c.execute('INSERT INTO hd2_courier_outbox (id,bot_id,idem_key,payload_hash,payload,due_ms) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id', [id, this.botId, key, hash, JSON.stringify(payload), this.now()]);
    const [[row]] = await c.execute('SELECT id,payload_hash FROM hd2_courier_outbox WHERE bot_id=? AND idem_key=? FOR UPDATE', [this.botId, key]);
    if (!row || row.payload_hash !== hash) throw fail(409);
    return row.id;
  }
  enqueue(key, body) { return this.transaction(c => this.enqueueOn(c, key, body)); }
  async claim(limit = 1, options = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw fail();
    return this.transaction(async c => {
      if (options.before) await options.before(c);
      const now = this.now();
      const [expired] = await c.execute("SELECT id,attempts FROM hd2_courier_outbox WHERE bot_id=? AND state='SENDING' AND lease_until_ms<=? ORDER BY lease_until_ms,id LIMIT 100 FOR UPDATE SKIP LOCKED", [this.botId, now]);
      for (const row of expired) await c.execute('UPDATE hd2_courier_outbox SET state=?,due_ms=?,last_error_code=? WHERE id=? AND bot_id=?', [row.attempts >= this.maxAttempts ? 'DEAD' : 'QUEUED', now + backoff(row.attempts), 'LEASE_EXPIRED', row.id, this.botId]);
      const [rows] = await c.execute("SELECT id,payload,attempts FROM hd2_courier_outbox WHERE bot_id=? AND state='QUEUED' AND due_ms<=? AND attempts<? ORDER BY due_ms,id LIMIT ? FOR UPDATE SKIP LOCKED", [this.botId, now, this.maxAttempts, limit]);
      const messages = [];
      for (const row of rows) {
        if (options.authorize && !await options.authorize(json(row.payload), c)) {
          await c.execute('UPDATE hd2_courier_outbox SET state=?,due_ms=?,last_error_code=? WHERE id=? AND bot_id=?', ['DEAD', now, 'BAD_REQUEST', row.id, this.botId]);
          continue;
        }
        const lease = randomUUID();
        await c.execute("UPDATE hd2_courier_outbox SET state='SENDING',attempts=attempts+1,lease_token=?,lease_until_ms=? WHERE id=? AND bot_id=?", [lease, now + 60000, row.id, this.botId]);
        messages.push({ delivery_id: row.id, lease_token: lease, attempt: row.attempts + 1, payload: json(row.payload) });
      }
      return messages;
    });
  }
  async settle(id, body) {
    if (!body || typeof body.lease_token !== 'string' || !['sent', 'retry', 'failed'].includes(body.result)) throw fail();
    const ack = { lease_token: body.lease_token, result: body.result, telegram_message_id: body.result === 'sent' ? messageId(body.telegram_message_id) : null, error_code: body.result === 'sent' ? null : body.error_code, retry_after: body.retry_after ?? 0 };
    if (!['NETWORK', 'RATE_LIMIT', 'FORBIDDEN', 'BAD_REQUEST', 'UNKNOWN', null].includes(ack.error_code) || !Number.isInteger(ack.retry_after) || ack.retry_after < 0 || ack.retry_after > 300) throw fail();
    const hash = digest(ack);
    return this.transaction(async c => {
      const [[row]] = await c.execute('SELECT * FROM hd2_courier_outbox WHERE id=? AND bot_id=? FOR UPDATE', [id, this.botId]);
      if (!row) throw fail(409);
      if (row.last_ack_token === body.lease_token) { if (row.last_ack_hash !== hash) throw fail(409); return { duplicate: true }; }
      if (row.state !== 'SENDING' || row.lease_token !== body.lease_token || Number(row.lease_until_ms) <= this.now()) throw fail(409);
      const state = body.result === 'sent' ? 'SENT' : body.result === 'failed' || row.attempts >= this.maxAttempts ? 'DEAD' : 'QUEUED';
      await c.execute('UPDATE hd2_courier_outbox SET state=?,due_ms=?,last_ack_token=?,last_ack_hash=?,telegram_message_id=?,last_error_code=? WHERE id=? AND bot_id=?', [state, this.now() + Math.max(ack.retry_after * 1000, backoff(row.attempts)), body.lease_token, hash, ack.telegram_message_id, ack.error_code, id, this.botId]);
      return { duplicate: false };
    });
  }
  async processNext(handler) {
    let selected;
    try {
      return await this.transaction(async c => {
        const [[row]] = this.orderedInbox
          ? await c.execute("SELECT id,payload,attempts,due_ms FROM hd2_courier_inbox WHERE bot_id=? AND state='PENDING' ORDER BY received_seq LIMIT 1 FOR UPDATE", [this.botId])
          : await c.execute("SELECT id,payload,attempts FROM hd2_courier_inbox WHERE bot_id=? AND state='PENDING' AND due_ms<=? ORDER BY due_ms,id LIMIT 1 FOR UPDATE SKIP LOCKED", [this.botId, this.now()]);
        if (!row) return false;
        if (this.orderedInbox && Number(row.due_ms) > this.now()) return false;
        selected = row.id;
        const result = await handler(json(row.payload), { connection: c, inboxId: row.id, enqueue: (key, payload) => this.enqueueOn(c, key, payload) });
        const state = result?.disposition === 'IGNORED' ? 'IGNORED' : 'PROCESSED';
        await c.execute('UPDATE hd2_courier_inbox SET state=?,attempts=attempts+1,processed_at=UTC_TIMESTAMP(3) WHERE id=? AND bot_id=?', [state, row.id, this.botId]);
        return true;
      });
    } catch {
      if (selected) await this.transaction(async c => {
        const [[row]] = await c.execute('SELECT state,attempts FROM hd2_courier_inbox WHERE id=? AND bot_id=? FOR UPDATE', [selected, this.botId]);
        if (row?.state === 'PENDING') await c.execute('UPDATE hd2_courier_inbox SET attempts=?,state=?,due_ms=?,last_error_code=? WHERE id=? AND bot_id=?', [row.attempts + 1, row.attempts + 1 >= this.maxAttempts ? 'DEAD' : 'PENDING', this.now() + backoff(row.attempts + 1), 'HANDLER_FAILED', selected, this.botId]);
      });
      throw fail(503);
    }
  }
}
module.exports = { MysqlStore };

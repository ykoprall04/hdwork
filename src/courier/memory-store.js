const { randomUUID } = require('node:crypto');
const { eventEnvelope, outbound, digest, fail, messageId } = require('./contract');
class MemoryStore {
  constructor({ botId, now = Date.now, maxEntries = 10000, maxAttempts = 5 } = {}) {
    this.botId = botId; this.now = now; this.maxEntries = maxEntries; this.maxAttempts = maxAttempts;
    this.inbox = new Map(); this.outbox = new Map(); this.keys = new Map();
  }
  accept(body) {
    const event = eventEnvelope(body, this.botId), key = event.update_id, hash = digest(event), existing = this.inbox.get(key);
    if (existing) { if (existing.hash !== hash) throw fail(409); return { receipt_id: existing.id, duplicate: true }; }
    if (this.inbox.size >= this.maxEntries) throw fail(503);
    const record = { id: randomUUID(), hash, event }; this.inbox.set(key, record);
    return { receipt_id: record.id, duplicate: false };
  }
  // Server-only seam. Not mounted as an HTTP route and not triggered by ingestion.
  enqueue(key, payload) {
    if (typeof key !== 'string' || !key || key.length > 200) throw fail();
    const message = outbound(payload), hash = digest(message), existing = this.keys.get(key);
    if (existing) { if (existing.hash !== hash) throw fail(409); return existing.id; }
    if (this.outbox.size >= this.maxEntries) throw fail(503);
    const id = randomUUID(); this.outbox.set(id, { id, message, status: 'queued', attempts: 0, due: this.now(), lease: null, until: 0, ack: null });
    this.keys.set(key, { id, hash }); return id;
  }
  retry(record, delay = 0) {
    record.status = record.attempts >= this.maxAttempts ? 'dead' : 'queued';
    record.due = this.now() + Math.max(delay, Math.min(60000, 2000 * 2 ** (record.attempts - 1)));
  }
  claim(limit = 1) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw fail();
    const messages = [];
    for (const record of this.outbox.values()) {
      if (record.status === 'sending' && record.until <= this.now()) { record.status='dead'; record.last_error_code='LEASE_EXPIRED'; }
      if (messages.length >= limit || record.status !== 'queued' || record.due > this.now()) continue;
      record.attempts++; record.status = 'sending'; record.lease = randomUUID(); record.until = this.now() + 60000;
      messages.push({ delivery_id: record.id, lease_token: record.lease, attempt: record.attempts, payload: record.message });
    }
    return messages;
  }
  settle(id, body) {
    const record = this.outbox.get(id);
    if (!record || !body || typeof body.lease_token !== 'string' || !['sent', 'retry', 'failed'].includes(body.result)) throw fail(409);
    const ack = { lease_token: body.lease_token, result: body.result, telegram_message_id: body.result === 'sent' ? messageId(body.telegram_message_id) : null, error_code: body.result === 'sent' ? null : body.error_code, retry_after: body.retry_after ?? 0 };
    if (!['NETWORK', 'RATE_LIMIT', 'FORBIDDEN', 'BAD_REQUEST', 'UNKNOWN', 'ECONNRESET', 'ETIMEDOUT', null].includes(ack.error_code) || !Number.isInteger(ack.retry_after) || ack.retry_after < 0 || ack.retry_after > 300) throw fail();
    const hash = digest(ack);
    if (record.ack?.lease === body.lease_token) { if (record.ack.hash !== hash) throw fail(409); return { duplicate: true }; }
    if (record.status !== 'sending' || record.lease !== body.lease_token || record.until <= this.now()) throw fail(409);
    record.ack = { lease: body.lease_token, hash };
    if (body.result === 'sent') { record.status = 'sent'; record.telegram_message_id = ack.telegram_message_id; }
    else { record.last_error_code=ack.error_code; const state=require('./delivery-state').settlementState(body.result,ack.error_code,record.attempts,this.maxAttempts); if(state==='QUEUED')this.retry(record,ack.retry_after*1000);else record.status='dead'; }
    return { duplicate: false };
  }
}
module.exports = { MemoryStore };

const { randomUUID } = require('node:crypto');
const { fail } = require('./contract');
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const LEASE_MS = 60000;

class RuntimeStore {
  constructor(store) { this.store = store; this.lastCleanup = 0; }
  async reserveNonce({ nonce, expiresMs }) {
    if (!/^[a-f0-9]{32}$/.test(nonce) || !Number.isSafeInteger(expiresMs)) throw fail(401);
    await this.store.transaction(async c => {
      const [result] = await c.execute('INSERT IGNORE INTO hd2_courier_nonces(bot_id,nonce,expires_ms) VALUES (?,?,?)', [this.store.botId, nonce, expiresMs]);
      if (result.affectedRows !== 1) throw fail(401);
      if (this.store.now() - this.lastCleanup > 60000) {
        await c.execute('DELETE FROM hd2_courier_nonces WHERE expires_ms<? LIMIT 1000', [this.store.now()]);
        this.lastCleanup = this.store.now();
      }
    });
  }
  async lease(action, body) {
    if (!body || !uuid(body.worker_id) || !['acquire', 'renew', 'release'].includes(action) ||
        Object.keys(body).some(k => !['worker_id', 'lease_token'].includes(k)) ||
        (action !== 'acquire' && !uuid(body.lease_token))) throw fail();
    return this.store.transaction(async c => {
      const now = this.store.now(), token = randomUUID();
      if (action === 'acquire') await c.execute(
        'INSERT INTO hd2_courier_workers(bot_id,worker_id,lease_token,expires_ms) VALUES (?,?,?,0) ON DUPLICATE KEY UPDATE bot_id=bot_id',
        [this.store.botId, body.worker_id, token]
      );
      const [[row]] = await c.execute('SELECT worker_id,lease_token,expires_ms FROM hd2_courier_workers WHERE bot_id=? FOR UPDATE', [this.store.botId]);
      if (!row || (action === 'acquire' ? Number(row.expires_ms) > now :
          row.worker_id !== body.worker_id || row.lease_token !== body.lease_token || Number(row.expires_ms) <= now)) throw fail(409);
      const expires = action === 'release' ? 0 : now + LEASE_MS;
      const leaseToken = action === 'acquire' ? token : row.lease_token;
      await c.execute('UPDATE hd2_courier_workers SET worker_id=?,lease_token=?,expires_ms=? WHERE bot_id=?', [body.worker_id, leaseToken, expires, this.store.botId]);
      return { lease_token: leaseToken, lease_ms: action === 'release' ? 0 : LEASE_MS };
    });
  }
  async assertWorker(body, connection) {
    if (!body || !uuid(body.id) || !uuid(body.lease_token) || Object.keys(body).some(k => !['id', 'lease_token'].includes(k))) throw fail(409);
    const [[row]] = await (connection || this.store.pool).execute('SELECT worker_id,lease_token,expires_ms FROM hd2_courier_workers WHERE bot_id=?' + (connection ? ' FOR SHARE' : ''), [this.store.botId]);
    if (!row || row.worker_id !== body.id || row.lease_token !== body.lease_token || Number(row.expires_ms) <= this.store.now()) throw fail(409);
  }
}
module.exports = { RuntimeStore, LEASE_MS };

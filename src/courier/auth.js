const { createHash, createHmac, timingSafeEqual } = require('node:crypto');
const { fail } = require('./contract');
function createServiceAuth({ botId, key, now = Date.now }) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(botId || '') || typeof key !== 'string' || Buffer.byteLength(key) < 32) throw fail(503);
  const used = new Map();
  return req => {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress) || req.headers.origin) throw fail(403);
    const time = req.headers['x-courier-time'], nonce = req.headers['x-courier-nonce'], signature = req.headers['x-courier-signature'];
    if (req.headers['x-courier-id'] !== botId || typeof time !== 'string' || !/^\d{10,12}$/.test(time) || Math.abs(now() / 1000 - Number(time)) > 60 || typeof nonce !== 'string' || !/^[a-f0-9]{32}$/.test(nonce) || typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) throw fail(401);
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const message = [botId, time, nonce, req.method, req.originalUrl, createHash('sha256').update(body).digest('hex')].join('\n');
    const expected = createHmac('sha256', key).update(message).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw fail(401);
    for (const [n, expires] of used) if (expires < now()) used.delete(n);
    if (used.has(nonce) || used.size >= 10000) throw fail(401);
    used.set(nonce, now() + 120000);
    return { nonce, expiresMs: now() + 120000 };
  };
}
module.exports = { createServiceAuth };

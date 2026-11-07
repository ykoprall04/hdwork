// Single-process, bounded fixed-window limiter. No proxy headers are trusted.
function createRateLimit({ limit, windowMs, maxKeys = 10000, now = Date.now, keyFor = req => req.socket?.remoteAddress || 'unknown' }) {
  const buckets = new Map();
  return (req, res, next) => {
    const time = now();
    for (const [key, bucket] of buckets) if (bucket.reset <= time) buckets.delete(key);
    const key = keyFor(req);
    let bucket = buckets.get(key);
    const reject = reset => {
      res.set('Retry-After', String(Math.max(1, Math.ceil((reset - time) / 1000))));
      res.set('Cache-Control', 'no-store');
      return res.status(429).json({ success: false, message: 'Terlalu banyak permintaan; coba kembali nanti' });
    };
    if (!bucket) {
      if (buckets.size >= maxKeys) return reject(time + windowMs);
      bucket = { count: 0, reset: time + windowMs }; buckets.set(key, bucket);
    }
    if (bucket.count >= limit) return reject(bucket.reset);
    bucket.count++; next();
  };
}
module.exports = { createRateLimit };

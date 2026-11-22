const { filters, where, fail } = require('./policy');

const dayMs = 86400000;
const hourMs = 3600000;
const jakartaOffset = 7 * hourMs;
const categories = {
  TIAL: ['order', 'req'],
  LOGIC: ['mo', 'config_psb']
};
const dateKey = ms => new Date(ms).toISOString().slice(0, 10);

function windowFor(period, date) {
  const start = new Date(date + 'T00:00:00Z');
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(+start) || dateKey(+start) !== date) throw fail();
  if (period === 'daily') return { start: +start, end: +start + dayMs, step: hourMs };
  if (period === 'weekly') {
    start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
    return { start: +start, end: +start + 7 * dayMs, step: dayMs };
  }
  if (period !== 'monthly') throw fail();
  start.setUTCDate(1);
  const end = new Date(+start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start: +start, end: +end, step: dayMs };
}

function chartSelection(query) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) throw fail();
  if (Object.keys(query).some(key => !['area', 'period', 'date'].includes(key) || typeof query[key] !== 'string')) throw fail();
  const { area = 'ALL', period = 'weekly', date = dateKey(Date.now() + jakartaOffset) } = query;
  if (!['ALL', 'TIAL', 'LOGIC'].includes(area)) throw fail();
  const { start, end, step } = windowFor(period, date);
  const commands = area === 'ALL' ? [...categories.TIAL, ...categories.LOGIC] : categories[area];
  return { area, period, start, end, step, commands };
}

async function recapChart(pool, query, user) {
  const { area, start, end, step, commands } = chartSelection(query);
  const from = dateKey(start), to = dateKey(end - dayMs);
  const filter = filters({ area: area === 'ALL' ? 'B2C' : area, from, to }, user, { recap: true });
  const scope = where(filter, user, { recap: true });
  const startSeconds = (start - jakartaOffset) / 1000;
  const endSeconds = (end - jakartaOffset) / 1000;
  const buckets = Array.from({ length: (end - start) / step }, (_, index) => ({
    start: new Date(start + index * step - jakartaOffset).toISOString(),
    count: 0,
    counts: commands.map(() => 0)
  }));
  const distribution = commands.map(command => ({ command, count: 0 }));
  if (filter.allowed.length) {
    const [rows] = await pool.execute(
      `SELECT FLOOR((o.telegram_timestamp - ?) / ?) AS bucket, o.command, COUNT(*) AS count
       FROM hd2_orders o WHERE ${scope.sql}
       AND o.telegram_timestamp >= ? AND o.telegram_timestamp < ?
       AND o.command IN (${commands.map(() => '?').join(',')})
       GROUP BY bucket, o.command`,
      [startSeconds, step / 1000, ...scope.values, startSeconds, endSeconds, ...commands]
    );
    for (const row of rows) {
      const count = Number(row.count);
      const bucket = buckets[Number(row.bucket)];
      const index = commands.indexOf(row.command);
      bucket.count += count;
      bucket.counts[index] += count;
      distribution[index].count += count;
    }
  }
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const peak = total ? buckets.reduce((best, bucket, index) => bucket.count > buckets[best].count ? index : best, 0) : null;
  const low = total ? buckets.reduce((best, bucket, index) => bucket.count < buckets[best].count ? index : best, 0) : null;
  return { from, to, total, average: total / buckets.length, peak, low, buckets, distribution };
}

module.exports = { recapChart, chartSelection };

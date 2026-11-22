const test = require('node:test');
const assert = require('node:assert/strict');
const { recapChart } = require('../src/operations/recap-chart');

const user = { modules: ['TIAL', 'REQ', 'LOGIC_MO', 'LOGIC_PSB', 'B2B'] };

test('weekly chart uses scoped parameters, Jakarta bounds, and one shared aggregate', async () => {
  const pool = { execute: async (sql, params) => {
    assert.match(sql, /o\.access_module IN \(\?,\?,\?,\?\)/);
    assert.match(sql, /o\.business_day BETWEEN \? AND \?/);
    assert.match(sql, /o\.command IN \(\?,\?,\?,\?\)/);
    assert.match(sql, /GROUP BY bucket, o\.command/);
    const start = Date.parse('2026-11-15T17:00:00Z') / 1000;
    assert.deepEqual(params, [start, 86400, 'TIAL', 'REQ', 'LOGIC_MO', 'LOGIC_PSB',
      '2026-11-16', '2026-11-22', start, start + 7 * 86400, 'order', 'req', 'mo', 'config_psb']);
    return [[{ bucket: '0', command: 'order', count: '2' },
      { bucket: '0', command: 'req', count: '1' }, { bucket: '6', command: 'mo', count: '4' }]];
  } };
  const result = await recapChart(pool, { date: '2026-11-22' }, user);
  assert.deepEqual(result.buckets.map(row => row.count), [3, 0, 0, 0, 0, 0, 4]);
  assert.deepEqual(result.distribution.map(row => row.count), [2, 1, 4, 0]);
  assert.equal(result.total, 7);
  assert.equal(result.average, 1);
  assert.equal(result.peak, 6);
  assert.equal(result.low, 1);
});

test('daily and leap-month windows include empty buckets and respect inaccessible modules', async () => {
  const pool = { execute: async () => assert.fail('No SQL for a user without matching modules') };
  const daily = await recapChart(pool, { area: 'TIAL', period: 'daily', date: '2024-02-29' }, { modules: ['B2B'] });
  assert.equal(daily.buckets.length, 24);
  assert.equal(daily.buckets.at(-1).start, '2024-02-29T16:00:00.000Z');
  assert.equal(daily.peak, null);
  assert.equal(daily.low, null);
  assert.deepEqual(daily.distribution.map(row => row.command), ['order', 'req']);
  const monthly = await recapChart(pool, { area: 'LOGIC', period: 'monthly', date: '2024-02-29' }, { modules: ['B2B'] });
  assert.equal(monthly.buckets.length, 29);
  assert.equal(monthly.from, '2024-02-01');
  assert.equal(monthly.to, '2024-02-29');
  assert.deepEqual(monthly.distribution.map(row => row.command), ['mo', 'config_psb']);
});

test('invalid filters are rejected before any query', async () => {
  for (const query of [{ area: 'B2B' }, { period: 'yearly' }, { date: '2026-02-30' }, { date: ['2026-11-22'] }, { hd: '2' }]) {
    await assert.rejects(recapChart(null, query, user), { statusCode: 400 });
  }
});

test('Excel contains exactly the displayed command counts, WIB buckets, and totals in each scope', async () => {
  const { chartWorkbook } = require('../src/operations/recap-chart-export');
  const Excel = require('exceljs');
  const cases = [
    ['ALL', 'weekly', ['order', 'req', 'mo', 'config_psb'], '2026-11-16', '2026-11-22', 7],
    ['TIAL', 'daily', ['order', 'req'], '2026-11-22 00:00', '2026-11-22 23:00', 24],
    ['LOGIC', 'monthly', ['mo', 'config_psb'], '2026-11-01', '2026-11-30', 30]
  ];
  for (const [area, period, commands, first, last, length] of cases) {
    const selection = { area, period, date: '2026-11-22' };
    const pool = { execute: async () => [commands.flatMap((command, index) => [
      { command, bucket: 0, count: index + 2 },
      { command, bucket: length - 1, count: index + 6 }
    ])] };
    const chart = await recapChart(pool, selection, user);
    const counts = chart.buckets.map(bucket => bucket.counts);
    const workbook = new Excel.Workbook();
    await workbook.xlsx.load(await chartWorkbook({ ...selection, counts }, { role: 'HD' }));
    const sheet = workbook.getWorksheet('Data Grafik');
    assert.deepEqual(sheet.getRow(1).values.slice(1), ['Waktu (WIB)', ...commands.map(command => '/' + command), 'Total Order']);
    assert.equal(sheet.getRow(2).getCell(1).value, first);
    assert.equal(sheet.getRow(length + 1).getCell(1).value, last);
    chart.buckets.forEach(({ count, counts }, index) => assert.deepEqual(sheet.getRow(index + 2).values.slice(2), [...counts, count]));
    assert.deepEqual(sheet.getRow(length + 2).values.slice(1), ['Total', ...chart.distribution.map(row => row.count), chart.total]);
    assert.equal(sheet.rowCount, length + 2);
    assert.deepEqual(sheet.getImages(), []);
  }
});

test('Excel rejects invalid snapshots and view-only requests', async () => {
  const { chartWorkbook } = require('../src/operations/recap-chart-export');
  const selection = { area: 'LOGIC', period: 'weekly', date: '2026-11-22' };
  for (const counts of [[], Array.from({length: 7}, () => [1, -1]), Array.from({length: 7}, () => [1, '=1+1'])]) {
    await assert.rejects(chartWorkbook({ ...selection, counts }, { role: 'HD' }), { statusCode: 400 });
  }
  await assert.rejects(chartWorkbook(selection, { role: 'SHOW_ONLY' }), { statusCode: 403 });
});

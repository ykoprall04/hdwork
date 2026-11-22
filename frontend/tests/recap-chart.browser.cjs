const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { recapChart } = require('../../src/operations/recap-chart');
const { chartWorkbook } = require('../../src/operations/recap-chart-export');
const Excel = require('exceljs');

async function run() {
  const base = process.env.HD_PREVIEW_URL || 'http://127.0.0.1:5197';
  const browser = await chromium.launch({ executablePath: process.env.HD_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(7000);
    const chartRequests = [], chunks = [], errors = [];
    const user = { id: 2, name: 'HD Test', username: 'synthetic', role: 'HD', city_id: null, modules: ['TIAL', 'REQ', 'LOGIC_MO', 'LOGIC_PSB'] };
    await page.addInitScript(() => {
      sessionStorage.setItem('hdwork:operational:checkin:2', 'ONLINE');
      window.EventSource = class extends EventTarget { close() {} };
    });
    page.on('pageerror', error => errors.push(error.message));
    let failChart = false;
    let shownChart;
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(base).origin) return route.abort();
      if (url.pathname.includes('/assets/RecapChart-')) chunks.push(url.pathname);
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const json = data => route.fulfill({ json: data });
      if (url.pathname === '/api/auth/me') return json({ success: true, data: user, csrf: 'a'.repeat(64) });
      if (url.pathname === '/api/operations/people') return json({ data: [], hasMore: false });
      if (url.pathname === '/api/operations/recap') return json({ data: { total: 8, waiting: 2, process: 1, done: 4, failed: 1, averageDurationSeconds: 60 } });
      if (url.pathname === '/api/operations/recap/chart/export') {
        assert.equal(route.request().headers()['x-csrf-token'], 'a'.repeat(64));
        const payload = route.request().postDataJSON();
        assert.deepEqual(payload, { ...chartRequests.at(-1), counts: shownChart.buckets.map(bucket => bucket.counts) });
        return route.fulfill({
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body: await chartWorkbook(payload, user)
        });
      }
      if (url.pathname === '/api/operations/recap/chart') {
        const query = Object.fromEntries(url.searchParams);
        chartRequests.push(query);
        if (failChart) return route.fulfill({ status: 503, json: { message: 'Grafik sementara tidak tersedia.' } });
        const pool = { execute: async (_sql, params) => {
          const counts = { order: 18, req: 9, mo: 12, config_psb: 6 };
          return [params.slice(query.area === 'ALL' ? -4 : -2).flatMap((command, index) => [
            { bucket: index, command, count: counts[command] },
            { bucket: index + 1, command, count: Math.floor(counts[command] / 2) },
            { bucket: (index + 4) % 7, command, count: Math.floor(counts[command] * 1.25) }
          ])];
        } };
        shownChart = await recapChart(pool, query, user);
        return json(shownChart);
      }
      return route.fulfill({ status: 404, json: {} });
    });
    await page.goto(base + '/recap');
    await page.getByRole('heading', { name: 'Ringkasan order' }).waitFor();
    assert.equal(chartRequests.length, 0);
    assert.equal(chunks.length, 0);
    await page.getByLabel('Modul rekap').selectOption('TIAL');
    await page.getByRole('button', { name: 'Grafik', exact: true }).click();
    const chart = page.getByRole('region', { name: 'Grafik order masuk' });
    const trend = chart.getByRole('article').filter({ hasText: 'Tren Order Masuk' });
    const distribution = chart.getByRole('article').filter({ hasText: 'Distribusi Jenis Order' });
    await distribution.getByText('/config_psb', { exact: true }).waitFor();
    assert.equal(chartRequests[0].area, 'ALL');
    assert.equal(chartRequests[0].period, 'weekly');
    assert.equal(chunks.length, 1);
    assert.equal(await trend.getByRole('button').count(), 7);
    await trend.getByRole('button').nth(1).focus();
    assert.match(await trend.getByRole('status').innerText(), /18 order/);
    assert.equal(await trend.getByRole('tooltip').innerText(), '18 order');
    if (process.env.HD_RECAP_CAPTURE_DIR) await page.screenshot({ path: process.env.HD_RECAP_CAPTURE_DIR + '/desktop.png', fullPage: true });

    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await trend.getByRole('button').nth(1).locator('span').evaluate(dot => getComputedStyle(dot).transitionDuration), '0s');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await trend.getByRole('button').nth(1).blur();
    if (process.env.HD_RECAP_CAPTURE_DIR) await page.screenshot({ path: process.env.HD_RECAP_CAPTURE_DIR + '/mobile.png', fullPage: true });
    await chart.getByLabel('Modul grafik', { exact: true }).selectOption('LOGIC');
    await distribution.getByText('/mo', { exact: true }).waitFor();
    assert.equal(await distribution.getByRole('listitem').count(), 2);
    await chart.getByRole('button', { name: 'Harian' }).click();
    await trend.getByRole('button', { name: /^23\.00 WIB:/ }).waitFor();
    assert.equal(await trend.getByRole('button').count(), 24);
    await chart.getByRole('button', { name: 'Bulanan' }).click();
    await distribution.getByText('/config_psb', { exact: true }).waitFor();
    assert.ok((await trend.getByRole('button').count()) >= 28);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

    const downloadEvent = page.waitForEvent('download');
    await chart.getByRole('button', { name: 'Export Excel' }).click();
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(), 'hdwork-grafik.xlsx');
    const workbook = new Excel.Workbook();
    await workbook.xlsx.readFile(await download.path());
    const sheet = workbook.getWorksheet('Data Grafik');
    assert.deepEqual(sheet.getRow(1).values.slice(1), ['Waktu (WIB)', '/mo', '/config_psb', 'Total Order']);
    assert.equal(sheet.getRow(sheet.rowCount).getCell(4).value, shownChart.total);

    failChart = true;
    await chart.getByRole('button', { name: 'Periode sebelumnya' }).click();
    await chart.getByRole('alert').waitFor();
    failChart = false;
    await chart.getByRole('button', { name: 'Coba lagi' }).click();
    await distribution.getByText('/mo', { exact: true }).waitFor();
    await chart.getByRole('button', { name: 'Periode berikutnya' }).click();
    await distribution.getByText('/mo', { exact: true }).waitFor();
    assert.equal(chartRequests.at(-1).date.slice(0, 7), chartRequests[0].date.slice(0, 7));
    await page.getByRole('button', { name: 'Rekap Order' }).click();
    assert.equal(await page.getByLabel('Modul rekap').inputValue(), 'TIAL');
    assert.equal(await page.getByRole('button', { name: 'Export Excel' }).isVisible(), true);
    assert.deepEqual(errors, []);
    console.log('PASS: Grafik lazy load, desktop/mobile, module and period filters, tooltip, retry, and preserved Rekap selection.');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });

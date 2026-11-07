const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { list } = require('./b2c-orders.helpers.cjs');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HD_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext(); const page = await context.newPage(); page.setDefaultTimeout(10000);
    const calls = { me: 0, staging: 0 }; let pending = null, defer = false, stagingStatus = 200, meStatus = 200;
    const data = () => ({ ...list(1,1),hasMore:false });
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    await context.addInitScript(() => { localStorage.setItem('hdwork:operational:auth:v1', 'dummy'); sessionStorage.setItem('hdwork:operational:checkin:1', 'ONLINE'); });
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      assert.equal(route.request().method(), 'GET');
      if (path === '/api/auth/me') { calls.me++; return route.fulfill({ status: meStatus, headers, json: { success: meStatus === 200, data: { id: 1, name: 'Dummy', username: 'dummy', role: 'SUPER_ADMIN', city_id: null } } }); }
      assert.equal(path, '/api/b2c/orders'); calls.staging++;
      if (defer) { pending = route; return; }
      return route.fulfill({ status: stagingStatus, headers, json: stagingStatus === 200 ? data() : { message: 'Mock unavailable' } });
    });
    const base = process.env.HD_PREVIEW_URL || 'http://127.0.0.1:5173';
    await page.clock.install(); await page.goto(base + '/work/B2C/TIAL'); await page.clock.runFor(500);
    await page.locator('tbody tr').waitFor();
    assert.equal(calls.me, 1); assert.equal(calls.staging, 1);
    await page.evaluate(() => { window.__oldRow = document.querySelector('tbody tr'); });
    defer = true; await page.clock.runFor(61_000); await page.waitForFunction(() => document.body.innerText.includes('Memperbarui order TIAL'));
    assert.ok(pending); assert.equal(await page.locator('tbody tr').count(), 1);
    assert.equal(await page.evaluate(() => document.querySelector('tbody tr') === window.__oldRow), true);
    await pending.fulfill({ headers, json: data() }); pending = null; defer = false;
    await page.getByText('Memperbarui order TIAL… data terakhir tetap ditampilkan.').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.querySelector('tbody tr') === window.__oldRow), true);
    const before = calls.staging; await page.getByLabel('Cari order', { exact: true }).fill('   '); await page.clock.runFor(1000);
    assert.equal(calls.staging, before);
    stagingStatus = 503; await page.clock.runFor(61_000); await page.getByRole('alert').filter({ hasText: 'Layanan order hdwork2 belum tersedia.' }).waitFor();
    assert.equal(await page.locator('tbody tr').count(), 1); assert.ok((await page.locator('main').innerText()).includes('Data terakhir belum berhasil diperbarui'));
    stagingStatus = 403; await page.getByRole('button', { name: 'Coba lagi', exact: true }).click(); await page.clock.runFor(500);
    await page.getByText('Data tidak diganti DEMO.', { exact: false }).waitFor(); assert.equal(await page.locator('tbody tr').count(), 0);
    meStatus = 403; await page.clock.runFor(61_000); await page.waitForURL('**/login');
    console.log(`PASS: one initial me/staging request, no duplicate whitespace-filter request, stable row during/after refresh, stale 503 labelled, 403 data removal, session revocation unchanged. Counts: ${JSON.stringify(calls)}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

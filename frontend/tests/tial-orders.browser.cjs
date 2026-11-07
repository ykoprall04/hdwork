const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HD_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const directory = '/tmp/hdwork-tial-orders'; fs.mkdirSync(directory, { recursive: true });
  try {
    const context = await browser.newContext(); const page = await context.newPage(); page.setDefaultTimeout(10000);
    const calls = [], errors = []; let failure = false, empty = false, stoAvailable = true;
    page.on('pageerror', error => errors.push(error.message));
    await context.addInitScript(() => { localStorage.setItem('hdwork:operational:auth:v1', 'dummy'); sessionStorage.setItem('hdwork:operational:checkin:1', 'ONLINE'); });
    await context.route('**/api/**', route => {
      const request = route.request(), url = new URL(request.url());
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      assert.equal(request.method(), 'GET');
      if (url.pathname === '/api/auth/me') return route.fulfill({ headers, json: { success: true, data: { id: 1, name: 'Petugas Uji', username: 'dummy', role: 'SUPER_ADMIN', city_id: null } } });
      assert.equal(url.pathname, '/api/b2c-staging/orders');
      assert.equal(request.headers().authorization, 'Bearer dummy'); calls.push(Object.fromEntries(url.searchParams));
      if (failure) return route.fulfill({ status: 503, headers, json: { message: 'Staging belum diaktifkan' } });
      const current = Number(url.searchParams.get('page'));
      return route.fulfill({ headers, json: { success: true, source: 'MYSQL_STAGING', readOnly: true, identityScope: 'staging_row', dateBasis: 'import_created_at_jakarta', stoFilterAvailable: stoAvailable, data: empty ? [] : [1, 2].map(index => ({ id: `stg_synthetic_${current}_${index}`, module: 'TIAL', date: url.searchParams.get('date') || '2026-11-07', status: 'STATUS-SUMBER', sto: 'STO-SYNTHETIC', scIn: 'SC-SYNTHETIC', inet: 'INET-SYNTHETIC', reference_syntax_valid: true, reference_complete: true, reference_verified: false })), page: current, hasMore: current === 1 } });
    });
    await page.clock.install();
    const base = process.env.HD_PREVIEW_URL || 'http://127.0.0.1:5173';
    await page.goto(base + '/work/B2C/TIAL');
    await page.getByRole('heading', { name: 'Daftar order TIAL', exact: true, level: 1 }).waitFor();
    // Advance debounce without waiting 60 real seconds in refresh tests.
    await page.clock.runFor(500); await page.getByRole('row').filter({ hasText: 'stg_synthetic_1_1' }).waitFor();
    for (const tab of ['MENUNGGU', 'PROSES CEK', 'SELESAI', 'DUPLICATE']) assert.equal(await page.getByRole('button', { name: `${tab}Belum tersedia`, exact: true }).isDisabled(), true);
    assert.equal(await page.locator('tbody tr').count(), 2); // same SC/IN remains two orders
    assert.ok((await page.locator('main').innerText()).includes('bukan tanggal order asli'));
    assert.equal(await page.getByRole('button', { name: /^PICK$|^CEK$|^RECEK$|^DONE$|^GAGAL$/ }).count(), 0);
    await page.getByRole('button', { name: 'Berikutnya', exact: true }).click(); await page.clock.runFor(500);
    await page.getByText('stg_synthetic_2_1…').waitFor();
    assert.equal(calls.at(-1).page, '2'); assert.equal(await page.getByRole('button', { name: 'Berikutnya', exact: true }).isDisabled(), true);
    const before = calls.length; await page.clock.runFor(61_000); await page.getByText('stg_synthetic_2_1…').waitFor();
    assert.ok(calls.length > before); assert.equal(calls.at(-1).page, '2');
    await page.getByLabel('Status order', { exact: true }).fill('STATUS-SUMBER');
    await page.getByLabel('STO', { exact: true }).fill('STO-SYNTHETIC');
    await page.getByLabel('Cari order', { exact: true }).fill('SC-SYNTHETIC');
    await page.getByLabel('Tanggal impor', { exact: true }).fill('2026-11-06');
    await page.clock.runFor(500); await page.getByText('stg_synthetic_1_1…').waitFor();
    assert.deepEqual(calls.at(-1), { module: 'TIAL', date: '2026-11-06', status: 'STATUS-SUMBER', sto: 'STO-SYNTHETIC', q: 'SC-SYNTHETIC', page: '1' });
    for (const [name, size] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
      await page.setViewportSize(size); await page.evaluate(() => { document.activeElement?.blur(); document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }); await page.clock.runFor(500); assert.equal(await page.evaluate(() => scrollY), 0); await page.screenshot({ path: `${directory}/${name}-operational.png`, fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    failure = true; await page.clock.runFor(61_000); await page.getByRole('alert').filter({ hasText: 'Staging belum diaktifkan' }).waitFor();
    assert.equal(await page.locator('tbody tr').count(), 0); assert.ok((await page.locator('main').innerText()).includes('Data tidak diganti DEMO'));
    failure = false; empty = true; await page.getByRole('button', { name: 'Coba lagi', exact: true }).click(); await page.clock.runFor(500); await page.getByText('Tidak ada order TIAL sesuai filter sumber.').waitFor();
    empty = false; stoAvailable = false; await page.getByRole('button', { name: 'Reset filter' }).click(); await page.clock.runFor(500);
    await page.getByText('stg_synthetic_1_1…').waitFor(); assert.equal(await page.getByLabel('STO', { exact: true }).isDisabled(), true);
    await page.getByRole('link', { name: 'Alat diagnostik staging' }).click(); await page.getByRole('heading', { name: 'Pratinjau integrasi order B2C' }).waitFor();
    assert.equal(await page.evaluate(() => Object.keys(localStorage).some(key => /^hdwork:(workspace|session|account):/.test(key))), false);
    assert.deepEqual(errors, []);
    const demoContext = await browser.newContext(); const demo = await demoContext.newPage();
    await demoContext.route('**/api/**', () => assert.fail('DEMO must remain independent'));
    await demo.goto(base + '/preview/login'); await demo.getByRole('button', { name: 'Petugas HD', exact: true }).click(); await demo.getByRole('button', { name: 'Lanjutkan ke Pilih Pekerjaan' }).click();
    await demo.goto(base + '/preview/work/B2C/TIAL'); await demo.getByRole('heading', { name: 'Daftar order TIAL', exact: true, level: 1 }).waitFor();
    for (const [name, size] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) { await demo.setViewportSize(size); await demo.screenshot({ path: `${directory}/${name}-preview.png`, fullPage: true }); }
    console.log(`PASS: TIAL JWT/source filters, retained tabs, duplicate rows, pagination, timed refresh, errors/empty/disabled STO, diagnostics and paired desktop/mobile screenshots. ${directory}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

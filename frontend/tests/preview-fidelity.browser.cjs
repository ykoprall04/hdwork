const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HD_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const output = '/tmp/hdwork-fidelity'; fs.mkdirSync(output, { recursive: true });
  try {
    const operational = await browser.newContext(), demo = await browser.newContext();
    const op = await operational.newPage(), preview = await demo.newPage();
    const errors = [], calls = [];
    for (const page of [op, preview]) { page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message)); }
    await operational.route('**/api/**', route => {
      const url = new URL(route.request().url()); calls.push(url.pathname);
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
      assert.equal(url.pathname, '/api/auth/me');
      return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { success: true, data: { id: 1, name: 'Petugas Uji', username: 'dummy', role: 'SUPER_ADMIN', city_id: null } } });
    });
    await demo.route('**/api/**', () => assert.fail('DEMO must not request operational data'));
    const base = process.env.HD_PREVIEW_URL || 'http://127.0.0.1:5173';
    await op.goto(base + '/login'); await preview.goto(base + '/preview/login');
    for (const [name, size] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
      await op.setViewportSize(size); await preview.setViewportSize(size);
      await op.screenshot({ path: `${output}/${name}-login-operational.png`, fullPage: true });
      await preview.screenshot({ path: `${output}/${name}-login-preview.png`, fullPage: true });
    }
    await op.evaluate(() => localStorage.setItem('hdwork:operational:auth:v1', 'dummy'));
    await op.goto(base + '/jobs'); await op.waitForURL('**/check-in');
    await preview.getByRole('button', { name: 'Petugas HD', exact: true }).click(); await preview.waitForURL('**/preview/check-in');
    for (const [name, size] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
      await op.setViewportSize(size); await preview.setViewportSize(size);
      for (const [label, page] of [['operational', op], ['preview', preview]]) await page.screenshot({ path: `${output}/${name}-checkin-${label}.png`, fullPage: true });
    }
    await op.getByRole('button', { name: 'Lanjutkan ke Pilih Pekerjaan' }).click(); await preview.getByRole('button', { name: 'Lanjutkan ke Pilih Pekerjaan' }).click();
    const pairs = [['jobs', '/jobs', '/preview/jobs'], ['b2c', '/work/B2C', '/preview/work/B2C'], ['logic', '/work/B2C/LOGIC', '/preview/work/B2C/LOGIC'], ['my-work', '/my-work', '/preview/my-work'], ['transfers', '/transfers', '/preview/transfers'], ['productivity', '/productivity', '/preview/productivity']];
    for (const [name, size] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
      await op.setViewportSize(size); await preview.setViewportSize(size);
      for (const [section, opPath, demoPath] of pairs) {
        await op.goto(base + opPath); await preview.goto(base + demoPath);
        await op.locator('main h1').waitFor(); await preview.locator('main h1').waitFor();
        for (const [label, page] of [['operational', op], ['preview', preview]]) await page.screenshot({ path: `${output}/${name}-${section}-${label}.png`, fullPage: true });
        assert.equal(await op.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        if (section === 'jobs') {
          const columns = async page => page.locator('main > div.grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
          assert.equal(await columns(op), await columns(preview)); assert.equal(await columns(op), name === 'desktop' ? 2 : 1);
        }
        if (section === 'b2c') {
          assert.equal(await op.locator('main').getByText('Ringkasan TIAL', { exact: true }).count(), 1);
          assert.equal(await op.locator('main').getByText('Ringkasan LOGIC', { exact: true }).count(), 1);
          assert.equal(await op.getByRole('navigation', { name: 'Navigasi operasional' }).getByRole('link', { name: 'LOGIC', exact: true }).count(), 1);
          assert.ok((await op.locator('main').innerText()).includes('Belum tersedia'));
        }
      }
      for (const page of [op, preview]) { const button = page.getByRole('button', { name: 'Gunakan mode malam' }); if (await button.count()) await button.click(); assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true); }
      for (const [label, page] of [['operational', op], ['preview', preview]]) await page.screenshot({ path: `${output}/${name}-dark-${label}.png`, fullPage: true });
      for (const page of [op, preview]) await page.getByRole('button', { name: 'Gunakan mode pagi' }).click();
    }
    await op.goto(base + '/work/B2C'); await op.getByLabel('Status kerja', { exact: true }).selectOption('SIBUK');
    assert.ok((await op.locator('header').first().innerText()).includes('belum tersinkronisasi'));
    assert.equal(calls.every(url => url === '/api/auth/me'), true);
    assert.equal(await op.evaluate(() => Object.keys(localStorage).some(key => /^hdwork:(workspace|session|account):/.test(key))), false);
    assert.deepEqual(errors, []);
    console.log(`PASS: paired desktop/mobile screenshots, shared two-column job grid, check-in flow, horizontal TIAL/LOGIC navigation, unavailable statistics, Light/Dark, local status without writes and DEMO isolation. ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

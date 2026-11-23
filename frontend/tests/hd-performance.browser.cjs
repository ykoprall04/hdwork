const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { performance } = require('../../src/operations/hd-performance');

async function run() {
  const base = process.env.HD_PREVIEW_URL || 'http://127.0.0.1:5199';
  const browser = await chromium.launch({ executablePath: process.env.HD_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(7000);
    const requests = [], changes = [], errors = [];
    const user = {
      id: 2, name: 'Penguji', username: 'synthetic', role: 'SUPER_ADMIN',
      city_id: null, modules: ['TIAL', 'REQ', 'LOGIC_MO', 'LOGIC_PSB']
    };
    const commands = ['order', 'config_psb', 'mo', 'req'];
    const names = ['Andi','Arif','Bagus','Budi','Dika','Fajar','Ilham','Rian','Rizky','Wahyu'];
    let version = 0, weights = Object.fromEntries(commands.map(command => [command, { done: 1, failed: 1 }]));
    let failLoad = false, failSave = false;
    await page.addInitScript(() => {
      sessionStorage.setItem('hdwork:operational:checkin:2', 'ONLINE');
      window.EventSource = class extends EventTarget { close() {} };
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(base).origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const json = (data, status = 200) => route.fulfill({ json: data, status });
      if (url.pathname === '/api/auth/me') return json({ success: true, data: user, csrf: 'a'.repeat(64) });
      if (url.pathname === '/api/operations/people') return json({ data: [], hasMore: false });
      if (url.pathname === '/api/operations/recap') return json({ data: { total: 4, durationCount: 1, waiting: 1, process: 1, done: 1, failed: 1, averageDurationSeconds: 60 } });
      if (url.pathname === '/api/operations/recap/performance/weights') {
        assert.equal(route.request().headers()['x-csrf-token'], 'a'.repeat(64));
        const body = route.request().postDataJSON();
        if (failSave) return json({ message: 'Penyimpanan fixture gagal.' }, 409);
        assert.equal(body.version, Array(4).fill(version).join(':'));
        changes.push(body);
        weights = body.weights;
        version++;
        return json({ success: true });
      }
      if (url.pathname === '/api/operations/recap/performance') {
        const query = Object.fromEntries(url.searchParams);
        requests.push(query);
        if (failLoad) return json({ message: 'Data fixture belum tersedia.' }, 503);
        const connection = {
          query: async () => {}, beginTransaction: async () => {}, commit: async () => {}, release() {},
          execute: async (sql, params) => {
            if (sql.includes('hd2_performance_weights')) return [commands.map(command => ({
              command, done_weight: weights[command].done, failed_weight: weights[command].failed, version
            }))];
            if (sql.includes('FROM users')) return [names.map((name, index) => ({ id: index + 10, name }))];
            if (sql.includes('SELECT DISTINCT YEAR')) return [[{ year: 2026 }, { year: 2025 }]];
            const selected = commands.filter(command => params.includes(command));
            return [names.slice(0, -1).flatMap((_, index) => selected.flatMap((command, ci) => [
              { id: index + 10, command, status: 'DONE', count: 1 + ((index + ci * 3) % 10) },
              { id: index + 10, command, status: 'FAILED', count: (index + ci) % 4 },
            ]))];
          }
        };
        return json(await performance({ getConnection: async () => connection }, query, user));
      }
      return json({}, 404);
    });

    await page.goto(base + '/recap');
    await page.getByRole('heading', { name: 'Ringkasan order' }).waitFor();
    assert.equal(requests.length, 0);
    await page.getByRole('button', { name: 'Performansi HD' }).click();
    const tab = page.getByRole('region', { name: 'Performansi HD' });
    const summary = tab.locator('dl');
    const detail = tab.getByLabel('Pilih HD atau ALL');
    await tab.getByText('Belum ada HD dipilih', { exact: true }).waitFor();
    assert.equal(await detail.inputValue(), '');
    assert.equal(await tab.getByRole('img').count(), 0);
    assert.equal(await tab.getByRole('button', { name: /poin$/ }).count(), 10);
    await tab.getByRole('button', { name: 'Wahyu, 0 poin' }).focus();
    await tab.getByRole('status').getByText('Wahyu · 0 poin', { exact: true }).waitFor();
    assert.equal(requests[0].area, 'ALL');
    assert.equal(requests[0].period, 'weekly');
    await detail.selectOption('10');
    await tab.getByRole('heading', { name: 'Andi', exact: true }).waitFor();
    assert.equal(await tab.getByRole('img').count(), 8);
    await detail.selectOption('ALL');
    const table = tab.getByRole('table').last();
    assert.equal(await table.getByRole('row').count(), 11);
    assert.match(await table.getByRole('row').nth(1).innerText(), /Andi/);
    await detail.selectOption('');
    if (process.env.HD_PERFORMANCE_CAPTURE_DIR) await page.screenshot({ path: process.env.HD_PERFORMANCE_CAPTURE_DIR + '/desktop.png', fullPage: true });

    await tab.getByLabel('Modul performansi').selectOption('LOGIC');
    await tab.getByLabel('Tahun').selectOption('2025');
    await tab.getByLabel('Bulan').selectOption('2');
    await tab.getByRole('button', { name: 'Harian' }).click();
    await tab.getByLabel('Tanggal WIB').fill('2025-02-17');
    await page.waitForFunction(() => !!document.querySelector('[aria-label="Pilih HD atau ALL"]'));
    assert.deepEqual(requests.at(-1), { area: 'LOGIC', period: 'daily', date: '2025-02-17' });
    await detail.selectOption('10');
    assert.equal(await tab.getByRole('img').count(), 4);
    await tab.getByRole('button', { name: 'Mingguan' }).click();
    await tab.getByLabel('Minggu WIB').selectOption({ index: 2 });
    await detail.waitFor();
    assert.equal(requests.at(-1).period, 'weekly');
    assert.equal(requests.at(-1).date, '2025-02-10');
    await tab.getByRole('button', { name: 'Bulanan' }).click();
    await detail.waitFor();
    assert.equal(requests.at(-1).period, 'monthly');

    const initial = await summary.innerText();
    await tab.getByLabel('Bobot DONE /mo').fill('2.5');
    failSave = true;
    await tab.getByRole('button', { name: 'Simpan Bobot' }).click();
    await tab.getByRole('alert').getByText('Penyimpanan fixture gagal.').waitFor();
    assert.equal(await summary.innerText(), initial);
    failSave = false;
    await tab.getByRole('button', { name: 'Simpan Bobot' }).click();
    await page.waitForFunction(() => !document.querySelector('[aria-label="Bobot DONE /mo"]')?.disabled);
    await detail.waitFor();
    assert.equal(changes.length, 1);
    assert.equal(await tab.getByLabel('Bobot DONE /mo').inputValue(), '2.5');
    assert.notEqual(await summary.innerText(), initial);

    await page.setViewportSize({ width: 360, height: 800 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await tab.getByRole('button', { name: /poin$/ }).first().isVisible());
    await detail.selectOption('');
    if (process.env.HD_PERFORMANCE_CAPTURE_DIR) await page.screenshot({ path: process.env.HD_PERFORMANCE_CAPTURE_DIR + '/mobile.png', fullPage: true });
    failLoad = true;
    await tab.getByRole('button', { name: 'Harian' }).click();
    await tab.getByRole('alert').getByText('Data fixture belum tersedia.').waitFor();
    failLoad = false;
    await tab.getByRole('button', { name: 'Coba lagi' }).click();
    await detail.waitFor();

    await page.getByRole('button', { name: 'Rekap Order' }).click();
    assert.equal(await page.getByRole('button', { name: 'Export Excel' }).isVisible(), true);
    user.role = 'ADMIN';
    await page.reload();
    await page.getByRole('button', { name: 'Performansi HD' }).click();
    await tab.getByRole('heading', { name: 'Pengaturan Bobot' }).waitFor();
    await tab.getByLabel('Bobot DONE /mo').fill('3');
    const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/operations/recap/performance');
    await tab.getByRole('button', { name: 'Simpan Bobot' }).click();
    await refreshed;
    await detail.waitFor();
    await page.waitForFunction(() => document.querySelector('[aria-label="Bobot DONE /mo"]')?.value === '3' &&
      !!Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Simpan Bobot' && button.disabled));
    assert.equal(changes.length, 2);

    user.role = 'HD';
    await page.reload();
    await page.getByRole('button', { name: 'Performansi HD' }).click();
    await detail.waitFor();
    assert.equal(await tab.getByRole('heading', { name: 'Pengaturan Bobot' }).count(), 0);
    assert.equal(await tab.getByRole('button', { name: 'Simpan Bobot' }).count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: Performansi HD desktop/mobile, filters, stacked chart, empty and detail states, save/refresh, Admin/Super Admin writes and hidden settings for HD.');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });

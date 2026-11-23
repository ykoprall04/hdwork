const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function run() {
  const base = process.env.HD_PREVIEW_URL || 'http://127.0.0.1:5201';
  const browser = await chromium.launch({ executablePath: process.env.HD_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, colorScheme: 'light' });
    page.setDefaultTimeout(8000);
    const errors = [], unexpected = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('hdwork:operational:checkin:2')) sessionStorage.setItem('hdwork:operational:checkin:2', 'ONLINE');
      window.EventSource = class extends EventTarget { close() {} };
    });
    const user = { id: 2, name: 'Yayan Demo', username: 'theme-fixture', role: 'HD', city_id: null, modules: ['TIAL', 'REQ', 'LOGIC_PSB', 'LOGIC_MO'] };
    const id = '10000001-1000-4000-8000-000000000001';
    const order = { id, command: 'config_psb', module: 'LOGIC_PSB', status: 'WAITING', version: 1, scIn: 'ORDER-FIXTURE-01', inetMasked: '••••0123', receivedAt: '2026-11-23T08:00:00Z' };
    await page.route('**/*', route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== new URL(base).origin) { unexpected.push(url.origin); return route.abort(); }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const json = data => route.fulfill({ json: data });
      if (req.method() !== 'GET') { unexpected.push(req.method() + ' ' + url.pathname); return route.abort(); }
      if (url.pathname === '/api/auth/me') return json({ success: true, data: user, csrf: 'a'.repeat(64) });
      if (url.pathname === '/api/operations/orders') return json({ data: [order], hasMore: false, serverNow: '2026-11-23T08:00:00Z' });
      if (url.pathname === '/api/operations/orders/' + id) return json({ data: order, history: [], fields: {}, page: 1, hasMore: false, capabilities: {} });
      if (url.pathname.endsWith('/vlan-format')) return json({ text: 'DATA VLAN INET 1234' });
      if (url.pathname === '/api/operations/order-notes' || url.pathname === '/api/operations/people') return json({ data: [], hasMore: false });
      if (url.pathname === '/api/operations/chat/conversations') return json({ data: [{ ...order, reference: order.scIn }], hasMore: false });
      if (url.pathname === '/api/operations/recap') return json({ data: { total: 202, waiting: 0, process: 8, done: 167, failed: 27, averageDurationSeconds: 6600 } });
      if (url.pathname === '/api/operations/system/status') return json({
        checkedAt: '2026-11-23T08:00:00Z', components: { frontend: 'ONLINE', api: 'ONLINE', mysql: 'ONLINE', courier: 'ONLINE', tunnel: 'ONLINE', queue: 'ONLINE' },
        queue: { pending: 0, retry: 0 }, incidents: []
      });
      unexpected.push(url.pathname);
      return route.fulfill({ status: 404, json: { message: 'Fixture API unavailable' } });
    });

    const capture = async name => {
      if (process.env.HD_THEME_CAPTURE_DIR) await page.screenshot({
        path: process.env.HD_THEME_CAPTURE_DIR + '/' + name + '.png', fullPage: true, animations: 'disabled'
      });
    };
    const indicator = page.locator('.op-topbar .op-header-status');
    const jobsTitle = page.getByRole('heading', { name: 'Apa yang Anda kerjakan hari ini?' });
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);

    await page.goto(base + '/jobs');
    await jobsTitle.waitFor();
    const workspace = page.getByRole('link', { name: /HD B2C.*Buka workspace/ });
    assert.equal(await workspace.count(), 1);
    assert.equal(await workspace.getByText('TIAL', { exact: true }).count(), 1);
    assert.equal(await workspace.getByText('LOGIC', { exact: true }).count(), 1);
    assert.equal(await page.getByText(/^(Cepat|Aman|Terukur)$/).count(), 0);
    assert.equal(await indicator.count(), 1);
    assert.equal(await indicator.getAttribute('data-status'), 'ONLINE');
    assert.equal(await page.locator('.op-topbar').getByRole('button', { name: /^(ONLINE|SIBUK|OFFLINE)$/ }).count(), 0);
    assert.equal(await indicator.getAttribute('tabindex'), null);
    await capture('light-desktop');

    await page.getByRole('button', { name: 'Gunakan mode malam' }).click();
    assert.equal(await page.locator('html').getAttribute('class'), 'dark');
    assert.equal(await page.locator('.op-shell').evaluate(node => getComputedStyle(node).getPropertyValue('--primary').trim()), '#49dcff');
    await capture('dark-desktop');
    for (const status of ['SIBUK', 'OFFLINE', 'ONLINE']) {
      await page.getByRole('button', { name: 'Menu akun' }).click();
      await page.getByLabel('Status kerja', { exact: true }).selectOption(status);
      await page.waitForFunction(value => document.querySelector('.op-header-status')?.getAttribute('data-status') === value, status);
      await page.keyboard.press('Escape');
      assert.equal(await indicator.count(), 1);
    }
    await page.reload();
    await jobsTitle.waitFor();
    await page.getByRole('button', { name: 'Gunakan mode pagi' }).waitFor();
    assert.equal(await indicator.getAttribute('data-status'), 'ONLINE');

    for (const [route, label] of [
      ['/work/B2C/TIAL','ORDER MASUK'],
      ['/work/B2C/REQ','ORDER MASUK'],
      ['/work/B2C/LOGIC','ORDER MASUK'],
      ['/recap','Ringkasan order'],
      ['/chat','Telegram Live Chat'],
      ['/admin/system','Kesehatan sistem']
    ]) {
      await page.goto(base + route);
      await page.getByRole('heading', { name: label, exact: true }).waitFor();
      assert.equal(await indicator.count(), 1);
      assert.equal(await overflow(), false, route);
      assert.equal(await page.locator('html').getAttribute('class'), 'dark');
      if (route === '/recap') {
        await page.getByText('202', { exact: true }).waitFor();
        await capture('dark-dashboard-rekap');
      }
    }
    await page.goto(base + '/orders/' + id);
    await page.getByRole('button', { name: 'FORMAT VLAN', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'FORMAT VLAN' });
    await modal.waitFor();
    assert.equal(await modal.evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(10, 27, 43)');
    await page.keyboard.press('Escape');
    await modal.waitFor({ state: 'hidden' });

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(base + '/jobs');
    await jobsTitle.waitFor();
    assert.equal(await overflow(), false);
    await capture('dark-mobile');
    await page.getByRole('button', { name: 'Buka navigasi' }).click();
    const nav = page.getByRole('dialog', { name: 'Navigasi HD Work 2.0' });
    await nav.getByRole('link', { name: 'LOGIC / SOLVER' }).click();
    await page.waitForURL('**/work/B2C/LOGIC');
    await nav.waitFor({ state: 'hidden' });
    assert.equal(await overflow(), false);
    await page.goto(base + '/jobs');
    await page.getByRole('button', { name: 'Gunakan mode pagi' }).click();
    assert.ok(!(await page.locator('html').getAttribute('class'))?.includes('dark'));
    assert.equal(await overflow(), false);
    await capture('light-mobile');

    user.modules = [];
    await page.reload();
    await page.getByText('Belum ada modul yang ditugaskan.', { exact: false }).waitFor();
    assert.equal(await workspace.count(), 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    console.log('PASS: themes, operational navigation, one header status, profile switches, modal portal, responsive drawer, and workspace access.');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });

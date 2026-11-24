const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.HD_PREVIEW_URL || 'http://127.0.0.1:5203';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HD_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
    page.setDefaultTimeout(8000);
    const account = { id: 2, name: 'Yayan Demo', username: 'fixture', role: 'HD', modules: ['TIAL','REQ','LOGIC_MO','LOGIC_PSB'] };
    const csrf = 'a'.repeat(64);
    let role = 'HD', loggedIn = true, providerFailure = false, fetchedChunk = false;
    const requests = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      sessionStorage.setItem('hdwork:operational:checkin:2', 'ONLINE');
      window.EventSource = class extends EventTarget { close() {} };
    });
    await page.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== new URL(base).origin) return route.abort();
      if (url.pathname.includes('/assets/TanyaYanto-')) fetchedChunk = true;
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const json = (data, status = 200) => route.fulfill({ json: data, status });
      if (url.pathname === '/api/auth/me') return loggedIn ? json({ success: true, data: { ...account, role }, csrf }) : json({}, 401);
      if (url.pathname === '/api/auth/logout') { loggedIn = false; return json({ success: true }); }
      if (url.pathname === '/api/operations/overview') {
        const row = { total: 24, waiting: 2, process: 0, done: 20, failed: 2, averageDurationSeconds: 900 };
        return json({ all: row, LOGIC: row, TIAL: row });
      }
      if (url.pathname.endsWith('/assistant/settings')) {
        requests.push({ type: 'settings' });
        return json({ enabled: true, baseUrl: 'https://api.dinero.web.id/v1', model: 'synthetic', keyConfigured: true, articles: [], backupAvailable: true });
      }
      if (url.pathname.endsWith('/assistant/chat')) {
        assert.equal(request.headers()['x-csrf-token'], csrf);
        const { question, history } = request.postDataJSON();
        requests.push({ type: 'chat', question, history });
        if (providerFailure) return json({ message: 'Penyedia AI sedang membatasi permintaan.' }, 429);
        return json({ answer: question.includes('order') ? '1. Buka antrean TIAL / REQ atau LOGIC / SOLVER.\n2. Pilih order yang tersedia.\n3. Tekan PICK.' : 'Air menguap ketika menerima cukup energi.' });
      }
      return json({}, 404);
    });
    const capture = name => process.env.HD_TANYA_CAPTURE_DIR && page.screenshot({ path: process.env.HD_TANYA_CAPTURE_DIR + '/' + name + '.png', animations: 'disabled' });
    const launch = page.getByRole('button', { name: 'Tanya Yanto', exact: true });
    const panel = page.getByRole('dialog', { name: 'Tanya Yanto' });
    const draft = panel.getByRole('textbox', { name: 'Pertanyaan' });
    const send = async question => {
      await draft.fill(question);
      await panel.getByRole('button', { name: 'Kirim pertanyaan' }).click();
    };
    for (const denied of ['HD', 'ADMIN']) {
      role = denied;
      await page.goto(base + '/work/B2C');
      await page.getByRole('heading', { name: 'Dashboard Pekerjaan' }).waitFor();
      assert.equal(await launch.count(), 0);
    }
    role = 'SUPER_ADMIN';
    await page.goto(base + '/work/B2C');
    await launch.waitFor();
    assert.equal(fetchedChunk, false);
    assert.equal(requests.length, 0);
    await launch.click();
    await panel.waitFor();
    assert.equal(await panel.locator('.tanya-message').first().innerText(), 'Halo Yayan Demo\nAda yang bisa saya bantu?');
    assert.equal(fetchedChunk, true);
    assert.equal(requests.length, 0);
    assert.equal(await panel.getByRole('button', { name: 'Pengaturan Tanya Yanto' }).count(), 1);
    await send('Bagaimana cara mengambil order?');
    await panel.getByText(/Tekan PICK/).waitFor();
    assert.deepEqual(requests.at(-1).history, []);
    await capture('light-desktop');
    await page.getByRole('button', { name: 'Gunakan mode malam' }).click();
    await capture('dark-desktop');

    const initial = await panel.boundingBox();
    const drag = await panel.getByRole('button', { name: /Geser jendela/ }).boundingBox();
    await page.mouse.move(drag.x + drag.width / 2, drag.y + drag.height / 2);
    await page.mouse.down(); await page.mouse.move(drag.x + 120, drag.y - 50); await page.mouse.up();
    assert.ok((await panel.boundingBox()).x > initial.x);
    const resize = panel.getByRole('button', { name: /Ubah ukuran jendela/ });
    await resize.press('ArrowRight');
    assert.ok((await panel.boundingBox()).width > initial.width);
    await panel.getByRole('button', { name: 'Minimalkan Tanya Yanto' }).click();
    await panel.waitFor({ state: 'hidden' }); await launch.click();
    await panel.getByText(/Tekan PICK/).waitFor();
    await send('Kenapa air bisa menguap?');
    await panel.getByText('Air menguap ketika menerima cukup energi.').waitFor();
    assert.equal(requests.at(-1).history.length, 2);

    providerFailure = true;
    await send('Pertanyaan berikutnya');
    await panel.getByRole('alert').getByText(/membatasi permintaan/).waitFor();
    assert.equal(await draft.inputValue(), 'Pertanyaan berikutnya');
    providerFailure = false;
    assert.equal(await page.evaluate(() => Object.values(localStorage).concat(Object.values(sessionStorage)).some(value => /Tekan PICK|mengambil order/.test(value))), false);
    await panel.getByRole('button', { name: 'Tutup Tanya Yanto' }).click();
    await page.getByRole('button', { name: 'Ciutkan sidebar' }).click();
    assert.equal(await launch.getAttribute('title'), 'Tanya Yanto');
    await launch.click();
    assert.equal(await panel.getByText(/Tekan PICK/).count(), 0);
    await send('Kenapa air bisa menguap?');
    await panel.getByText('Air menguap ketika menerima cukup energi.').waitFor();
    assert.deepEqual(requests.at(-1).history, []);
    await page.reload(); await launch.click();
    assert.equal(await panel.getByText('Air menguap ketika menerima cukup energi.').count(), 0);
    await page.getByRole('button', { name: 'Menu akun' }).click();
    await page.getByText('Logout', { exact: true }).click();
    await page.waitForURL('**/login'); await panel.waitFor({ state: 'hidden' });

    loggedIn = true; role = 'SUPER_ADMIN';
    await page.goto(base + '/work/B2C'); await launch.click();
    await panel.getByRole('button', { name: 'Pengaturan Tanya Yanto' }).click();
    await panel.getByRole('textbox', { name: 'Base URL' }).waitFor();
    assert.equal(await panel.getByLabel('API Key').inputValue(), '');
    await panel.getByRole('button', { name: 'Tutup Tanya Yanto' }).click();

    await page.setViewportSize({ width: 360, height: 660 });
    await page.goto(base + '/work/B2C');
    await page.getByRole('button', { name: 'Buka navigasi' }).click();
    await page.getByRole('dialog', { name: 'Navigasi HD Work 2.0' }).getByRole('button', { name: 'Tanya Yanto', exact: true }).click();
    await send('Bagaimana cara mengambil order?'); await panel.getByText(/Tekan PICK/).waitFor();
    const box = await panel.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 360);
    await capture('dark-mobile');
    await page.getByRole('button', { name: 'Gunakan mode pagi' }).click();
    await capture('light-mobile');
    assert.deepEqual(errors, []);
    console.log('PASS: Tanya Yanto lazy loading, Super Admin only, themes, mobile, drag/resize, session reset and safe failure.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

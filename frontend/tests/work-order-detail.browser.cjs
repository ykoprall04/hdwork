const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = process.env.HD_PREVIEW_URL || 'http://127.0.0.1:5202';
const captureDir = process.env.HD_DETAIL_CAPTURE_DIR;
const baseline = process.env.HD_DETAIL_BASELINE_DIR;
const longText = '/order\n' + Array.from({ length: 45 }, (_, i) => `Baris ${i + 1}: detail sintetis untuk pemeriksaan.`).join('\n') + '\nAkhir pesan.';
const csrf = 'a'.repeat(64);
const orders = ['TIAL', 'LOGIC'].flatMap((area, index) => [0, 1].map(offset => ({
  id: `1000000${index * 2 + offset + 1}-1000-4000-8000-000000000001`,
  area, scIn: `FIXTURE-${area}-${offset + 1}`, module: index ? 'LOGIC_MO' : 'TIAL',
  command: index ? 'mo' : 'order', ownerId: 2, ownerName: 'HD Uji',
  status: 'IN_PROGRESS', version: 1, receivedAt: '2026-11-23T12:00:00Z', startedAt: '2026-11-23T12:01:00Z'
})));

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HD_CHROMIUM_PATH || undefined });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
    await context.addInitScript(() => {
      sessionStorage.setItem('hdwork:operational:checkin:2', 'ONLINE');
      window.EventSource = class extends EventTarget { close() {} };
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8500);
    const requests = [], errors = [], unexpected = [], olderRequests = [];
    let failOlderOnce = true;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== new URL(base).origin) {
        unexpected.push(url.origin);
        return route.abort();
      }
      if (!url.pathname.startsWith('/api/')) {
        if (!baseline) return route.continue();
        const asset = /^\/assets\/[\w.-]+$/.test(url.pathname) ? url.pathname : '/index.html';
        return route.fulfill({ path: baseline + asset });
      }
      const json = data => route.fulfill({ json: data });
      if (url.pathname === '/api/auth/me') return json({ success: true, csrf, data: { id: 2, role: 'HD', username: 'fixture', name: 'HD Uji', modules: ['TIAL', 'REQ', 'LOGIC_PSB', 'LOGIC_MO'] } });
      const path = url.pathname.replace('/api/operations', '');
      if (req.method() === 'POST' && /\/(actions|messages|hd-note)$/.test(path)) {
        assert.equal(req.headers()['x-csrf-token'], csrf);
        requests.push({ path, ...req.postDataJSON() });
        return json({ success: true, text: req.postDataJSON().text });
      }
      if (path === '/orders') return json({
        data: url.searchParams.get('tab') === 'process' ? orders.filter(order => order.area === url.searchParams.get('area')) : [],
        hasMore: false
      });
      if (path === '/chat/incoming-summary') return json({ data: [] });
      if (path === '/order-notes') return json({ data: orders.map(({ id }) => ({ id, text: 'Catatan fixture' })) });
      const order = orders.find(({ id }) => path.includes(id));
      if (order && path.startsWith('/orders/')) return json({
        data: order, originalMessage: order.scIn.endsWith('-1') ? longText : 'Pesan singkat.',
        capabilities: { escalate: true }, history: []
      });
      if (order && path.endsWith('/messages')) {
        const number = Number(url.searchParams.get('page'));
        if (number > 1) olderRequests.push(number);
        if (number === 2 && failOlderOnce) {
          failOlderOnce = false;
          return route.fulfill({ status: 503, json: { message: 'Riwayat uji gagal sementara' } });
        }
        const indexes = number === 1 ? [7, 20] : number === 2 ? [3, 8] : [1, 3];
        return json({ routeActive: true, photosEnabled: true, hasMore: number < 3, data:
          Array.from({ length: indexes[1] - indexes[0] }, (_, i) => indexes[0] + i).map(i => ({
            id: order.id + '-' + i, sequence: String(i), text: 'Balon chat ' + i, userName: 'Telegram',
            direction: 'IN', status: 'DITERIMA', replyTo: '1', attempts: 0, at: '2026-11-23T12:00:00Z'
          }))
        });
      }
      unexpected.push(path);
      return route.fulfill({ status: 404, json: { message: 'Fixture tidak tersedia' } });
    });

    const capture = name => captureDir && page.screenshot({ path: captureDir + '/' + name + '.png', animations: 'disabled' });
    for (const area of ['TIAL', 'LOGIC']) {
      const desktop = area === 'TIAL';
      await page.setViewportSize(desktop ? { width: 1440, height: 900 } : { width: 360, height: 650 });
      await page.goto(base + '/work/B2C/' + area);
      if (!desktop) await page.getByRole('button', { name: 'Gunakan mode malam' }).click();
      await page.getByText('Tidak ada pekerjaan sesuai filter.').waitFor();
      await capture(area.toLowerCase() + '-list');
      if (!baseline) assert.equal(await page.getByRole('button', { name: 'Export Excel' }).count(), 0);
      await page.getByRole('button', { name: 'PROSES CEK', exact: true }).click();
      await page.getByRole('link', { name: 'FIXTURE-' + area + '-1', exact: true }).click();
      const detail = page.getByRole('region', { name: 'Pesan asli Telegram' });
      const reply = page.getByRole('textbox', { name: 'Balasan', exact: true });
      await reply.waitFor();
      await page.getByText('Balon chat 19', { exact: true }).waitFor({ state: 'attached' });
      await capture(area.toLowerCase() + '-detail');
      if (baseline) continue;

      const history = page.getByRole('region', { name: 'Riwayat percakapan' });
      assert.equal(await page.getByRole('button', { name: /^Pesan lebih (lama|baru)$/ }).count(), 0);
      const longHeight = await detail.evaluate(node => node.clientHeight);
      assert.ok(longHeight > 96 && await detail.evaluate(node => node.scrollHeight > node.clientHeight));
      await detail.focus();
      await page.keyboard.press('Control+a');
      assert.equal(await page.evaluate(() => getSelection().toString()), longText);
      await page.keyboard.press('Control+c');
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), longText);
      await reply.fill('Balasan order uji');
      await reply.press('Control+a');
      assert.deepEqual(await reply.evaluate(node => [node.selectionStart, node.selectionEnd]), [0, 'Balasan order uji'.length]);
      await reply.press('Enter');
      await page.getByText(/Pesan tersimpan dalam antrean Courier/).waitFor();
      assert.equal(requests.at(-1).text, 'Balasan order uji');
      const notes = page.locator('details[aria-label="Catatan HD"]');
      assert.ok(await notes.evaluate(node => node.clientHeight < 42));
      await notes.locator('summary').click();
      await notes.getByRole('button', { name: 'Edit catatan' }).click();
      await notes.getByRole('textbox', { name: 'Isi Catatan HD' }).fill('Catatan diubah');
      await notes.getByRole('button', { name: 'Simpan Catatan' }).click();
      await notes.getByText('Catatan tersimpan.').waitFor();
      await notes.locator('summary').click();
      await history.evaluate(node => { node.scrollTop = 0; });
      if (desktop) {
        await page.getByRole('button', { name: 'Coba muat riwayat' }).click();
      }
      await history.getByText('Balon chat 3', { exact: true }).waitFor({ state: 'attached' });
      await history.evaluate(node => { node.scrollTop = 0; });
      await history.getByText('Balon chat 1', { exact: true }).waitFor({ state: 'attached' });
      assert.equal(await history.getByText('Balon chat 7', { exact: true }).count(), 1);
      assert.equal(await history.getByText('Balon chat 19', { exact: true }).count(), 1);

      const handle = page.getByRole('separator', { name: 'Atur tinggi panel order' });
      await handle.press('Home');
      assert.ok(await detail.evaluate(node => node.clientHeight < 60));
      await handle.press('End');
      assert.ok(await detail.evaluate((node, height) => node.clientHeight >= height, longHeight));
      if (desktop) {
        const bounds = await handle.boundingBox();
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        await page.mouse.down();
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y - 55);
        await page.mouse.up();
        assert.ok(await detail.evaluate((node, height) => node.clientHeight < height, longHeight));
      } else {
        await page.getByRole('button', { name: 'Kembali ke daftar pekerjaan' }).click();
      }
      await page.getByRole('button', { name: new RegExp('FIXTURE-' + area + '-2') }).click();
      await detail.getByText('Pesan singkat.', { exact: true }).waitFor();
      assert.ok(await detail.evaluate(node => node.clientHeight < 75 && node.scrollTop === 0));
      await page.getByRole('button', { name: 'ESKALASI', exact: true }).click();
      await page.getByRole('textbox', { name: 'Pesan eskalasi (wajib)' }).fill('Uji eskalasi');
      await page.getByRole('button', { name: 'Kirim Eskalasi' }).click();
      await page.getByText(/Eskalasi dicatat/).waitFor();
      await page.getByRole('button', { name: desktop ? 'DONE' : 'GAGAL', exact: true }).click();
      if (!desktop) await page.getByRole('textbox', { name: 'Alasan kegagalan (wajib)' }).fill('Uji gagal');
      await page.getByRole('button', { name: desktop ? 'Konfirmasi DONE' : 'Konfirmasi GAGAL', exact: true }).click();
      await page.getByText('Tindakan berhasil disimpan.').waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    if (!baseline) {
      assert.deepEqual(requests.filter(request => request.action).map(request => request.action), ['ESCALATE', 'DONE', 'ESCALATE', 'FAILED']);
      assert.deepEqual(olderRequests, [2, 2, 3, 2, 3]);
    }
    console.log(baseline ? 'Baseline screenshots captured.' : 'PASS: TIAL desktop and LOGIC 360 px, clipboard, resize, notes, chat pagination, replies and order actions.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

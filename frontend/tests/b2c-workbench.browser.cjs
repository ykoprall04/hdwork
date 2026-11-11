const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.HD_PREVIEW_URL || 'http://127.0.0.1:5196';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HD_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(10000);
    const ids = ['10000001-1000-4000-8000-000000000001', '10000002-1000-4000-8000-000000000001'];
    const rows = ids.map((id, index) => ({ id, command: 'order', module: 'TIAL', status: 'IN_PROGRESS', decision: null, duplicateOf: null, ownerId: 7, ownerName: 'HD Synthetic', finalName: null, version: 0, scIn: `SC-SYNTHETIC-${index + 1}`, inetMasked: '••••0001', receivedAt: '2026-11-11T00:00:00Z', startedAt: '2026-11-11T01:00:00Z', finishedAt: null, note: null }));
    let role = 'HD', capabilities = true, unknownChat = true, unknownAction = true;
    const posts = [], errors = [], messages = new Map(ids.map(id => [id, [{ id: `message-${id}`, direction: 'IN', text: `CHAT ONLY ${id}`, userName: 'Telegram', at: '2026-11-11T01:00:00Z', status: 'DITERIMA', telegramMessageId: '10', replyTo: null, attempts: 0 }]]));
    const committedChat = new Map(), committedActions = new Map();
    let deferSecond = false, heldSecondReply;
    let notifyHeld; const secondHeld = new Promise(resolve => { notifyHeld = resolve; });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { if(!sessionStorage.getItem('hdwork:operational:checkin:7'))sessionStorage.setItem('hdwork:operational:checkin:7', 'ONLINE'); window.__sources = []; window.EventSource = class extends EventTarget { constructor() { super(); window.__sources.push(this); } close() { this.closed = true; } }; });
    await page.route('**/api/**', async route => {
      const req = route.request(), url = new URL(req.url()), path = url.pathname;
      const headers = { 'access-control-allow-origin': req.headers().origin || base, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'Content-Type,X-CSRF-Token' };
      const reply = (json, status = 200) => route.fulfill({ headers, json, status });
      if (req.method() === 'OPTIONS') return route.fulfill({ headers, status: 204 });
      if (path === '/api/auth/me') return reply({ success: true, csrf: 'a'.repeat(64), data: { id: 7, username: 'synthetic', name: 'HD Synthetic', role, modules: ['TIAL', 'REQ', 'LOGIC_PSB', 'LOGIC_MO', 'B2B', 'ASSUREN', 'REPLACEMENT'], city_id: null } });
      if (path.endsWith('/recap')) return reply({ data: { total: 2, waiting: 0, process: rows.filter(row => row.status === 'IN_PROGRESS').length, done: 0, failed: 0, averageDurationSeconds: 0 } });
      if (path.endsWith('/people')) return reply({ data: [], hasMore: false });
      if (path === '/api/operations/orders') return reply({ data: rows.filter(row => url.searchParams.get('tab') === 'process' ? row.status === 'IN_PROGRESS' : url.searchParams.get('tab') === 'finished' ? ['DONE', 'FAILED'].includes(row.status) : false), hasMore: false, page: 1, serverNow: '2026-11-11T02:00:00Z' });
      const row = rows.find(row => path.includes(row.id));
      if (row && path.endsWith('/actions')) {
        assert.equal(req.headers()['x-csrf-token'], 'a'.repeat(64));
        const body = req.postDataJSON(); posts.push({ kind: 'action', id: row.id, ...body });
        if (committedActions.has(body.requestId)) return reply(committedActions.get(body.requestId));
        if (row.version !== body.version || row.ownerId !== 7) return reply({ message: 'Order berubah. Muat ulang data.' }, 409);
        if (body.action === 'ESCALATE') assert.ok(body.note.trim());
        if (['DONE', 'FAILED'].includes(body.action)) { assert.equal(body.confirm, true); row.status = body.action; row.finishedAt = '2026-11-11T02:00:00Z'; }
        row.version++;
        const result = { success: true, status: row.status, version: row.version }; committedActions.set(body.requestId, result);
        if (body.action === 'ESCALATE' && unknownAction) { unknownAction = false; return reply({ message: 'Synthetic lost response' }, 503); }
        return reply(result);
      }
      if (row && path.includes('/chat/') && path.endsWith('/messages')) {
        if (req.method() === 'GET') {
          if (row.id === ids[1] && deferSecond) {
            deferSecond = false;
            await new Promise(done => { heldSecondReply = async () => { try { await reply({ data: messages.get(row.id), hasMore: false, routeActive: true }); } catch {} finally { done(); } }; notifyHeld(); });
            return;
          }
          return reply({ data: messages.get(row.id), hasMore: false, routeActive: true });
        }
        const body = req.postDataJSON(); posts.push({ kind: 'chat', id: row.id, ...body });
        assert.equal(req.headers()['x-csrf-token'], 'a'.repeat(64));
        assert.deepEqual(Object.keys(body).sort(), ['requestId', 'text', 'version']);
        if (committedChat.has(body.requestId)) return reply(committedChat.get(body.requestId));
        assert.equal(row.ownerId, 7); assert.equal(row.status, 'IN_PROGRESS');
        const result = { success: true, status: 'ANTRE', messageId: `out-${row.id}` };
        committedChat.set(body.requestId, result);
        messages.get(row.id).push({ id: result.messageId, direction: 'OUT', text: body.text, userName: 'HD Synthetic', at: '2026-11-11T02:00:00Z', status: 'ANTRE', telegramMessageId: null, replyTo: '10', attempts: 0 });
        if (unknownChat) { unknownChat = false; return reply({ message: 'Synthetic lost response' }, 503); }
        return reply(result);
      }
      if (row && path.startsWith('/api/operations/orders/')) return reply({ data: row, originalMessage: `RAW ORIGINAL ${row.id}\nPesan Telegram asli`, capabilities: { escalate: capabilities, completionConfirmation: true }, fields: {}, history: [], previous: null, page: 1, hasMore: false, serverNow: '2026-11-11T02:00:00Z' });
      throw Error(`Unexpected mocked request: ${req.method()} ${path}`);
    });
    const live = () => page.evaluate(() => window.__sources.filter(source => !source.closed).forEach(source => source.dispatchEvent(new MessageEvent('change', { data: JSON.stringify({ changed: true, modules: ['TIAL'] }) }))));
    const panel = page.getByRole('dialog', { name: 'SC-SYNTHETIC-1', exact: true });
    const currentPanel = () => page.locator('.op-work-panel');
    await page.goto(base + '/check-in');
    await page.getByRole('button', { name: /^SIBUK/ }).click(); await page.waitForURL('**/jobs'); await page.getByRole('heading', { name: 'HD B2C', exact: true }).waitFor();
    assert.equal(await page.locator('main h2').count(), 1);
    assert.equal(await page.locator('main h2').innerText(), 'HD B2C');
    await page.getByRole('button', { name: 'OFFLINE', exact: true }).click(); await page.waitForURL('**/jobs');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('hdwork:operational:checkin:7')), 'OFFLINE');
    assert.equal(posts.length, 0);
    role = 'SUPER_ADMIN'; await page.reload(); await page.getByRole('heading', { name: 'HD B2B', exact: true }).waitFor(); assert.equal(await page.locator('main h2').count(), 4);
    role = 'HD'; await page.goto(base + '/work/B2C/TIAL');
    await page.getByRole('button', { name: 'PROSES CEK', exact: true }).click();
    await page.getByRole('link', { name: 'SC-SYNTHETIC-1', exact: true }).waitFor();
    assert.equal(await page.getByRole('columnheader').count(), 3);
    await page.getByRole('link', { name: 'SC-SYNTHETIC-1', exact: true }).click();
    await panel.waitFor(); await panel.getByText(`RAW ORIGINAL ${ids[0]}\nPesan Telegram asli`, { exact: true }).waitFor();
    assert.equal(await panel.getAttribute('aria-modal'), 'false');
    assert.ok(Math.abs(await panel.evaluate(el => el.getBoundingClientRect().width) - 720) < 2);
    if (process.env.HD_SCREENSHOT_DIR) { require('node:fs').mkdirSync(process.env.HD_SCREENSHOT_DIR, { recursive: true }); await page.screenshot({ path: require('node:path').join(process.env.HD_SCREENSHOT_DIR, 'b2c-panel-desktop.png'), fullPage: true }); }
    await page.evaluate(() => { window.__panel = document.querySelector('.op-work-panel'); });
    await panel.getByLabel('Balasan', { exact: true }).fill('Draft order pertama');
    page.once('dialog', dialog => dialog.dismiss()); await panel.getByRole('button', { name: 'Order berikutnya', exact: true }).click();
    assert.equal(await panel.count(), 1);
    page.once('dialog', dialog => dialog.accept()); await panel.getByRole('button', { name: 'Order berikutnya', exact: true }).click();
    await currentPanel().getByRole('heading', { name: 'SC-SYNTHETIC-2', exact: true }).waitFor();
    assert.equal(await currentPanel().getByLabel('Balasan', { exact: true }).inputValue(), '');
    assert.equal(await currentPanel().getByText(`CHAT ONLY ${ids[0]}`, { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.__panel === document.querySelector('.op-work-panel')), true);
    await currentPanel().getByRole('button', { name: 'Order sebelumnya', exact: true }).click();
    await panel.waitFor(); assert.equal(await panel.getByLabel('Balasan', { exact: true }).inputValue(), 'Draft order pertama');
    deferSecond = true;
    page.once('dialog', dialog => dialog.accept()); await panel.getByRole('button', { name: 'Order berikutnya', exact: true }).click();
    await secondHeld;
    await currentPanel().getByRole('button', { name: 'Order sebelumnya', exact: true }).click();
    await panel.getByText(`CHAT ONLY ${ids[0]}`, { exact: true }).waitFor();
    await heldSecondReply();
    assert.equal(await panel.getByText(`CHAT ONLY ${ids[1]}`, { exact: true }).count(), 0);
    assert.equal(await panel.getByLabel('Balasan', { exact: true }).inputValue(), 'Draft order pertama');
    page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'ONLINE', exact: true }).click();
    assert.ok(page.url().endsWith('/work/B2C/TIAL'));
    page.once('dialog', dialog => dialog.dismiss());
    await page.locator('.op-sidebar').getByRole('link', { name: 'LOGIC / SOLVER', exact: true }).click();
    assert.ok(page.url().endsWith('/work/B2C/TIAL'));
    page.once('dialog', dialog => dialog.dismiss());
    await page.evaluate(() => history.back());
    await page.waitForURL('**/work/B2C/TIAL');
    await panel.getByRole('button', { name: 'Kirim balasan', exact: true }).click();
    await panel.getByRole('button', { name: 'Periksa / ulangi balasan', exact: true }).waitFor();
    rows[0].ownerId = 8; rows[0].ownerName = 'Other HD'; rows[0].version++; await live();
    await panel.getByRole('button', { name: 'AMBIL ALIH', exact: true }).waitFor();
    await panel.getByRole('button', { name: 'Periksa / ulangi balasan', exact: true }).click();
    await panel.getByRole('button', { name: 'Kirim balasan', exact: true }).waitFor();
    rows[0].ownerId = 7; rows[0].ownerName = 'HD Synthetic'; rows[0].version++; await live();
    await panel.getByLabel('Alasan ESKALASI', { exact: true }).waitFor();
    assert.equal(committedChat.size, 1);
    assert.equal(posts.filter(post => post.kind === 'chat')[0].requestId, posts.filter(post => post.kind === 'chat')[1].requestId);
    assert.equal(await panel.getByLabel('Balasan', { exact: true }).inputValue(), '');
    assert.equal(await panel.getByRole('button', { name: 'ESKALASI', exact: true }).isEnabled(), false);
    await panel.getByLabel('Alasan ESKALASI', { exact: true }).fill('Perlu tim lanjutan');
    await panel.getByRole('button', { name: 'ESKALASI', exact: true }).click();
    await panel.getByRole('button', { name: 'Periksa / ulangi ESKALASI', exact: true }).waitFor();
    await panel.getByRole('button', { name: 'Periksa / ulangi ESKALASI', exact: true }).click();
    await panel.getByText('Eskalasi dicatat.', { exact: false }).waitFor();
    assert.equal(rows[0].status, 'IN_PROGRESS');
    const escalations = posts.filter(post => post.action === 'ESCALATE');
    assert.equal(escalations[0].requestId, escalations[1].requestId);
    await panel.getByRole('button', { name: 'DONE', exact: true }).click();
    await page.getByRole('dialog', { name: 'Konfirmasi DONE', exact: true }).getByRole('button', { name: 'BATAL', exact: true }).click();
    assert.equal(posts.filter(post => post.action === 'DONE').length, 0);
    await panel.getByRole('button', { name: 'DONE', exact: true }).click();
    await page.getByRole('dialog', { name: 'Konfirmasi DONE', exact: true }).getByRole('button', { name: 'DONE', exact: true }).click();
    await panel.getByText('DONE', { exact: true }).waitFor(); assert.equal(rows[0].status, 'DONE');
    await panel.getByRole('button', { name: 'Tutup panel order', exact: true }).click();
    await page.getByRole('link', { name: 'SC-SYNTHETIC-2', exact: true }).click();
    await currentPanel().getByRole('button', { name: 'DONE', exact: true }).waitFor();
    await currentPanel().getByRole('button', { name: 'DONE', exact: true }).click();
    rows[1].ownerId = 8; rows[1].ownerName = 'Other HD'; rows[1].version++;
    await page.getByRole('dialog', { name: 'Konfirmasi DONE', exact: true }).getByRole('button', { name: 'DONE', exact: true }).click();
    await currentPanel().getByRole('button', { name: 'AMBIL ALIH', exact: true }).waitFor();
    assert.equal(rows[1].status, 'IN_PROGRESS'); assert.equal(await currentPanel().getByRole('button', { name: 'DONE', exact: true }).count(), 0);
    rows[1].ownerId = 7; rows[1].ownerName = 'HD Synthetic'; rows[1].version++; await live();
    await currentPanel().getByLabel('Alasan GAGAL', { exact: true }).fill('Synthetic failure');
    await currentPanel().getByRole('button', { name: 'GAGAL', exact: true }).click();
    assert.equal(posts.filter(post => post.action === 'FAILED').length, 0);
    await page.getByRole('dialog', { name: 'Konfirmasi GAGAL', exact: true }).getByRole('button', { name: 'GAGAL', exact: true }).click();
    await currentPanel().getByText('GAGAL', { exact: true }).waitFor(); assert.equal(rows[1].status, 'FAILED');
    // Reopen fixture locally to exercise mobile and backend capability fallback.
    rows[1].status = 'IN_PROGRESS'; rows[1].version++; capabilities = false; await live();
    await currentPanel().getByText('ESKALASI memerlukan backend B2C terbaru.', { exact: false }).waitFor();
    assert.equal(await currentPanel().getByRole('button', { name: 'ESKALASI', exact: true }).isEnabled(), false);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(Math.abs(await currentPanel().evaluate(el => el.getBoundingClientRect().width) - width) < 2);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (width === 390 && process.env.HD_SCREENSHOT_DIR) await page.screenshot({ path: require('node:path').join(process.env.HD_SCREENSHOT_DIR, 'b2c-panel-mobile.png'), fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log('PASS: status shortcuts without logout, HD B2C/Super Admin categories, compact process table, persistent 50% panel, original text, draft warnings/isolation and delayed-response isolation, chat and action idempotent retry, DONE/FAILED confirmation, ownership conflict, nonfinal escalation, capability fallback, 320/390 mobile.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

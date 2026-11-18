const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const base = process.env.HD_PREVIEW_URL || 'http://127.0.0.1:5192';
const oldOrder = order('10000001-1000-4000-8000-000000000001', 'SC-OLD');
const newOrder = order('10000002-1000-4000-8000-000000000002', 'SC-NEW');

function order(id, scIn) {
  return { id, scIn, command: 'order', module: 'TIAL', status: 'WAITING',
    receivedAt: '2026-11-18T01:00:00Z', version: 0 };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(12_000);
    let calls = 0;
    let active = 0;
    let peak = 0;
    let retryAt = 0;
    let recoveredAt = 0;
    const timeoutResponse = Promise.withResolvers();
    const secondRequest = Promise.withResolvers();

    await context.addInitScript(() => {
      sessionStorage.setItem('hdwork:operational:checkin:2', 'ONLINE');
      window.liveSources = new Set();
      window.EventSource = class extends EventTarget {
        constructor() {
          super();
          window.liveSources.add(this);
        }
        close() { window.liveSources.delete(this); }
      };
    });
    await context.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const headers = {
        'access-control-allow-origin': new URL(base).origin,
        'access-control-allow-credentials': 'true',
        'access-control-expose-headers': 'Retry-After',
      };
      if (path === '/api/auth/me') {
        return route.fulfill({ headers, json: {
          success: true, csrf: 'a'.repeat(64),
          data: { id: 2, name: 'HD Test', username: 'synthetic', role: 'HD', modules: ['TIAL'] },
        } });
      }
      if (path !== '/api/operations/orders') {
        return route.fulfill({ headers, json: { data: [], page: 1, hasMore: false } });
      }
      assert.equal(request.method(), 'GET');
      const call = ++calls;
      peak = Math.max(peak, ++active);
      try {
        if (call === 2) {
          secondRequest.resolve();
          await timeoutResponse.promise;
          retryAt = Date.now() + 4_000;
          return await route.fulfill({ status: 429, headers: { ...headers, 'Retry-After': '4' },
            json: { message: 'Terlalu banyak permintaan; coba kembali nanti' } });
        }
        if (call > 2) recoveredAt = Date.now();
        return await route.fulfill({ headers, json: {
          data: call === 1 ? [oldOrder] : [newOrder, oldOrder],
          page: 1, hasMore: false, serverNow: new Date().toISOString(),
        } });
      } finally {
        active--;
      }
    });

    const arrivals = () => page.evaluate(() => {
      for (const source of window.liveSources) {
        for (let i = 0; i < 12; i++) {
          source.dispatchEvent(new MessageEvent('change', {
            data: JSON.stringify({ arrival: true, arrivalCount: 1, modules: ['TIAL'] }),
          }));
        }
      }
    });
    await page.goto(base + '/work/B2C/TIAL');
    const oldRow = page.getByRole('link', { name: 'SC-OLD', exact: true });
    await oldRow.waitFor();
    await arrivals();
    await Promise.race([secondRequest.promise, page.getByText('SC-NEW', { exact: true })
      .waitFor().then(() => { throw Error('Second list request was not held'); })]);
    await arrivals();
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 300)));
    assert.equal(calls, 2);
    assert.equal(peak, 1);

    timeoutResponse.resolve();
    const rateLimitNotice = page.getByText(/Data akan diperbarui otomatis/);
    await rateLimitNotice.waitFor();
    assert.equal(await oldRow.isVisible(), true);
    await arrivals();
    await page.getByRole('button', { name: 'Coba lagi', exact: true }).click();
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 300)));
    assert.equal(calls, 2);
    assert.equal(await oldRow.isVisible(), true);

    await page.getByRole('link', { name: 'SC-NEW', exact: true }).waitFor();
    await rateLimitNotice.waitFor({ state: 'hidden' });
    assert.equal(await oldRow.isVisible(), true);
    assert.equal(calls, 3);
    assert.equal(peak, 1);
    assert.ok(recoveredAt >= retryAt, 'Automatic retry must honor Retry-After');
    console.log('PASS: old orders survive HTTP 429, arrivals and manual retries coalesce, and new orders appear after Retry-After.');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

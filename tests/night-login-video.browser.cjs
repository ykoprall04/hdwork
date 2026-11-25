const assert = require('node:assert/strict');
const { chromium } = require('../frontend/node_modules/playwright');

const base = process.env.HD_PREVIEW_URL || 'http://127.0.0.1:5205';
const captures = process.env.HD_NIGHT_CAPTURE_DIR;
const videoPath = url => /\/HDWork-night-loop[^/]*\.mp4(?:\?|$)/.test(url);
const account = { id: 2, name: 'HD Demo', username: 'fixture', role: 'HD', modules: ['TIAL'] };

async function fixture(page) {
  await page.addInitScript(user => {
    const fetchOriginal = fetch;
    window.fetch = (input, options) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return fetchOriginal(input, options);
      const success = data => Promise.resolve(Response.json({ success: true, data }));
      if (url.pathname.endsWith('/auth/me')) return sessionStorage.getItem('night-test-login')
        ? Promise.resolve(Response.json({ success: true, data: user, csrf: 'a'.repeat(64) }))
        : Promise.resolve(Response.json({}, { status: 401 }));
      if (url.pathname.endsWith('/auth/login')) {
        sessionStorage.setItem('night-test-login', 'true');
        return success({ user, csrf: 'a'.repeat(64) });
      }
      if (url.pathname.endsWith('/auth/logout')) sessionStorage.removeItem('night-test-login');
      return success([]);
    };
  }, account);
}

(async () => {
  const fixtureCert = process.env.HD_NIGHT_FIXTURE_CERT_SPKI;
  const browser = await chromium.launch({
    executablePath: process.env.HD_CHROMIUM_PATH || undefined,
    args: fixtureCert ? ['--ignore-certificate-errors-spki-list=' + fixtureCert] : []
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
    const mediaRequests = [];
    const errors = [];
    page.on('request', request => { if (videoPath(request.url())) mediaRequests.push(request.url()); });
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(20000);
    await fixture(page);
    await page.goto(base + '/login');
    const video = page.locator('.night-video');
    await page.waitForFunction(() => document.querySelector('video')?.currentTime > .2);
    assert.equal(await video.evaluate(v => v.muted && v.loop && v.autoplay && v.playsInline), true);
    assert.equal(await video.evaluate(v => getComputedStyle(v).objectFit), 'cover');
    const capture = name => captures && page.screenshot({ path: captures + '/' + name + '.png' });
    await capture('desktop-video');

    // Observe a real loop and compare subsequent requests after the first full pass.
    await page.waitForFunction(() => document.querySelector('video').currentTime > 13.1);
    const requestsBeforeLoop = mediaRequests.length;
    await page.waitForFunction(() => document.querySelector('video').currentTime < 2);
    await page.waitForTimeout(400);
    assert.equal(mediaRequests.length, requestsBeforeLoop);
    console.log('Loop media requests:', requestsBeforeLoop, 'before;', mediaRequests.length, 'after');

    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => document.querySelector('video')?.paused);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => !document.querySelector('video')?.paused);

    const enter = page.getByRole('button', { name: 'Masuk Workspace', exact: true });
    const dialog = page.getByRole('dialog', { name: 'Masuk ke HD Work 2.0' });
    await enter.click();
    await dialog.waitFor();
    const start = await video.evaluate(v => v.currentTime);
    await page.waitForFunction(previous => document.querySelector('video').currentTime !== previous, start);
    await dialog.getByRole('link', { name: 'Daftar Akun' }).waitFor();
    await page.waitForTimeout(350);
    await capture('desktop-form');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });

    await page.setViewportSize({ width: 390, height: 844 });
    await capture('mobile-video');
    await enter.click();
    await dialog.waitFor();
    await page.waitForTimeout(350);
    await capture('mobile-form');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.ok(await page.getByRole('dialog').isVisible());
    for (let cycle = 0; cycle < 3; cycle++) {
      if (cycle) await enter.click();
      await dialog.getByLabel('Username').fill('fixture');
      await dialog.getByLabel('Password').fill('fixture');
      const oldVideo = await video.elementHandle();
      await dialog.getByRole('button', { name: 'Masuk workspace' }).click();
      await page.waitForURL('**/check-in');
      await video.waitFor({ state: 'detached' });
      assert.equal(await oldVideo.evaluate(v => v.paused && !v.hasAttribute('src')), true);
      await oldVideo.dispose();
      await page.getByRole('button', { name: 'Lanjutkan ke Pilih Pekerjaan' }).click();
      await page.waitForURL('**/jobs');
      const requestsInWorkspace = mediaRequests.length;
      await page.getByRole('button', { name: 'Menu akun' }).click();
      assert.equal(mediaRequests.length, requestsInWorkspace);
      assert.equal(await video.count(), 0);
      await page.getByText('Logout', { exact: true }).click();
      await page.waitForURL('**/login');
      await page.waitForFunction(() => document.querySelector('video')?.currentTime > .2);
      assert.equal(await video.count(), 1);
    }
    assert.deepEqual(errors, []);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await video.waitFor({ state: 'detached' });
    assert.ok(await page.locator('.night-poster').isVisible());
    await page.close();

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
    await fixture(mobile);
    await mobile.goto(base + '/login');
    await mobile.waitForFunction(() => document.querySelector('video')?.currentTime > .2);
    await mobile.close();

    const light = await browser.newPage({ colorScheme: 'light' });
    let lightRequests = 0;
    light.on('request', request => { if (videoPath(request.url())) lightRequests++; });
    await fixture(light);
    await light.goto(base + '/login');
    await light.getByRole('heading', { name: 'Selamat datang kembali' }).waitFor();
    assert.equal(lightRequests, 0);
    assert.equal(await light.locator('video').count(), 0);
    await light.close();

    const reduced = await browser.newPage({ colorScheme: 'dark', reducedMotion: 'reduce' });
    let reducedRequests = 0;
    reduced.on('request', request => { if (videoPath(request.url())) reducedRequests++; });
    await fixture(reduced);
    await reduced.goto(base + '/login');
    await reduced.locator('.night-poster').waitFor();
    assert.equal(await reduced.locator('video').count(), 0);
    assert.equal(reducedRequests, 0);
    await reduced.close();

    const blocked = await browser.newPage({ colorScheme: 'dark' });
    await blocked.addInitScript(() => {
      HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Fixture autoplay block', 'NotAllowedError'));
    });
    await fixture(blocked);
    await blocked.goto(base + '/login');
    await blocked.waitForFunction(() => {
      const media = document.querySelector('video');
      return media && !media.hasAttribute('src') && media.dataset.playing === 'false';
    });
    assert.ok(await blocked.locator('.night-poster').isVisible());
    console.log('PASS: loop, visibility, modal, login/logout cleanup, mobile layout, light, reduced motion and autoplay fallback.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

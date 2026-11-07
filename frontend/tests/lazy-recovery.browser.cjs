const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HD_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const base = process.env.HD_BUILD_URL || 'http://127.0.0.1:5180';
    for (const [path, chunk, heading] of [['/preview/login', 'PreviewRoutes', 'Selamat datang kembali'], ['/legacy/login', 'LegacyRoutes', 'LOGIN']]) {
      const context = await browser.newContext(); const page = await context.newPage(); page.setDefaultTimeout(10000);
      let blocked = true, attempts = 0;
      await context.route('**/api/**', route => route.abort());
      await context.route(`**/assets/${chunk}-*.js`, route => { attempts++; return blocked ? route.abort() : route.continue(); });
      await page.goto(base + path);
      await page.getByRole('heading', { name: 'Halaman gagal dimuat' }).waitFor(); assert.equal(new URL(page.url()).pathname, path);
      assert.ok(!(await page.getByRole('alert').innerText()).includes('/assets/'));
      blocked = false; await page.getByRole('button', { name: 'Coba lagi', exact: true }).click();
      // Browsers may cache rejected ES imports; explicit reload safely obtains a new document.
      const loaded = await page.getByRole('heading', { name: heading, exact: true }).waitFor({ timeout: 1500 }).then(() => true, () => false);
      if (!loaded) { await page.getByRole('button', { name: 'Muat ulang halaman', exact: true }).click(); await page.getByRole('heading', { name: heading, exact: true }).waitFor(); }
      assert.equal(new URL(page.url()).pathname, path); assert.ok(attempts >= 2);
      await context.close();
    }
    console.log('PASS: Preview/Legacy chunk failure contained, retry/reload recover without URL changes, no raw errors or automatic reload loop.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

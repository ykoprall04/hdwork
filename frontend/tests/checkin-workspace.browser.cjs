const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
(async () => {
  const output = path.join(os.tmpdir(), "hd-checkin-workspace");
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.HD_CHROMIUM_PATH
      ? { executablePath: process.env.HD_CHROMIUM_PATH }
      : {}),
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [],
    api = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/**", (r) => {
    api.push(r.request().url());
    return r.abort();
  });
  const base = process.env.HD_PREVIEW_URL || "http://127.0.0.1:5173";
  const nav = page.getByRole("navigation", { name: "Navigasi preview" });
  await page.goto(base + "/preview/login");
  await page.getByRole("button", { name: "Petugas HD", exact: true }).click();
  await page.waitForURL("**/preview/check-in");
  await page
    .getByRole("heading", {
      name: "Bagaimana kesiapan Anda hari ini?",
      exact: true,
    })
    .waitFor();
  await page.screenshot({
    path: path.join(output, "check-in.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Lanjutkan ke Pilih Pekerjaan", exact: true })
    .click();
  await page.waitForURL("**/preview/jobs");
  assert.equal(
    await page.getByLabel("Status kerja", { exact: true }).inputValue(),
    "ONLINE",
  );
  assert.equal(await page.locator("table").count(), 0);
  await page.reload();
  await page
    .getByRole("heading", {
      name: "Apa yang Anda kerjakan hari ini?",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page.getByLabel("Status kerja", { exact: true }).inputValue(),
    "ONLINE",
  );
  await page.getByRole("link", { name: "HD B2C", exact: false }).click();
  await page
    .getByRole("heading", { name: "Dashboard B2C", exact: true })
    .waitFor();
  assert.equal(await page.locator("table").count(), 0);
  await page.screenshot({
    path: path.join(output, "dashboard-b2c.png"),
    fullPage: true,
  });
  const moduleNav = page.getByRole("navigation", {
    name: "Menu workspace B2C",
  });
  await moduleNav.getByRole("link", { name: "TIAL", exact: true }).click();
  await page
    .getByRole("heading", { name: "Daftar order TIAL", exact: true, level: 1 })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: /^MENUNGGU/ })
      .getAttribute("aria-pressed"),
    "true",
  );
  let pick = page.getByRole("button", { name: "PICK", exact: true }).first();
  await pick.waitFor();
  await page.getByLabel("Status kerja", { exact: true }).selectOption("SIBUK");
  assert.equal(await pick.isDisabled(), true);
  await page
    .getByLabel("Status kerja", { exact: true })
    .selectOption("OFFLINE");
  assert.equal(await pick.isDisabled(), true);
  await page.getByLabel("Status kerja", { exact: true }).selectOption("ONLINE");
  const code = await page.locator("tbody a").first().innerText();
  await pick.click();
  await page.getByLabel("Hasil PICK", { exact: true }).waitFor();
  assert.match(page.url(), /B2C\/TIAL$/);
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page
    .locator("tbody tr")
    .filter({ hasText: code })
    .waitFor({ state: "detached" });
  assert.match(await nav.innerText(), /BARU 1/);
  await moduleNav.getByRole("link", { name: "LOGIC", exact: true }).click();
  await page
    .getByRole("heading", { name: "Daftar order LOGIC", exact: true, level: 1 })
    .waitFor();
  assert.equal(
    await page.locator("tbody tr").filter({ hasText: code }).count(),
    0,
  );
  const second = await page.locator("tbody a").first().innerText();
  await page.getByRole("button", { name: "PICK", exact: true }).first().click();
  await page
    .locator("tbody tr")
    .filter({ hasText: second })
    .waitFor({ state: "detached" });
  assert.match(await nav.innerText(), /BARU 2/);
  await page.reload();
  await page
    .getByRole("heading", { name: "Daftar order LOGIC", exact: true, level: 1 })
    .waitFor();
  assert.match(await nav.innerText(), /BARU 2/);
  assert.equal(
    await page.getByLabel("Status kerja", { exact: true }).inputValue(),
    "ONLINE",
  );
  await nav.getByRole("link", { name: "Pekerjaan Saya", exact: true }).click();
  await page.locator(`[data-order-id="${code}"]`).waitFor();
  assert.equal(
    await page
      .locator(`[data-order-id="${code}"]`)
      .getByText("BARU", { exact: true })
      .count(),
    1,
  );
  assert.equal(
    await page
      .locator(`[data-order-id="${second}"]`)
      .getByText("BARU", { exact: true })
      .count(),
    1,
  );
  await page.screenshot({
    path: path.join(output, "my-work-new.png"),
    fullPage: true,
  });
  await page.locator(`[data-order-id="${code}"]`).click();
  await page.getByRole("heading", { name: code, exact: true }).waitFor();
  await page
    .locator(`[data-order-id="${code}"]`)
    .getByText("BARU", { exact: true })
    .waitFor({ state: "detached" });
  assert.equal(
    await page
      .locator(`[data-order-id="${second}"]`)
      .getByText("BARU", { exact: true })
      .count(),
    1,
  );
  await page
    .getByLabel("Status kerja", { exact: true })
    .selectOption("OFFLINE");
  assert.equal(
    await page.getByRole("button", { name: "DONE", exact: true }).isEnabled(),
    true,
  );
  await page
    .getByLabel("Pesan percakapan", { exact: true })
    .fill("DEMO cek tetap boleh saat OFFLINE");
  await page
    .getByRole("button", { name: "Kirim pesan percakapan", exact: true })
    .click();
  await page
    .getByText("DEMO cek tetap boleh saat OFFLINE", { exact: true })
    .first()
    .waitFor();
  await page.getByRole("button", { name: "DONE", exact: true }).click();
  await page
    .getByRole("heading", { name: "Konfirmasi DONE", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Batal", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "DONE", exact: true }).isEnabled(),
    true,
  );
  await page.getByRole("button", { name: "DONE", exact: true }).click();
  await page
    .getByRole("button", { name: "Konfirmasi DONE", exact: true })
    .click();
  assert.equal(
    await page.getByRole("button", { name: "DONE", exact: true }).isDisabled(),
    true,
  );
  await nav.getByRole("link", { name: "Pekerjaan Saya", exact: true }).click();
  await page.locator(`[data-order-id="${second}"]`).click();
  await page.getByRole("button", { name: "GAGAL", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Lanjutkan", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("textbox", { name: "Alasan kegagalan", exact: true })
    .fill("DEMO wajib alasan");
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await page
    .getByRole("button", { name: "Konfirmasi GAGAL", exact: true })
    .click();
  await page
    .getByText("Alasan GAGAL: DEMO wajib alasan", { exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByText("Alasan GAGAL: DEMO wajib alasan", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Status kerja", { exact: true }).inputValue(),
    "OFFLINE",
  );
  assert.equal(
    await page
      .locator(`[data-order-id="${second}"]`)
      .getByText("BARU", { exact: true })
      .count(),
    0,
  );
  // Navigation and persona changes must not release ownership or mix work status.
  await nav.getByRole("link", { name: "Pilih Pekerjaan", exact: true }).click();
  await page.getByLabel("Status kerja", { exact: true }).selectOption("SIBUK");
  await page.getByRole("link", { name: "HD B2B", exact: false }).click();
  assert.equal(
    await page.getByLabel("Status kerja", { exact: true }).inputValue(),
    "SIBUK",
  );
  await page
    .getByRole("link", { name: "Kembali ke Pilih Pekerjaan", exact: true })
    .click();
  await page
    .getByRole("link", { name: "HD REPLACEMENT", exact: false })
    .click();
  assert.equal(
    await page.getByLabel("Status kerja", { exact: true }).inputValue(),
    "SIBUK",
  );
  await page.getByRole("button", { name: "Logout", exact: true }).click();
  await page.getByRole("button", { name: "Petugas HD", exact: true }).click();
  await page.waitForURL("**/preview/check-in");
  await page.getByRole("button", { name: /^OFFLINE/ }).click();
  await page
    .getByRole("button", { name: "Lanjutkan ke Pilih Pekerjaan", exact: true })
    .click();
  await page.waitForURL("**/preview/jobs");
  await page
    .getByRole("link", { name: "Monitoring Publik", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Login HD · Preview", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Username", exact: true })
    .fill("hd_demo_2");
  await page.getByLabel("Password demo", { exact: true }).fill("dummy");
  await page
    .getByRole("button", { name: "Masuk ke preview", exact: true })
    .click();
  await page.waitForURL("**/preview/check-in");
  await page
    .getByRole("button", { name: "Lanjutkan ke Pilih Pekerjaan", exact: true })
    .click();
  assert.match(await nav.innerText(), /BARU 0/);
  await nav.getByRole("link", { name: "Pekerjaan Saya", exact: true }).click();
  assert.equal(await page.locator(`[data-order-id="${code}"]`).count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(output, "mobile-my-work.png"),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.locator("[data-order-id]").first().click();
  await page
    .getByRole("button", { name: "Kembali ke daftar pekerjaan", exact: true })
    .waitFor();
  await page.screenshot({
    path: path.join(output, "mobile-chat.png"),
    fullPage: false,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  assert.deepEqual(api, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: check-in/refresh/logout, status permissions, B2C monitoring vs separated TIAL/LOGIC, Quick PICK/stay/toast, BARU isolation/persistence, own-work OFFLINE, DONE/GAGAL confirmation, category navigation and mobile; zero API requests/browser errors. " +
      output,
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

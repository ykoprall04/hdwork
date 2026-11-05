const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chooseCategory, allJobs } = require("./preview-navigation.helpers.cjs");
(async () => {
  const output = path.join(os.tmpdir(), "hd-nav-v3");
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.HD_CHROMIUM_PATH
      ? { executablePath: process.env.HD_CHROMIUM_PATH }
      : {}),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    reducedMotion: "reduce",
  });
  page.setDefaultTimeout(10000);
  const api = [],
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/**", (r) => {
    api.push(r.request().url());
    return r.abort();
  });
  const base = process.env.HD_PREVIEW_URL || "http://127.0.0.1:5173";
  await page.goto(base + "/preview/login");
  await page.getByRole("button", { name: "Petugas HD", exact: true }).click();
  await page.waitForURL("**/preview/check-in");
  await page
    .getByRole("button", { name: "Lanjutkan ke Pilih Pekerjaan", exact: true })
    .click();
  await page.waitForURL("**/preview/jobs");
  await page
    .getByRole("heading", {
      name: "Apa yang Anda kerjakan hari ini?",
      exact: true,
    })
    .waitFor();
  const nav = page.getByRole("navigation", { name: "Navigasi preview" });
  assert.equal(await nav.count(), 0);
  assert.equal(await page.locator("table").count(), 0);
  assert.equal(await page.locator("main h2").count(), 4);
  assert.equal(
    await page
      .getByRole("button", { name: "Pilih kategori pekerjaan", exact: true })
      .innerText(),
    "Pilih Pekerjaan",
  );
  await page.screenshot({
    path: path.join(output, "jobs-desktop.png"),
    fullPage: true,
  });
  await chooseCategory(page, "B2C");
  assert.deepEqual(
    await nav
      .getByRole("link")
      .evaluateAll((links) => links.map((a) => a.getAttribute("aria-label"))),
    [
      "Dashboard B2C",
      "TIAL",
      "LOGIC",
      "Pekerjaan Saya",
      "Transfer Order",
      "Produktivitas HD",
      "Monitoring Publik",
    ],
  );
  assert.equal(await page.getByRole("navigation").count(), 1);
  assert.equal(
    await nav
      .getByRole("link", { name: "Pilih Pekerjaan", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page.getByText("Kembali ke Pilih Pekerjaan", { exact: true }).count(),
    0,
  );
  assert.equal(await page.locator("table").count(), 0);
  assert.equal(
    await page
      .getByRole("button", { name: "Pilih kategori pekerjaan", exact: true })
      .innerText(),
    "HD B2C",
  );
  await page
    .getByRole("button", { name: "Pilih kategori pekerjaan", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("menuitemradio", { name: "HD B2C", exact: true })
      .getAttribute("aria-checked"),
    "true",
  );
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: path.join(output, "b2c-desktop.png"),
    fullPage: true,
  });
  await nav.getByRole("link", { name: "TIAL", exact: true }).click();
  await page
    .getByRole("heading", { name: "Daftar order TIAL", level: 1 })
    .waitFor();
  const id = await page.locator("tbody a").first().innerText();
  await page.getByRole("button", { name: "PICK", exact: true }).first().click();
  await page.getByLabel("Hasil PICK", { exact: true }).waitFor();
  assert.match(await nav.innerText(), /BARU 1/);
  await nav.getByRole("link", { name: "LOGIC", exact: true }).click();
  await page
    .getByRole("heading", { name: "Daftar order LOGIC", level: 1 })
    .waitFor();
  assert.equal(
    await page.locator("tbody tr").filter({ hasText: id }).count(),
    0,
  );
  for (const category of ["ASSUREN", "B2B", "REPLACEMENT"]) {
    await chooseCategory(page, category);
    assert.equal(
      await nav
        .getByRole("link", { name: `Dashboard ${category}`, exact: true })
        .count(),
      1,
    );
    assert.equal(
      await nav.getByRole("link", { name: "TIAL", exact: true }).count(),
      0,
    );
    assert.equal(
      await nav.getByRole("link", { name: "LOGIC", exact: true }).count(),
      0,
    );
    assert.equal(
      await page.getByLabel("Status kerja", { exact: true }).inputValue(),
      "ONLINE",
    );
    assert.match(await nav.innerText(), /BARU 1/);
  }
  await nav.getByRole("link", { name: "Pekerjaan Saya", exact: true }).click();
  await page.locator(`[data-order-id="${id}"]`).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Pilih kategori pekerjaan", exact: true })
      .innerText(),
    "HD REPLACEMENT",
  );
  await page.reload();
  await page.locator(`[data-order-id="${id}"]`).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Pilih kategori pekerjaan", exact: true })
      .innerText(),
    "HD REPLACEMENT",
  );
  await chooseCategory(page, "REPLACEMENT");
  await page
    .getByRole("heading", { name: "Dashboard REPLACEMENT", exact: true })
    .waitFor();
  await allJobs(page);
  assert.equal(await nav.count(), 0);
  assert.equal(
    await page
      .getByRole("button", { name: "Pilih kategori pekerjaan", exact: true })
      .innerText(),
    "Pilih Pekerjaan",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(output, "jobs-mobile.png"),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await chooseCategory(page, "B2C");
  await nav.getByRole("link", { name: "TIAL", exact: true }).click();
  await page
    .getByRole("heading", { name: "Daftar order TIAL", level: 1 })
    .waitFor();
  await page.screenshot({
    path: path.join(output, "workspace-mobile.png"),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await nav.getByRole("link", { name: "Pekerjaan Saya", exact: true }).click();
  await page.locator(`[data-order-id="${id}"]`).click();
  await page
    .getByRole("button", { name: "Kembali ke daftar pekerjaan", exact: true })
    .waitFor();
  const picker = page.getByRole("button", {
    name: "Pilih kategori pekerjaan",
    exact: true,
  });
  const box = await picker.boundingBox();
  assert.ok(box && box.y >= 0 && box.y + box.height < 844);
  await page.screenshot({
    path: path.join(output, "chat-mobile.png"),
    fullPage: false,
  });
  await chooseCategory(page, "B2B");
  await page
    .getByRole("heading", { name: "Dashboard B2B", exact: true })
    .waitFor();
  assert.notEqual(
    await page.evaluate(() => document.body.style.overflow),
    "hidden",
    "category navigation must release mobile chat scroll lock",
  );
  assert.equal(
    await page.getByLabel("Status kerja", { exact: true }).inputValue(),
    "ONLINE",
  );
  await page
    .getByRole("button", { name: "Gunakan mode malam", exact: true })
    .click();
  await page.screenshot({
    path: path.join(output, "workspace-dark.png"),
    fullPage: true,
  });
  await allJobs(page);
  await page.getByRole("button", { name: "Logout", exact: true }).click();
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await page
    .getByRole("heading", { name: "Dashboard Admin", level: 1, exact: true })
    .waitFor();
  await chooseCategory(page, "B2C");
  await nav.getByRole("link", { name: "Dashboard Admin", exact: true }).click();
  await page
    .getByRole("heading", { name: "Dashboard Admin", level: 1, exact: true })
    .waitFor();
  assert.deepEqual(api, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: jobs separated, header picker/all jobs/active check, exact B2C menu and no nested nav, every category, unchanged status/PICK/inbox persistence, same-category navigation, desktop/mobile/chat header/dark mode, admin access; zero API calls/browser errors. " +
      output,
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

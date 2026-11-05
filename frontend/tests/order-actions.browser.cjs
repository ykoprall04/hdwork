const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
(async () => {
  const output = path.join(os.tmpdir(), "hd-order-actions");
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
  await page.goto(
    (process.env.HD_PREVIEW_URL || "http://127.0.0.1:5173") + "/preview/login",
  );
  await page.getByRole("button", { name: "Petugas HD", exact: true }).click();
  await page
    .getByRole("button", { name: "Lanjutkan ke Pilih Pekerjaan", exact: true })
    .click();
  await page.getByRole("link", { name: "HD ASSUREN", exact: false }).click();
  await page.locator("tbody tr").first().waitFor();
  assert.equal(await page.locator("th").count(), 6);
  assert.doesNotMatch(await page.locator("thead").innerText(), /Aksi/);
  const pick = page
    .locator("tbody tr")
    .filter({ has: page.getByRole("button", { name: "PICK", exact: true }) })
    .first();
  const code = await pick.locator("a").first().innerText();
  assert.equal(await pick.locator("td").count(), 6);
  assert.equal(
    await pick
      .locator("td")
      .first()
      .getByRole("button", { name: "PICK", exact: true })
      .count(),
    1,
  );
  await pick.getByRole("button", { name: "PICK", exact: true }).click();
  await page.getByRole("button", { name: "Batal", exact: true }).click();
  assert.equal(
    await pick.getByRole("button", { name: "PICK", exact: true }).count(),
    1,
  );
  await pick.getByRole("button", { name: "PICK", exact: true }).click();
  await page.getByRole("button", { name: "Konfirmasi", exact: true }).click();
  const pickedRow = page.locator("tbody tr").filter({ hasText: code });
  await pickedRow.getByRole("link", { name: "Buka", exact: true }).waitFor();
  await page.screenshot({
    path: path.join(output, "dashboard-pick.png"),
    fullPage: true,
  });
  await pickedRow.getByRole("link", { name: "Buka", exact: true }).click();
  await page.getByRole("heading", { name: code, exact: true }).waitFor();
  await page
    .getByText("🟡 Data di cek Alya Demo", { exact: true })
    .first()
    .waitFor();
  const chat = page.getByLabel(`Percakapan ${code}`, { exact: true });
  assert.ok(
    await chat
      .locator("[data-message-order]")
      .evaluateAll((rows) =>
        rows.every(
          (r) => r.dataset.messageOrder === rows[0].dataset.messageOrder,
        ),
      ),
  );
  await page.getByRole("button", { name: "ESKALASI", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Lanjutkan", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByLabel("Tujuan eskalasi", { exact: true }).fill("Tim Demo");
  await page
    .getByLabel("Keterangan eskalasi", { exact: true })
    .fill("Perlu bantuan lanjutan");
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await page
    .getByRole("button", { name: "Konfirmasi ESKALASI", exact: true })
    .click();
  await page
    .getByText("Dieskalasi · 1×", { exact: true })
    .filter({ visible: true })
    .first()
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "DONE", exact: true }).isEnabled(),
    true,
  );
  await page
    .getByLabel("Pesan percakapan", { exact: true })
    .fill("MASIH BISA CEK SETELAH ESKALASI");
  await page
    .getByRole("button", { name: "Kirim pesan percakapan", exact: true })
    .click();
  await chat
    .getByText("MASIH BISA CEK SETELAH ESKALASI", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "ESKALASI", exact: true }).click();
  await page.getByLabel("Tujuan eskalasi", { exact: true }).fill("Tim Kedua");
  await page
    .getByLabel("Keterangan eskalasi", { exact: true })
    .fill("Eskalasi berikutnya");
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await page
    .getByRole("button", { name: "Konfirmasi ESKALASI", exact: true })
    .click();
  await page
    .getByText("Dieskalasi · 2×", { exact: true })
    .filter({ visible: true })
    .first()
    .waitFor();
  await page.getByRole("button", { name: "GAGAL", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Lanjutkan", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("textbox", { name: "Alasan kegagalan", exact: true })
    .fill("DEMO alasan gagal");
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await page
    .getByRole("button", { name: "Konfirmasi GAGAL", exact: true })
    .click();
  await page
    .getByText("Alasan GAGAL: DEMO alasan gagal", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "DONE", exact: true }).isDisabled(),
    true,
  );
  await chat
    .getByText("MASIH BISA CEK SETELAH ESKALASI", { exact: true })
    .waitFor();
  await page.screenshot({
    path: path.join(output, "chat-outcomes.png"),
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Detail & tindakan →", exact: true })
    .click();
  await page.getByLabel("Alasan Reopen").fill("Uji reopen");
  await page.getByRole("button", { name: "Reopen order", exact: true }).click();
  await page.getByRole("link", { name: "Pekerjaan Saya", exact: true }).click();
  await page.locator(`[data-order-id="${code}"]`).click();
  await page.getByRole("button", { name: "DONE", exact: true }).click();
  await page
    .getByRole("button", { name: "Konfirmasi DONE", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "ESKALASI", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("button", { name: "Pekerjaan Aktif", exact: true })
    .click();
  await page
    .locator(`[data-order-id="${code}"]`)
    .waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Riwayat", exact: true }).click();
  await page.locator(`[data-order-id="${code}"]`).waitFor();
  // Logout/persona switch preserves state; takeover must record a different active owner.
  await page
    .getByRole("link", { name: "Pilih Pekerjaan", exact: true })
    .click();
  await page.getByRole("link", { name: "HD ASSUREN", exact: false }).click();
  await page.getByLabel("Status order").selectOption("PROSES CEK");
  const takeover = page
    .locator("tbody tr")
    .filter({
      has: page.getByRole("button", { name: "Ambil Alih", exact: true }),
    })
    .first();
  await takeover.waitFor();
  const takenCode = await takeover.locator("a").first().innerText();
  await takeover
    .getByRole("button", { name: "Ambil Alih", exact: true })
    .click();
  await page.getByRole("button", { name: "Konfirmasi", exact: true }).click();
  await page
    .locator("tbody tr")
    .filter({ hasText: takenCode })
    .getByRole("link", { name: "Buka", exact: true })
    .waitFor();
  // All dashboard scopes retain six columns and terminal/duplicate rows have no pick controls.
  for (const [category, module] of [
    ["B2C", null],
    ["B2C", "TIAL"],
    ["B2C", "LOGIC"],
    ["ASSUREN", null],
    ["B2B", null],
    ["REPLACEMENT", null],
  ]) {
    await page
      .getByRole("link", { name: "Pilih Pekerjaan", exact: true })
      .click();
    await page
      .getByRole("link", { name: `HD ${category}`, exact: false })
      .click();
    if (category === "B2C" && !module) {
      assert.equal(await page.locator("table").count(), 0);
      continue;
    }
    if (module)
      await page
        .getByRole("navigation", { name: "Menu workspace B2C" })
        .getByRole("link", { name: module, exact: true })
        .click();
    await page.locator("tbody tr").first().waitFor();
    assert.equal(await page.locator("th").count(), 6);
    for (const status of ["DONE", "GAGAL", "DUPLICATE"]) {
      await page.getByLabel("Status order").selectOption(status);
      assert.equal(
        await page.getByRole("button", { name: "PICK", exact: true }).count(),
        0,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Ambil Alih", exact: true })
          .count(),
        0,
      );
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Status order").selectOption("MENUNGGU");
  await page.screenshot({
    path: path.join(output, "dashboard-mobile.png"),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.getByRole("link", { name: "Pekerjaan Saya", exact: true }).click();
  await page.locator("[data-order-id]").first().click();
  await page.getByRole("button", { name: "ESKALASI", exact: true }).click();
  await page.getByLabel("Tujuan eskalasi", { exact: true }).fill("Tim Mobile");
  await page.getByLabel("Keterangan eskalasi", { exact: true }).fill("Uji HP");
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await page
    .getByRole("button", { name: "Konfirmasi ESKALASI", exact: true })
    .click();
  await page
    .getByText("Dieskalasi · 1×", { exact: true })
    .filter({ visible: true })
    .first()
    .waitFor();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.screenshot({
    path: path.join(output, "chat-mobile.png"),
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
    "PASS: PICK/cancel/Buka/takeover, six unchanged columns across six scopes, no terminal/duplicate pick, DONE/GAGAL/reopen/history, required failure/escalation forms, repeated escalation with continued chat, desktop/mobile, zero API requests/browser errors. Screenshots: " +
      output,
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

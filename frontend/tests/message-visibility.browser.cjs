const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
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
  await page.route("**/api/**", (r) => r.abort());
  await page.goto(
    (process.env.HD_PREVIEW_URL || "http://127.0.0.1:5173") + "/preview/login",
  );
  await page.getByRole("button", { name: "Petugas HD", exact: true }).click();
  await page
    .getByRole("button", { name: "Lanjutkan ke Pilih Pekerjaan", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Navigasi preview" })
    .getByRole("link", { name: "Pekerjaan Saya", exact: true })
    .click();
  await page.locator("[data-order-id]").first().waitFor();
  const id = await page
    .locator("[data-order-id]")
    .first()
    .getAttribute("data-order-id");
  await page
    .getByLabel("Order simulasi pesan", { exact: true })
    .selectOption(id);
  for (let i = 0; i < 12; i++)
    await page
      .getByRole("button", { name: "Pesan Telegram Masuk", exact: true })
      .click();
  const row = page.locator(`[data-order-id="${id}"]`);
  assert.equal(
    await row.locator('[aria-label$="pesan belum dibaca"]').innerText(),
    "12",
  );
  await row.click();
  const chat = page.getByLabel(`Percakapan ${id}`, { exact: true });
  await chat.waitFor();
  await chat.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.waitForFunction((orderId) => {
    const row = document.querySelector(`[data-order-id="${orderId}"]`);
    const badge = row?.querySelector('[aria-label$="pesan belum dibaca"]');
    return (
      badge && Number(badge.textContent) > 0 && Number(badge.textContent) < 12
    );
  }, id);
  let unread = Number(
    await row.locator('[aria-label$="pesan belum dibaca"]').innerText(),
  );
  assert.ok(
    unread > 0 && unread < 12,
    "opening chat must not mark older off-screen messages read",
  );
  await page.reload();
  await chat.waitFor();
  await page.waitForFunction(
    (orderId) => !!document.querySelector(`[data-order-id="${orderId}"]`),
    id,
  );
  assert.ok(
    Number(
      await row.locator('[aria-label$="pesan belum dibaca"]').innerText(),
    ) > 0,
  );
  await page.getByRole("button", { name: /pesan belum dilihat$/ }).click();
  await page.waitForFunction(
    ({ orderId, previous }) => {
      const badge = document.querySelector(
        `[data-order-id="${orderId}"] [aria-label$="pesan belum dibaca"]`,
      );
      return !badge || Number(badge.textContent) < previous;
    },
    { orderId: id, previous: unread },
  );
  console.log(
    "PASS: only viewport-visible messages read, older unseen messages remain unread after opening and refresh, jump-to-unread marks newly viewed messages.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

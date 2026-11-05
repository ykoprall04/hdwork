async function chooseCategory(page, category) {
  await page
    .getByRole("button", { name: "Pilih kategori pekerjaan", exact: true })
    .click();
  await page
    .getByRole("menuitemradio", { name: `HD ${category}`, exact: true })
    .click();
  await page.getByRole("menu").waitFor({ state: "hidden" });
  await page.waitForURL(`**/preview/work/${category}`);
  await page
    .getByRole("heading", {
      name: `Dashboard ${category}`,
      level: 1,
      exact: true,
    })
    .waitFor();
}
async function allJobs(page) {
  await page
    .getByRole("button", { name: "Pilih kategori pekerjaan", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Lihat Semua Pekerjaan", exact: true })
    .click();
  await page.waitForURL("**/preview/jobs");
  await page
    .getByRole("heading", {
      name: "Apa yang Anda kerjakan hari ini?",
      exact: true,
    })
    .waitFor();
}
module.exports = { chooseCategory, allJobs };

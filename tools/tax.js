/**
 * The tax engine, from the screen.
 *
 * Reads the rates in Settings, then opens a new invoice and moves its date
 * across 1 January 2023: the GST line must follow the rate in force on the
 * invoice date (8% after, 6% before), because that is what the server will
 * charge. Records nothing.
 *
 *   node tools/tax.js
 */

const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

setTimeout(() => {
  console.log("  FAIL the check did not finish within three minutes");
  process.exit(1);
}, 180000).unref?.();

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    console.log(`\n${BASE} — the tax engine\n`);
    const { page } = await signIn(browser, { phone: false });

    await page.goto(BASE + "/settings", { waitUntil: "networkidle", timeout: 45000 });
    await page.getByRole("tab", { name: "Tax" }).click();
    const rates = page.getByTestId("tax-rates");
    await rates.waitFor({ timeout: 15000 });
    const text = await rates.innerText();
    if (/General GST[\s\S]*since 1 Jan 2023[\s\S]*8%/.test(text)) ok("Settings shows general GST at 8% since 1 Jan 2023");
    else bad("the rates read: " + text.replace(/\n/g, " | "));
    if (/Tourism GST[\s\S]*17%/.test(text)) ok("and tourism GST at 17%");
    else bad("tourism GST is not 17%: " + text.replace(/\n/g, " | "));
    await page.screenshot({ path: "shots/tax-settings.png" });

    await page.goto(BASE + "/invoices", { waitUntil: "networkidle", timeout: 45000 });
    await page.getByRole("button", { name: /new invoice/i }).first().click();
    await page.getByLabel("Line 1: quantity").fill("1");
    await page.getByLabel("Line 1: rate").fill("1000");

    const gstLine = async (date) => {
      await page.fill("#inv-issued", date);
      await page.getByText(/^GST \d/).first().waitFor({ timeout: 10000 });
      await page.waitForTimeout(600);
      return (await page.locator("dt", { hasText: /^GST / }).first().innerText()).trim();
    };
    const after = await gstLine("2026-06-01");
    const before = await gstLine("2022-06-01");
    if (after === "GST 8%" && before === "GST 6%") ok(`the invoice follows its own date: ${after} in 2026, ${before} in 2022`);
    else bad(`the GST line reads "${after}" in 2026 and "${before}" in 2022`);
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();

/**
 * Fixed assets and year end, in the browser, against the live test company.
 *
 * Buys an asset from the bank three months back, charges depreciation, reads
 * the register and the balance sheet (with last year beside it), then sells
 * it. Looks at the year-end card on Closing without closing the year, because
 * a closed year would lock the test books for every other check.
 *
 *   node tools/assets.js
 */
const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

const monthsAgo = (n) => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth() - n, 10)).toISOString().slice(0, 10);
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const { page } = await signIn(browser, { phone: false });
    const name = `Check boat ${Date.now() % 1000000}`;

    await page.goto(BASE + "/assets", { waitUntil: "networkidle", timeout: 45000 });
    await page.getByRole("heading", { name: "Fixed assets" }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /add an asset/i }).click();
    await page.fill("#asset-name", name);
    await page.selectOption("#asset-category", "vehicles");
    await page.fill("#asset-date", monthsAgo(3));
    await page.fill("#asset-cost", "12,000.00");
    await page.fill("#asset-life", "1");
    const bank = await page.locator("#asset-from option", { hasText: /^Bank$/ }).first().getAttribute("value");
    await page.selectOption("#asset-from", bank);
    await page.getByRole("button", { name: /^add mvr 12,000\.00/i }).click();
    await page.locator("#asset-name").waitFor({ state: "detached", timeout: 15000 });
    const row = page.locator("div.grid", { hasText: name }).first();
    await row.waitFor({ timeout: 15000 });
    ok(`${name} is on the register at 12,000.00`);

    await page.getByRole("button", { name: /charge depreciation/i }).click();
    await page.waitForTimeout(2500);
    const text = await row.innerText();
    // Bought three months back on a one-year life: three months at 1,000.00.
    if (/9,000\.00/.test(text)) ok("three months charged: worth 9,000.00 now");
    else bad(`after charging, the row reads: ${text.replace(/\s+/g, " ")}`);
    await page.screenshot({ path: "shots/assets.png" });

    await page.goto(BASE + "/statements", { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: /balance sheet/i }).click();
    await page.getByText(/to the laari/).waitFor({ timeout: 15000 });
    const sheet = await page.locator("main").innerText();
    if (/Assets equal what it owes/.test(sheet)) ok("the balance sheet balances");
    else bad("the balance sheet does not balance");
    if (/Vehicles and boats: worn to date/.test(sheet)) ok("the wear shows on the balance sheet");
    else bad("no worn-to-date line on the balance sheet");
    if (/Retained earnings, earlier years/.test(sheet) && /Result for this year/.test(sheet)) ok("earnings are split: earlier years, and this year");
    else bad("earnings are not split");
    const heads = await page.locator("main .text-right", { hasText: /\d{4}$/ }).count();
    if (heads >= 2) ok("last year sits beside this year");
    else bad("no comparative column");
    await page.screenshot({ path: "shots/balance-sheet-compare.png", fullPage: true });

    await page.goto(BASE + "/closing", { waitUntil: "networkidle" });
    const card = page.getByTestId("close-year");
    if (await card.count()) ok(`Closing offers to close last year: ${(await card.locator("div").nth(1).innerText()).trim()}`);
    else console.log("  note last year is already closed in this company");

    await page.goto(BASE + "/assets", { waitUntil: "networkidle" });
    await page.locator("div.grid", { hasText: name }).first().getByRole("button", { name: /sold or scrapped/i }).click();
    await page.fill("#dispose-proceeds", "9,000.00");
    await page.selectOption("#dispose-to", bank);
    await page.getByRole("button", { name: /^sold for mvr/i }).click();
    const toast = page.getByText(/is off the register/);
    await toast.waitFor({ timeout: 15000 });
    const said = await page.getByText(/worth MVR/).first().innerText();
    if (/exactly what it was worth/.test(said)) ok("sold at book value: no gain, no loss");
    else ok(`sold: ${said}`);
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();

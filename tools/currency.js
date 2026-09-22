/**
 * Dollar invoices and month-end revaluation, in the browser, live.
 *
 * Raises a USD invoice at 15.40 through the invoice sheet, puts it in the
 * books, receives it in dollars at 15.42 through the payment sheet and reads
 * the exchange gain, then looks at the foreign-money card on Closing.
 *
 *   node tools/currency.js
 */
const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const { page } = await signIn(browser, { phone: false });
    const who = `Dollar check ${Date.now() % 1000000}`;

    await page.goto(BASE + "/invoices?new=1", { waitUntil: "networkidle", timeout: 45000 });
    await page.locator("#inv-customer").waitFor({ timeout: 15000 });
    await page.fill("#inv-customer", who);
    await page.selectOption("#inv-currency", "USD");
    await page.fill("#inv-rate", "15.40");
    await page.getByPlaceholder("Excavator rental, Komatsu PC 56-7").first().fill("Dollar check");
    await page.getByPlaceholder("3,000.00").first().fill("100.00");
    const save = page.getByRole("button", { name: /^save .* · usd/i });
    await save.waitFor({ timeout: 10000 });
    ok(`the invoice sheet totals in dollars: ${(await save.innerText()).trim()}`);
    await save.click();
    await page.locator("#inv-customer").waitFor({ state: "detached", timeout: 15000 });

    const row = page.locator("div.grid", { hasText: who }).first();
    await row.waitFor({ timeout: 15000 });
    const rowText = await row.innerText();
    if (/USD/.test(rowText) && /at 15\.4/.test(rowText)) ok("the list shows it in dollars, with its rufiyaa at 15.40");
    else bad(`the row reads: ${rowText.replace(/\s+/g, " ")}`);

    await row.getByRole("button", { name: /^put in the books$/i }).first().click();
    await page.waitForTimeout(2500);
    const receiveBtn = page.locator("div.grid", { hasText: who }).first().getByRole("button", { name: /^money in$/i }).first();
    await receiveBtn.click({ timeout: 15000 });
    await page.locator("#receive-rate").waitFor({ timeout: 10000 });
    ok("paying it asks for dollars and the day's rate");
    await page.fill("#receive-rate", "15.42");
    await page.getByRole("button", { name: /^received usd/i }).click();
    const said = page.getByText(/exchange gain of MVR/).first();
    const gained = await said.waitFor({ timeout: 15000 }).then(() => said.innerText(), () => null);
    if (gained) ok(`paid at 15.42: ${gained.trim()}`);
    else bad("no exchange gain was said on payment");

    await page.goto(BASE + "/closing", { waitUntil: "networkidle" });
    const card = page.getByTestId("revalue");
    if (await card.waitFor({ timeout: 10000 }).then(() => true, () => false)) ok("Closing offers to restate foreign money before the month is closed");
    else console.log("  note nothing foreign is open in this company at the next month end");
    await page.screenshot({ path: "shots/currency-closing.png", fullPage: true });
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();

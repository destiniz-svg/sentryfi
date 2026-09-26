/**
 * Loans, in the browser, against the live test company.
 *
 * Adds a small bank loan into the bank, records its first repayment at the
 * scheduled amount, and checks the split and that the balance sheet balances.
 * Then a flat-rate loan, to see the real rate said beside it.
 *
 *   node tools/loans.js
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
    const tag = Date.now() % 1000000;
    const name = `Check loan ${tag}`;

    await page.goto(BASE + "/loans", { waitUntil: "networkidle", timeout: 45000 });
    await page.getByRole("heading", { name: "Loans" }).waitFor({ timeout: 15000 });

    const add = async (fields) => {
      await page.getByRole("button", { name: /add a loan/i }).click();
      await page.selectOption("#loan-kind", fields.kind);
      await page.fill("#loan-name", fields.name);
      await page.fill("#loan-principal", fields.principal);
      await page.fill("#loan-rate", fields.rate);
      await page.selectOption("#loan-basis", fields.basis);
      await page.fill("#loan-term", fields.term);
      const bank = await page.locator("#loan-into option", { hasText: /^Bank$/ }).first().getAttribute("value");
      await page.selectOption("#loan-into", bank);
      await page.getByRole("button", { name: new RegExp(`^add mvr ${fields.principal.replace(/[.,]/g, "\\$&")}`, "i") }).click();
      await page.locator("#loan-name").waitFor({ state: "detached", timeout: 15000 });
    };

    await add({ kind: "bank_term", name, principal: "12,000.00", rate: "12", basis: "reducing", term: "12" });
    const card = page.getByTestId("loan").filter({ hasText: name });
    await card.waitFor({ timeout: 15000 });
    if (/12,000\.00/.test(await card.innerText())) ok(`${name} owes 12,000.00`);
    else bad("the new loan does not show 12,000.00 owed");

    await card.getByRole("button", { name: /record a repayment/i }).click();
    const bank = await page.locator("#repay-from option", { hasText: /^Bank$/ }).first().getAttribute("value");
    await page.selectOption("#repay-from", bank);
    await page.getByRole("button", { name: /^record mvr/i }).click();
    await page.locator("#repay-amount").waitFor({ state: "detached", timeout: 15000 });
    await page.waitForTimeout(1000);
    // Paid the same day it was borrowed: no days have passed, so no interest,
    // and the whole instalment came off the debt.
    const after = await card.innerText();
    if (/1 payment/.test(after) && /10,933.81/.test(after)) ok("repaid the same day: all of it off the debt, 10,933.81 still owed");
    else bad(`after repaying, the card reads: ${after.replace(/\s+/g, " ").slice(0, 240)}`);
    await page.screenshot({ path: "shots/loans.png", fullPage: true });

    await add({ kind: "other", name: `Check flat ${tag}`, principal: "10,000.00", rate: "6", basis: "flat", term: "36" });
    const flat = page.getByTestId("loan").filter({ hasText: `Check flat ${tag}` });
    await flat.waitFor({ timeout: 15000 });
    const line = await page.getByText(/6% flat — really about/).first().innerText();
    const eff = Number((line.match(/about ([\d.]+)%/) || [])[1]);
    if (eff > 10.5 && eff < 11.5) ok(`"6% flat" is said to really cost ${eff}% a year`);
    else bad(`the flat rate reads: ${line}`);

    await page.goto(BASE + "/statements", { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: /balance sheet/i }).click();
    await page.getByText(/to the laari/).waitFor({ timeout: 15000 });
    const sheet = await page.locator("main").innerText();
    if (/Assets equal what it owes/.test(sheet)) ok("the balance sheet balances");
    else bad("the balance sheet does not balance");
    if (sheet.includes(`Loan: ${name}`)) ok("the loan is on the balance sheet as owed");
    else bad("the loan is not on the balance sheet");
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();

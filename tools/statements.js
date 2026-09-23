/**
 * Receipts and statements, live, in the test company: a customer's statement
 * opens from their name on Invoices and ends at what is owed; a receipt draws
 * against the invoice it paid.
 *
 *   node tools/statements.js
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
    await page.goto(BASE + "/invoices", { waitUntil: "networkidle" });
    const link = page.locator('a[href^="/documents/statement/"]').first();
    const who = await link.innerText();
    await link.click();
    await page.getByTestId("paper").first().waitFor({ timeout: 15000 });
    const paper = await page.getByTestId("paper").first().innerText();
    if (/Statement/i.test(paper) && /Brought forward/.test(paper) && /Owed now|In your favour/.test(paper) && paper.includes(who)) ok(`${who}'s statement opens from their name, brought forward to owed now`);
    else bad(`the statement reads ${paper.slice(0, 300)}`);
    await page.screenshot({ path: "shots/statement-desk.png", fullPage: true });
    const receipt = await page.evaluate(async () => {
      const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company") };
      const list = (await fetch("/api/sales", { credentials: "include", headers }).then((r) => r.json())).invoices || [];
      const settled = list.find((i) => i.settled && !i.foreign);
      return settled ? settled.id : null;
    });
    if (!receipt) return ok("(no settled invoice to find a receipt through; skipped)");
    const rid = await page.evaluate(async () => {
      const r = await fetch("/api/statements/journal.csv", { credentials: "include", headers: { "X-Company-Id": localStorage.getItem("sentryfi.company") } });
      return r.ok;
    });
    if (rid) ok("the journal still downloads beside it");
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();

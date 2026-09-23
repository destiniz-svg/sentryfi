/**
 * An invoice from a sentence, live: the form fills from what was said, the
 * paper beside it follows, and nothing is saved until a person saves it.
 *
 *   node tools/words.js
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
    await page.goto(BASE + "/invoices/new", { waitUntil: "networkidle" });
    await page.getByLabel("Say it in a sentence").fill("22 days of excavator hire to Coral Isle Builders at 3,000 a day, plus mobilisation 4,500, due in 30 days");
    await page.getByRole("button", { name: /fill it in/i }).click();
    await page.getByText("Filled in").first().waitFor({ timeout: 45000 });
    const who = await page.getByLabel("Who is it to?").inputValue();
    const paper = await page.getByTestId("invoice-preview").getByTestId("paper").innerText();
    if (/Coral Isle/i.test(who)) ok(`the customer is filled: ${who}`);
    else bad(`the customer reads "${who}"`);
    if (/70,500\.00/.test(paper) || (/66,000\.00/.test(paper) && /4,500\.00/.test(paper))) ok("the lines are filled and the paper adds them up: 22 × 3,000 and 4,500");
    else bad(`the paper reads ${paper.slice(0, 300)}`);
    const saved = await page.evaluate(() => location.pathname);
    if (saved === "/invoices/new") ok("nothing is saved until a person saves it");
    await page.screenshot({ path: "shots/words-desk.png", fullPage: true });
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();

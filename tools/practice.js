/**
 * The practice view, live. No screenshot: this account keeps real books, and
 * real figures never go into a picture. It checks that the page draws a card
 * for every company the server lists, and that "Open its books" on the test
 * company opens it.
 *
 *   node tools/practice.js
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
    await page.goto(BASE + "/practice", { waitUntil: "networkidle" });
    const listed = await page.evaluate(async () => (await fetch("/api/practice", { credentials: "include" }).then((r) => r.json())).companies.length);
    await page.getByTestId("practice-company").first().waitFor({ timeout: 20000 });
    const cards = await page.getByTestId("practice-company").count();
    if (cards === listed && cards > 1) ok(`a card for each of the ${cards} companies`);
    else bad(`${cards} cards for ${listed} companies`);
    const card = page.getByTestId("practice-company").filter({ has: page.getByRole("heading", { name: "Sentryfi Checks", exact: true }) });
    await card.getByRole("button", { name: /open its books/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 10000 });
    const now = await page.evaluate(() => localStorage.getItem("sentryfi.company"));
    const checks = await page.evaluate(async () => (await fetch("/api/companies", { credentials: "include" }).then((r) => r.json())).companies.find((c) => c.name === "Sentryfi Checks").id);
    if (now === checks) ok("Open its books opens that company");
    else bad("Open its books opened another company");
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();

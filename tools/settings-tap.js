/**
 * Every page opens on the first tap, with no refresh, at a desk and on a phone.
 *
 * A page that has not been fetched yet used to suspend in the middle of its
 * fade-in and stay invisible: the heading was in the page, at opacity 0. So
 * this reads what a person sees: the heading's opacity through every
 * ancestor, two seconds after the tap.
 *
 *   node tools/settings-tap.js
 */
const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

const DESK = ["/settings", "/bank", "/statements", "/closing", "/tax", "/invoices", "/figures", "/settings"];

const seen = (page) =>
  page.evaluate(() => {
    const h = document.querySelector("main h1") || document.querySelector("h1");
    if (!h) return 0;
    let o = 1;
    for (let n = h; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    return o;
  });

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    for (const phone of [true, false]) {
      const { page } = await signIn(browser, { phone });
      await page.goto(BASE + "/dashboard", { waitUntil: "networkidle", timeout: 45000 });
      const paths = phone ? ["/settings"] : DESK;
      for (const path of paths) {
        await page.locator(`a[href="${path}"]`).first().click();
        await page.waitForURL(`**${path}`, { timeout: 10000 });
        // Wait for the screen itself, not just the address: a page still
        // fetching its figures has no heading to measure yet.
        await page.locator("main h1").first().waitFor({ timeout: 15000 });
        await page.waitForTimeout(1500);
        const o = await seen(page);
        const where = `${phone ? "phone" : "desk"} ${path}`;
        if (o > 0.99) ok(`${where} is visible on the first tap`);
        else bad(`${where} is at opacity ${o.toFixed(2)} two seconds after the tap`);
      }
      await page.screenshot({ path: `shots/settings-tap-${phone ? "phone" : "desk"}.png` });
    }
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();

/**
 * Dhivehi, live: the page turns right to left, the rail and Home read in
 * Thaana, every figure stays left to right, and a phone still does not slide.
 *
 *   node tools/dhivehi.js
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
    for (const phone of [false, true]) {
      const { page } = await signIn(browser, { phone });
      await page.evaluate(() => localStorage.setItem("sentryfi.lang", "dv"));
      await page.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      const r = await page.evaluate(() => {
        const nums = [...document.querySelectorAll(".tabular")].slice(0, 20);
        return {
          dir: document.documentElement.dir,
          thaana: /[ހ-޿]/.test(document.body.innerText),
          numbersLtr: nums.length > 0 && nums.every((n) => getComputedStyle(n).direction === "ltr"),
          wide: document.documentElement.scrollWidth > window.innerWidth,
        };
      });
      const where = phone ? "on a phone" : "on the desk";
      if (r.dir === "rtl" && r.thaana) ok(`${where}, the page reads right to left, in Thaana`);
      else bad(`${where}: dir ${r.dir}, Thaana ${r.thaana}`);
      if (r.numbersLtr) ok(`${where}, every figure stays left to right`);
      else bad(`${where}, a figure turned round`);
      if (!r.wide) ok(`${where}, nothing slides sideways`);
      else bad(`${where}, the page is wider than the screen`);
      await page.screenshot({ path: `shots/dhivehi-${phone ? "phone" : "desk"}.png` });
      await page.evaluate(() => localStorage.setItem("sentryfi.lang", "en"));
    }
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();

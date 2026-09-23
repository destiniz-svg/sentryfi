/**
 * Analytics, live, on the demo company (made-up books): the page loads for
 * the year so far, a figure opens onto entries that add up to it, tapping a
 * month looks at that month, and the phone has no sideways scroll.
 *
 *   DEMO_PASSWORD=... node tools/analytics.js
 */
const { chromium } = require("playwright");
const { BASE } = require("./session");

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};
const digits = (t) => (String(t).match(/-?[\d,]+\.\d{2}/) || [""])[0];

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    for (const phone of [false, true]) {
      const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 60000 });
      await page.fill("input[type=email]", "demo@sentryfi.app");
      await page.fill("input[type=password]", process.env.DEMO_PASSWORD);
      await page.click("button[type=submit]");
      await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 45000 });
      await page.goto(BASE + "/analytics", { waitUntil: "networkidle", timeout: 45000 });
      await page.getByTestId("kpi-income").waitFor({ timeout: 20000 });
      await page.waitForTimeout(1200);
      const where = phone ? "phone" : "desk";
      await page.screenshot({ path: `shots/analytics-${where}.png`, fullPage: true });

      if (!phone) {
        const income = digits(await page.getByTestId("kpi-income").innerText());
        await page.getByTestId("kpi-income").click();
        const total = digits(await page.getByTestId("entries-total").innerText());
        if (income && income === total) ok(`income ${income} opens onto entries that add up to ${total}`);
        else bad(`income reads ${income}, its entries add up to ${total}`);
        await page.screenshot({ path: "shots/analytics-entries.png" });
        await page.keyboard.press("Escape");

        const cost = page.locator("section[aria-labelledby=where-it-went] li button").first();
        const costText = digits(await cost.innerText());
        await cost.click();
        const costTotal = digits(await page.getByTestId("entries-total").innerText());
        if (costText === costTotal) ok(`the biggest cost ${costText} opens onto entries that add up to it`);
        else bad(`the biggest cost reads ${costText}, its entries ${costTotal}`);
        await page.keyboard.press("Escape");

        await page.getByRole("button", { name: /^August 2026:/ }).click();
        await page.getByRole("tab", { name: "August 2026" }).waitFor({ timeout: 10000 });
        await page.waitForTimeout(1500);
        const said = await page.getByText(/against the/).innerText();
        if (/Aug 2026|August 2026/.test(said)) ok(`tapping August looks at August: "${said.slice(0, 70)}…"`);
        else bad(`after tapping August the page says: ${said}`);
        await page.screenshot({ path: "shots/analytics-august.png", fullPage: true });
      } else {
        const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        if (!wide) ok("on a phone the page fits, with no sideways scroll");
        else bad("on a phone the page scrolls sideways");
      }
      await ctx.close();
    }
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();

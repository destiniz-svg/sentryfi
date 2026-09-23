/** Screenshots for a design review: desk and phone, the pages people use most. node tools/review-shots.js [paths...] */
const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");
const PAGES = process.argv.slice(2).length ? process.argv.slice(2) : ["/dashboard", "/branding", "/invoices", "/invoices/new", "/bills", "/orders", "/bank", "/figures", "/cfo", "/statements", "/settings", "/more", "/stock", "/projects"];
(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  for (const phone of [false, true]) {
    const { page } = await signIn(browser, { phone });
    for (const p of PAGES) {
      if (!phone && p === "/more") continue;
      await page.goto(BASE + p, { waitUntil: "networkidle" }).catch(() => {});
      await page.waitForTimeout(1200);
      const name = (p.replace(/\//g, "_") || "_home") + (phone ? "-phone" : "-desk");
      await page.screenshot({ path: `shots/review/${name}.png`, fullPage: !phone || p !== "/branding" ? true : true });
    }
  }
  await browser.close();
})();

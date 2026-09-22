/**
 * The desk shell: the grouped rail, the breadcrumb bar, one yellow action.
 *
 * At 1280 wide the rail carries its section labels and marks the page you are
 * on; at tablet width it keeps its icons; the bar names where you are; and no
 * page header carries more than one filled (yellow) button.
 *
 *   node tools/desk.js
 */
const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

const PAGES = [
  ["/dashboard", "Needs you › What needs you"],
  ["/bills", "Money › Bills"],
  ["/invoices", "Money › Invoices"],
  ["/bank", "Money › Bank and cash"],
  ["/statements", "The books › Statements"],
  ["/settings", "Company › Settings"],
];

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const { page } = await signIn(browser, { phone: false });
    for (const [path, want] of PAGES) {
      await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 45000 });
      await page.locator("main h1").first().waitFor({ timeout: 15000 });
      const crumbs = (await page.locator('nav[aria-label="Breadcrumb"] li').allInnerTexts()).map((t) => t.trim()).join(" › ");
      if (crumbs === want) ok(`${path}: the bar reads ${crumbs}`);
      else bad(`${path}: the bar reads "${crumbs}", wanted "${want}"`);

      const current = await page.locator('nav[aria-label="Sections"] a[aria-current="page"], aside a[aria-current="page"]').first().getAttribute("aria-label").catch(() => null);
      if (current && want.endsWith(current)) ok(`${path}: the rail marks ${current}`);
      else bad(`${path}: the rail marks ${current}`);

      // One filled action per page: count yellow buttons in the page itself.
      const yellow = await page.evaluate(() => {
        const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
        const probe = document.createElement("div");
        probe.style.color = accent;
        document.body.appendChild(probe);
        const want = getComputedStyle(probe).color;
        probe.remove();
        return [...document.querySelectorAll("main button, main a")].filter(
          (b) => b.offsetParent && getComputedStyle(b).backgroundColor === want
        ).length;
      });
      if (yellow <= 1) ok(`${path}: ${yellow} yellow action`);
      else bad(`${path}: ${yellow} yellow actions`);
    }

    const labels = await page.locator("aside").innerText();
    if (/NEEDS YOU/i.test(labels) && /MONEY/i.test(labels) && /THE BOOKS/i.test(labels)) ok("the rail is grouped: Needs you, Money, The books");
    else bad("the rail has no group labels");
    await page.goto(BASE + "/bills", { waitUntil: "networkidle" });
    await page.screenshot({ path: "shots/desk-shell.png" });

    await page.setViewportSize({ width: 900, height: 900 });
    await page.waitForTimeout(400);
    const w = (await page.locator("aside").boundingBox())?.width;
    if (w && w < 100) ok(`at tablet width the rail keeps its icons (${Math.round(w)}px)`);
    else bad(`at tablet width the rail is ${w}px`);
    await page.screenshot({ path: "shots/desk-shell-tablet.png" });
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();

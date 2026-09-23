/**
 * The second country, live: a UAE test company (made once, then reused) speaks
 * VAT in the rail and on the return, gives the VAT 201's boxes, offers no MIRA
 * statements, and prints VAT and its TRN on its paper.
 *
 *   node tools/country.js
 */
const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};
const NAME = "Sentryfi Checks UAE";

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const { page } = await signIn(browser, { phone: false });
    const id = await page.evaluate(async (name) => {
      const list = (await fetch("/api/companies", { credentials: "include" }).then((r) => r.json())).companies;
      const had = list.find((c) => c.name === name);
      if (had) return had.id;
      const r = await fetch("/api/companies", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, country: "AE", gstRegistered: true, gstNumber: "100123456700003" }) });
      return (await r.json()).company.id;
    }, NAME);
    await page.evaluate((i) => localStorage.setItem("sentryfi.company", i), id);
    await page.goto(BASE + "/tax", { waitUntil: "networkidle" });
    const head = await page.locator("h1").first().innerText();
    const body = await page.locator("main").innerText();
    if (head === "VAT return") ok('the return is the "VAT return"');
    else bad(`the return is titled ${head}`);
    if (/Box 1: Standard-rated supplies/.test(body) && /Box 14/.test(body)) ok("it gives the VAT 201's boxes");
    else bad("no VAT 201 boxes on the return");
    if (!/Input Tax Statement|MIRA/.test(body)) ok("and offers no MIRA statements");
    else bad("MIRA shows on a UAE return");
    if (await page.getByRole("link", { name: "VAT return" }).count()) ok('the rail says "VAT return"');
    else bad("the rail does not say VAT return");
    await page.screenshot({ path: "shots/country-uae.png", fullPage: true });

    await page.goto(BASE + "/branding", { waitUntil: "networkidle" });
    await page.getByTestId("editing").selectOption("invoice");
    const paper = await page.getByTestId("brand-preview").innerText();
    if (/VAT/.test(paper) && /TRN 100123456700003/.test(paper) && !/\bGST\b|TIN /.test(paper)) ok("its invoice prints VAT and its TRN, not GST or TIN");
    else bad(`the paper reads ${paper.slice(0, 300)}`);
    await page.getByTestId("brand-preview").screenshot({ path: "shots/country-uae-invoice.png" });
  } catch (err) {
    bad(err.message);
  } finally {
    // Leave the browser's company as the ordinary test company for the next check.
    await browser.close();
  }
})();

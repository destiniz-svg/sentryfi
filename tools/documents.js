/**
 * Documents, live, in the test company.
 *
 * Branding: a logo is uploaded and its colours offered; picking one and the
 * modern layout changes the paper beside the form at once; the receipt size
 * draws as a receipt. New invoice: the paper beside the form follows what is
 * typed, total included; saving opens the document, drawn the same, and the
 * draft is then discarded so the test books stay clean.
 *
 *   node tools/documents.js
 */
const path = require("path");
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

    // ---- the brand kit
    await page.goto(BASE + "/branding", { waitUntil: "networkidle" });
    const preview = page.getByTestId("brand-preview");
    await preview.getByTestId("paper").waitFor({ timeout: 15000 });
    await page.getByTestId("logo-file").setInputFiles(path.join(__dirname, "..", "frontend", "public", "icon-512.png"));
    await preview.locator("img.logo").waitFor({ timeout: 10000 });
    ok("a logo uploaded shows on the paper at once");
    // The logo's own colours come first, once they have been read from it.
    await page.getByText(", from your logo first").waitFor({ timeout: 10000 });
    const swatch = page.getByRole("button", { name: /^Colour #/ }).first();
    const colour = (await swatch.getAttribute("aria-label")).replace("Colour ", "");
    await swatch.click();
    await page.getByRole("button", { name: /^Modern/ }).click();
    const band = await preview.locator(".band").evaluate((el) => getComputedStyle(el).backgroundColor);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
    if (band === `rgb(${r}, ${g}, ${b})`) ok(`the logo's colour ${colour} and the modern layout reach the paper`);
    else bad(`band is ${band}, picked ${colour}`);
    await page.getByTestId("save-brand").click();
    await page.getByText("Saved", { exact: true }).first().waitFor({ timeout: 10000 });
    ok("the brand kit and template are saved");
    await page.screenshot({ path: "shots/branding-desk.png", fullPage: true });
    await page.getByRole("group", { name: "Preview size" }).getByRole("button", { name: "80 mm" }).click();
    await preview.locator(".sd.receipt").waitFor({ timeout: 5000 });
    ok("the 80 mm size draws as a receipt");
    await preview.screenshot({ path: "shots/branding-receipt.png" });

    // ---- a new invoice, drawn as it is filled in
    await page.goto(BASE + "/invoices/new", { waitUntil: "networkidle" });
    const paper = page.getByTestId("invoice-preview").getByTestId("paper");
    await paper.waitFor({ timeout: 15000 });
    const who = `Documents check ${Date.now() % 100000}`;
    await page.getByLabel("Who is it to?").fill(who);
    await page.getByLabel("Line 1: what it is").fill("Crane hire");
    await page.getByLabel("Line 1: quantity").fill("3");
    await page.getByLabel("Line 1: rate").fill("1,250.50");
    const text = await paper.innerText();
    if (text.includes(who) && text.includes("3,751.50") && /DRAFT/.test(text)) ok("the paper beside the form follows what is typed: customer, line and total");
    else bad(`the preview reads: ${text.slice(0, 400)}`);
    await page.screenshot({ path: "shots/invoice-new-desk.png", fullPage: true });
    await page.getByTestId("save-invoice").click();
    await page.waitForURL(/\/documents\/invoice\//, { timeout: 20000 });
    await page.getByTestId("paper").first().waitFor({ timeout: 15000 });
    const drawn = await page.getByTestId("paper").first().innerText();
    if (drawn.includes(who) && drawn.includes("Crane hire")) ok("saving opens the document, drawn the same way");
    else bad(`the saved document reads: ${drawn.slice(0, 300)}`);
    await page.screenshot({ path: "shots/invoice-document.png", fullPage: true });

    const id = page.url().split("/").pop();
    const gone = await page.evaluate(async (invoiceId) => {
      const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company"), "Content-Type": "application/json" };
      const r = await fetch(`/api/sales/${invoiceId}`, { method: "DELETE", credentials: "include", headers, body: JSON.stringify({ reason: "documents check" }) });
      return r.ok;
    }, id);
    if (gone) ok("the check's draft is discarded");
    else bad("the check's draft could not be discarded");

    // ---- on a phone
    const phone = await signIn(browser, { phone: true });
    await phone.page.goto(BASE + "/invoices/new", { waitUntil: "networkidle" });
    await phone.page.getByRole("button", { name: "preview" }).click();
    await phone.page.getByTestId("invoice-preview").getByTestId("paper").waitFor({ timeout: 15000 });
    const wide = await phone.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (!wide) ok("on a phone, the preview is a tab and fits without sideways scroll");
    else bad("the invoice page scrolls sideways on a phone");
    await phone.page.screenshot({ path: "shots/invoice-new-phone.png", fullPage: true });
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();

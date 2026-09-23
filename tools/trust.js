/**
 * Being trusted, live: the public page opens without signing in, shows the
 * status and the last proven backup, fits a phone; the whole journal
 * downloads from Statements as a spreadsheet file.
 *
 *   node tools/trust.js
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
    const guest = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    await guest.goto(BASE + "/trust", { waitUntil: "networkidle" });
    const status = await guest.getByTestId("status").innerText();
    if (/Everything is working/.test(status) && /Last backup restored and proven/.test(status)) ok(`the trust page opens without signing in: "${status.split("\n")[0]}"`);
    else bad(`the status reads ${status}`);
    if (!(await guest.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))) ok("and fits a phone");
    else bad("the trust page is wider than a phone");
    await guest.screenshot({ path: "shots/trust-phone.png", fullPage: true });

    const { page } = await signIn(browser, { phone: false });
    await page.goto(BASE + "/statements", { waitUntil: "networkidle" });
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("journal-csv").click()]);
    const text = require("fs").readFileSync(await download.path(), "utf8");
    const rows = text.trim().split("\n");
    if (rows[0].includes("Entry,Date,What it was") && rows.length > 10) ok(`the whole journal downloads: ${rows.length - 1} lines`);
    else bad(`the download starts ${rows[0]}`);
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();

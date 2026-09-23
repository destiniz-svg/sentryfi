/**
 * The expense companion, live, on a phone in the test company: /go opens as
 * its own app; a receipt is snapped (a picture stands in), checked and kept on
 * the phone; sent as one claim; the claim is in the books with its receipt,
 * waiting for approval.
 *
 *   node tools/go.js
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
    const { page } = await signIn(browser, { phone: true });
    await page.goto(BASE + "/go", { waitUntil: "networkidle" });
    if ((await page.title()) === "Sentryfi Expenses" && (await page.locator('link[rel="manifest"]').getAttribute("href")) === "/go.webmanifest") ok("/go opens as its own app, Sentryfi Expenses");
    else bad(`title ${await page.title()}`);
    const what = `Taxi check ${Date.now() % 100000}`;
    await page.getByTestId("receipt-file").setInputFiles(path.join(__dirname, "..", "frontend", "public", "icon-512.png"));
    await page.getByLabel("What it was for").waitFor({ timeout: 10000 });
    await page.getByText("Reading it…").waitFor({ state: "detached", timeout: 60000 }).catch(() => {});
    await page.getByLabel("What it was for").fill(what);
    await page.getByLabel("How much").fill("42.50");
    await page.getByTestId("keep-expense").click();
    await page.getByTestId("kept-expense").filter({ hasText: what }).waitFor({ timeout: 10000 });
    ok("a receipt is snapped, checked and kept on the phone");
    await page.screenshot({ path: "shots/go-phone.png" });
    await page.getByTestId("send-claim").click();
    await page.getByTestId("sent-claims").waitFor({ timeout: 20000 });
    const claim = await page.evaluate(async (w) => {
      const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company") };
      const list = (await fetch("/api/claims", { credentials: "include", headers }).then((r) => r.json())).claims;
      return list.find((c) => c.lines.some((l) => l.description === w));
    }, what);
    if (claim && claim.status === "submitted" && claim.total === "42.50" && claim.receipts.length === 1) ok(`sent as ${claim.number}: in the books waiting for approval, with its receipt`);
    else bad(`the claim reads ${JSON.stringify(claim).slice(0, 200)}`);
    await page.screenshot({ path: "shots/go-sent-phone.png" });
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();

/**
 * Does the ten-second undo actually take money back out?
 *
 * Posting is irreversible by design, so "undo" is a second, opposite entry
 * with a reason on it. That is only honest if the books afterwards say so:
 * both entries present, the balance back where it started, and the bill
 * available to post again once whatever was wrong is fixed.
 *
 * It records its own bill and takes it back out, so it never touches a real
 * one.
 */

const { chromium } = require("playwright");
const { signIn, putBack, BASE } = require("./session");

const SUPPLIER = `Undo Test ${Date.now().toString().slice(-6)}`;
const AMOUNT = "21.00";

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  console.log(`
${BASE} — the ten-second undo
`);

  // Signs in and switches to the books a check is allowed to write in.
  const { page, context } = await signIn(browser);
  await page.goto(BASE + "/bills", { waitUntil: "networkidle", timeout: 45000 });
  ok("on the bills board");

  const owedBefore = await page.locator(".phone-band-figure").innerText();

  // Record one, from the board's own shutter.
  await page.locator(".phone-shutter").click();
  await page.waitForTimeout(600);
  await page.fill("#bill-supplier", SUPPLIER);
  await page.fill("#bill-amount", AMOUNT);
  // Say how the tax was quoted, or it cannot be posted — which is the point.
  const gst = page.locator("#bill-gst");
  if (await gst.count()) await gst.selectOption("none_unregistered").catch(() => {});
  await page.locator("button[type=submit]").last().click();
  await page.waitForTimeout(2500);

  // Confirming on the board records and posts in one act, so the undo is
  // offered straight away rather than after a second trip to the list.
  const strip = page.locator(".phone-strip");
  if ((await strip.count()) > 0) ok("the strip offered the undo");
  else return void bad("nothing offered an undo after confirming");

  const counting = await strip.innerText().catch(() => "");
  if (/[0-9]+ *s/i.test(counting)) ok("it is counting down: " + counting.replace(/\n/g, " "));
  else bad("no countdown in the strip");

  const row = page.locator(".phone-row", { hasText: SUPPLIER });
  if ((await row.count()) > 0 && /in the books/i.test(await row.innerText())) {
    ok("and it went straight into the books");
  } else {
    bad("confirming did not put it in the books: " + (await row.innerText().catch(() => "no row")).replace(/\n/g, " · "));
  }

  await strip.getByRole("button", { name: /undo/i }).click();
  await page.waitForTimeout(3000);

  const after = await page.locator(".phone-strip").innerText().catch(() => "");
  if (/taken back out/i.test(after)) ok("it said what it did: " + after.replace(/\n/g, " "));
  else bad("no honest account of the undo: " + after.replace(/\n/g, " "));

  // The books are the proof, not the screen.
  const books = await page.evaluate(async () => {
    const companyId = localStorage.getItem("sentryfi.company");
    const headers = { "X-Company-Id": companyId };
    const f = await fetch("/api/figures", { credentials: "include", headers }).then((r) => r.json());
    return { owed: f.owedToSuppliers, recent: f.recent.slice(0, 3) };
  });

  const reversal = books.recent.find((e) => /^Reverses entry/i.test(e.narrative || ""));
  if (reversal) ok(`the journal carries the reversal: entry ${reversal.entryNo}`);
  else bad("no reversal entry in the journal");

  await page.goto(BASE + "/bills", { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(1500);
  const owedAfter = await page.locator(".phone-band-figure").innerText();
  if (owedAfter === owedBefore) ok(`what is owed is back where it started: ${owedAfter.replace(/\n/g, " ")}`);
  else bad(`owed went ${owedBefore.replace(/\n/g, " ")} → ${owedAfter.replace(/\n/g, " ")}`);

  // Take the test bill back out, so a real set of books is not left carrying
  // it. One named bill, and only if exactly one matches.
  const cleaned = await putBack(page, SUPPLIER, "Check of the ten-second undo. Not a real bill.");
  console.log(`
  clean-up: ${SUPPLIER} — ${cleaned}`);
  await browser.close();
  console.log(process.exitCode ? "\nsomething is wrong\n" : "\nthe undo is real\n");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

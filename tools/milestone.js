/**
 * Milestone one's own sentence, as a check.
 *
 *   "A bill photographed on a site with no signal is in the books three taps
 *    later, once there is signal — and the person who photographed it never
 *    saw an accounting word."
 *
 * Everything else is a proxy for this. It runs on a phone, with the
 * connection cut, and counts the taps it actually takes.
 */

const { chromium } = require("playwright");
const { signIn, putBack, BASE } = require("./session");

const SUPPLIER = `Loop Test ${Date.now().toString().slice(-6)}`;
const AMOUNT = "312.00";

// Words the owner should never meet. GST is not one of them: it is on the
// paper, it is the word the tax office uses, and it is what they call it.
const ACCOUNTING = [
  "debit", "credit", "journal", "ledger", "general ledger", "accrual",
  "double-entry", "chart of accounts", "trial balance", "posting",
];

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  console.log(`
${BASE} — a bill on a site with no signal
`);

  // Signs in and switches to the books a check is allowed to write in.
  const { page, context } = await signIn(browser);
  await page.goto(BASE + "/dashboard", { waitUntil: "networkidle", timeout: 45000 });

  const entriesBefore = await countEntries(page);

  // No signal, bill in hand.
  await context.setOffline(true);
  ok("offline, on the board");

  let taps = 0;
  await page.locator(".phone-shutter").click();       taps++;
  await page.waitForTimeout(700);

  // Typing is not a tap, and with no signal it cannot be read off the paper.
  await page.fill("#bill-supplier", SUPPLIER);
  await page.fill("#bill-amount", AMOUNT);

  await page.locator("button[type=submit]").last().click(); taps++;
  await page.waitForTimeout(1500);
  ok(`held on the phone in ${taps} taps`);

  // Every word the person has seen so far.
  const seen = (await page.locator("body").innerText()).toLowerCase();
  const met = ACCOUNTING.filter((w) => seen.includes(w));
  if (met.length === 0) ok("no accounting word on the way in");
  else bad("the owner met: " + met.join(", "));

  // Signal comes back while the phone is in a pocket.
  await context.setOffline(false);
  await page.waitForTimeout(8000);
  await page.reload({ waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(3000);

  const entriesAfter = await countEntries(page);
  if (entriesAfter === entriesBefore + 1) {
    ok(`it is in the books, by itself: ${entriesBefore} entries → ${entriesAfter}`);
  } else {
    bad(`the books went ${entriesBefore} → ${entriesAfter}; expected one more`);
  }

  const inBooks = await page.evaluate(async (target) => {
    const companyId = localStorage.getItem("sentryfi.company");
    const headers = { "X-Company-Id": companyId };
    const f = await fetch("/api/figures", { credentials: "include", headers }).then((r) => r.json());
    return f.recent.find((e) => (e.narrative || "").includes(target)) || null;
  }, SUPPLIER);

  if (inBooks) ok(`entry ${inBooks.entryNo} · ${inBooks.amount} · ${inBooks.narrative}`);
  else bad("no entry in the journal names it");

  const after = (await page.locator("body").innerText()).toLowerCase();
  const metAfter = ACCOUNTING.filter((w) => after.includes(w));
  if (metAfter.length === 0) ok("no accounting word on the way out either");
  else bad("the board shows: " + metAfter.join(", "));

  // Put it back.
  const cleaned = await putBack(page, SUPPLIER, "Check of the whole loop. Not a real bill.");
  console.log(`
  clean-up: ${SUPPLIER} — ${cleaned}`);

  await browser.close();
  console.log(process.exitCode ? "\nthe sentence is not true yet\n" : "\nthe sentence holds\n");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

async function countEntries(page) {
  return page.evaluate(async () => {
    const companyId = localStorage.getItem("sentryfi.company");
    const headers = { "X-Company-Id": companyId };
    const f = await fetch("/api/figures", { credentials: "include", headers }).then((r) => r.json());
    return f.entries;
  });
}

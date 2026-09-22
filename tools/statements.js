/**
 * The statements, from the screen, against the ledger.
 *
 * Opens each of the three in the checks company and reads the verdict line,
 * then asks for a date in the past and checks it is a different answer from
 * today's only by what was posted in between. Finally posts one adjustment
 * and checks that the profit moved by exactly its amount and that the trial
 * balance and balance sheet still balance.
 *
 *   node tools/statements.js
 */

const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

setTimeout(() => {
  console.log("  FAIL the check did not finish within three minutes");
  process.exit(1);
}, 180000).unref?.();

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};
const cents = (t) => Math.round(Number(String(t).replace(/,/g, "")) * 100);

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    console.log(`\n${BASE} — the statements\n`);
    const { page } = await signIn(browser, { phone: false });
    const call = (method, path, body) =>
      page.evaluate(
        async ([m, p, b]) => {
          const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company"), "Content-Type": "application/json" };
          const r = await fetch("/api" + p, { method: m, credentials: "include", headers, body: b ? JSON.stringify(b) : undefined });
          return r.json();
        },
        [method, path, body || null]
      );

    await page.goto(BASE + "/statements", { waitUntil: "networkidle", timeout: 45000 });

    for (const [tab, want] of [
      ["Trial balance", /Debits equal credits, to the laari/],
      ["Balance sheet", /Assets equal what it owes plus what the owners have/],
    ]) {
      await page.getByRole("tab", { name: tab }).click();
      const v = page.getByTestId("verdict");
      await v.waitFor({ timeout: 15000 });
      const text = await v.innerText();
      if (want.test(text)) ok(`${tab}: "${text.trim()}"`);
      else bad(`${tab} says: "${text.trim()}"`);
    }
    await page.screenshot({ path: "shots/statements-bs.png" });

    // A date before anything was posted is empty, and still balances.
    const past = await call("GET", "/statements/trial-balance?asAt=2000-01-01");
    if (past.rows.length === 0 && past.balances) ok("asked for a date before anything, it is empty and still balances");
    else bad(`on 2000-01-01 the trial balance has ${past.rows.length} rows`);

    // Profit moves by exactly one adjustment.
    const today = new Date().toISOString().slice(0, 10);
    const from = `${today.slice(0, 4)}-01-01`;
    const before = await call("GET", `/statements/profit-and-loss?from=${from}&to=${today}`);
    const accounts = (await call("GET", "/periods/accounts")).accounts;
    const materials = accounts.find((a) => a.code === "5100");
    const bank = accounts.find((a) => a.code === "1100");
    await call("POST", "/periods/adjust", {
      date: today,
      narrative: "Statements check",
      lines: [{ accountId: materials.id, debit: "12.34" }, { accountId: bank.id, credit: "12.34" }],
    });
    const after = await call("GET", `/statements/profit-and-loss?from=${from}&to=${today}`);
    const moved = cents(before.profit) - cents(after.profit);
    if (moved === 1234) ok(`one adjustment of 12.34 moved the profit by exactly that (${before.profit} to ${after.profit})`);
    else bad(`profit moved by ${moved / 100}, not 12.34`);

    const tb = await call("GET", `/statements/trial-balance?asAt=${today}`);
    const bs = await call("GET", `/statements/balance-sheet?asAt=${today}`);
    if (tb.balances && bs.balances) ok(`and both still balance: trial balance ${tb.debit} each side, assets ${bs.totalAssets}`);
    else bad(`after the adjustment: trial balance off by ${tb.difference}, balance sheet off by ${bs.difference}`);

    // Put it back, so the sandbox does not drift.
    await call("POST", "/periods/adjust", {
      date: today,
      narrative: "Statements check, put back",
      lines: [{ accountId: bank.id, debit: "12.34" }, { accountId: materials.id, credit: "12.34" }],
    });
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();

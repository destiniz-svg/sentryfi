/**
 * Bringing a bank statement in, from the screen.
 *
 * Uploads an invented statement built to the real Bank of Maldives shape (no
 * header row, Excel-wrapped cells, three timestamp shapes, one malformed row)
 * into the checks company's second bank account. The file is the same every
 * run, so the first run adds its lines and every later run finds them already
 * there — which is the property being checked, and keeps the sandbox from
 * growing. Nothing here is real data.
 *
 *   node tools/statement.js
 */

const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const NAME = "Checks Savings";

const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
const xl = (v) => q(`="${v}"`);
const row = (on, kind, ref, at, who, channel, debit, credit, balance) =>
  [q(on), q(on), q(kind), xl(ref), xl("FT26001369XH\\B26"), q(at), xl(who), q(channel), q(debit), q(credit), q(balance)].join(",");

const FILE = [
  row("2026/01/01", "Transfer Debit", "BLAZCHECK0001", "01-01-2026 01-51-27", "CHECK PERSON ONE", "Internet Banking", "800", "", "200.00"),
  row("2026/01/02", "Transfer Credit", "BLAZCHECK0002", "02-01-2026 09-26-45", "CHECK, COMPANY TWO", "Internet Banking", "", "426.5", "626.50"),
  row("2026/01/05", "Cash Deposit-ATM", "1234567890123456", "2026-01-05 10-11-12", "CHECK ATM", "ATM", "", "19605.23", "20231.73"),
  row("2026/01/06", "Purchase", "BLAZCHECK0004", "06-01-2026 101112", "CHECK SHOP", "MALE MDV", "31.73", "", "20200.00"),
  row("2026/01/08", "Transfer Debit", "BLAZCHECK0005", "08-01-2026 15-47-23", "CHECK PERSON THREE", "08-01-2026 15-47-23", "200", "", "20000.00"),
].join("\n");

setTimeout(() => {
  console.log("  FAIL the check did not finish within three minutes");
  process.exit(1);
}, 180000).unref?.();

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    console.log(`\n${BASE} — a statement, brought in\n`);
    const { page } = await signIn(browser, { phone: false });
    await page.goto(BASE + "/bank", { waitUntil: "networkidle", timeout: 45000 });

    const savings = page.locator("li", { hasText: NAME });
    if (!(await savings.count())) return bad(`there is no ${NAME}; run node tools/bank.js first`);

    const linesBefore = await page.evaluate(async () => {
      const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company") };
      const places = (await fetch("/api/bank", { credentials: "include", headers }).then((r) => r.json())).places;
      return Object.fromEntries(places.map((p) => [p.name, p.statement?.lines ?? null]));
    });
    const before = linesBefore[NAME] || 0;

    const upload = async () => {
      await savings.getByRole("button", { name: /statement/i }).click();
      await page.setInputFiles("#statement-file", { name: "statement.csv", mimeType: "text/csv", buffer: Buffer.from(FILE) });
      await page.getByTestId("statement-result").waitFor({ timeout: 15000 });
      return page.getByTestId("statement-result").innerText();
    };

    const first = await upload();
    if (/5\s+lines/.test(first)) ok("it read all five lines: " + first.split("\n")[0]);
    else bad("expected five lines read, got: " + first);
    if (/add up to the laari/i.test(first)) ok("the file's own balances add up, so the columns were read right");
    else bad("the balance check did not pass: " + first);
    if (/1 line carries something odd/i.test(first)) ok("the malformed line is kept and marked, not rejected");
    else bad("the malformed line was not reported: " + first);
    await page.screenshot({ path: "shots/statement-result.png" });
    await page.getByRole("button", { name: /done/i }).click();

    const second = await upload();
    if (/0\s+new/.test(second) && /5 already here/.test(second)) ok("the same file again adds nothing: " + second.split("\n")[0]);
    else bad("the same file was not recognised: " + second);
    await page.getByRole("button", { name: /done/i }).click();

    const after = await page.evaluate(async () => {
      const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company") };
      const places = (await fetch("/api/bank", { credentials: "include", headers }).then((r) => r.json())).places;
      return Object.fromEntries(places.map((p) => [p.name, { lines: p.statement?.lines ?? null, balance: p.balance }]));
    });
    if (after[NAME].lines - before <= 5) ok(`${NAME} holds ${after[NAME].lines} statement lines, no more than one copy of the file`);
    else bad(`${NAME} grew by ${after[NAME].lines - before}`);
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();

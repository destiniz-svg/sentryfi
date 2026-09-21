/**
 * Bank and cash, end to end, at a desk.
 *
 * Finds (or opens) a second bank account in the checks company, moves money
 * into it from the first through the screen, and reads the balances back from
 * the API: one must have fallen by exactly what the other rose by. Then moves
 * it back, so the books end where they started and the check can run again.
 * It reuses one named account rather than opening a new one each run, because
 * an account cannot be deleted and the chart has room for only so many.
 *
 *   node tools/bank.js
 */

const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const NAME = "Checks Savings";
const AMOUNT = "250.00";

setTimeout(() => {
  console.log("  FAIL the check did not finish within three minutes");
  process.exit(1);
}, 180000).unref?.();

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

const cents = (text) => Math.round(Number(String(text).replace(/,/g, "")) * 100);

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    console.log(`\n${BASE} — where the money is\n`);
    const { page } = await signIn(browser, { phone: false });

    const places = () =>
      page.evaluate(async () => {
        const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company") };
        return (await fetch("/api/bank", { credentials: "include", headers }).then((r) => r.json())).places;
      });

    await page.goto(BASE + "/bank", { waitUntil: "networkidle", timeout: 45000 });
    await page.getByRole("heading", { name: /bank and cash/i }).waitFor({ timeout: 15000 });
    ok("the page opens");

    let all = await places();
    if (!all.some((p) => p.name === NAME)) {
      await page.getByRole("button", { name: /bank account/i }).click();
      await page.fill("#bank-name", NAME);
      await page.getByRole("button", { name: /open it/i }).click();
      await page.getByText(`${NAME} is open`).waitFor({ timeout: 10000 });
      all = await places();
      ok(`opened ${NAME}`);
    }
    const bank = all.find((p) => p.name === "Bank");
    const other = all.find((p) => p.name === NAME);
    if (!bank || !other) return bad("the checks company is missing its Bank or " + NAME);

    const move = async (from, to, amount) => {
      await page.getByRole("button", { name: /move money/i }).click();
      await page.selectOption("#move-from", from.id);
      await page.selectOption("#move-to", to.id);
      await page.fill("#move-amount", amount);
      await page.getByRole("button", { name: new RegExp(`move mvr ${amount.replace(".", "\\.")}`, "i") }).click();
      await page.getByText(/moved · entry/).waitFor({ timeout: 10000 });
    };

    const before = { bank: cents(bank.balance), other: cents(other.balance) };
    await move(bank, other, AMOUNT);
    const mid = await places();
    const gone = before.bank - cents(mid.find((p) => p.id === bank.id).balance);
    const came = cents(mid.find((p) => p.id === other.id).balance) - before.other;
    if (gone === cents(AMOUNT) && came === cents(AMOUNT)) ok(`${AMOUNT} left Bank and arrived in ${NAME}, to the laari`);
    else bad(`Bank fell by ${gone} and ${NAME} rose by ${came}; both should be ${cents(AMOUNT)}`);

    // Same place twice is stopped before anything is sent.
    await page.getByRole("button", { name: /move money/i }).click();
    await page.selectOption("#move-from", bank.id);
    await page.selectOption("#move-to", bank.id);
    await page.fill("#move-amount", "1.00");
    const blocked = await page.getByRole("button", { name: /same place twice/i }).count();
    if (blocked) ok("the same place twice is refused before it is sent");
    else bad("moving money from a place to itself was not stopped");
    await page.getByRole("button", { name: /cancel/i }).click();

    await page.screenshot({ path: "shots/bank-desk.png" });

    await move(other, bank, AMOUNT);
    const end = await places();
    const back = { bank: cents(end.find((p) => p.id === bank.id).balance), other: cents(end.find((p) => p.id === other.id).balance) };
    if (back.bank === before.bank && back.other === before.other) ok("moved back: both are where they started");
    else bad(`after moving back, Bank is ${back.bank} (was ${before.bank}) and ${NAME} is ${back.other} (was ${before.other})`);
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();

/**
 * The bank agrees with the books, from the screen.
 *
 * Brings in an invented statement (three transfers to one payee, one credit
 * from another) and then does what a person would: reads the question, picks
 * what it was, and presses the button that names the count and the money. The
 * assertions are about the books, read from the API afterwards:
 *
 *   - importing posted nothing (the bank's balance in the books did not move);
 *   - answering the payee moved it by exactly the total, once;
 *   - taking one line back moves it back by exactly that line, and the line
 *     is a question again;
 *   - leaving the rest for later clears the list without touching the books.
 *
 * Payees are random words, so a run never lands in an earlier run's group.
 *
 *   node tools/reconcile.js
 */

const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const NAME = "Checks Savings";
const word = () => Array.from({ length: 8 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ"[Math.floor(Math.random() * 23)]).join("");
const PAYEE = `CHECK ${word()} LTD`;
const OTHER = `CHECK ${word()} PVT`;
const RUN = Date.now().toString().slice(-8);

const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
const xl = (v) => q(`="${v}"`);
const row = (on, ref, who, debit, credit, balance) =>
  [q(on), q(on), q("Transfer Debit"), xl(ref), xl("FT26001369XH\\B26"), q("01-03-2026 08-00-00"), xl(who), q("Internet Banking"), q(debit), q(credit), q(balance)].join(",");

// Opens at 1,000.00 and every balance follows from the line before it.
const FILE = [
  row("2026/03/01", `BLAZ${RUN}01`, PAYEE, "100", "", "900.00"),
  row("2026/03/02", `BLAZ${RUN}02`, PAYEE, "200", "", "700.00"),
  row("2026/03/03", `BLAZ${RUN}03`, PAYEE, "300", "", "400.00"),
  row("2026/03/04", `BLAZ${RUN}04`, OTHER, "", "50", "450.00"),
].join("\n");

setTimeout(() => {
  console.log("  FAIL the check did not finish within four minutes");
  process.exit(1);
}, 240000).unref?.();

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};
const cents = (t) => Math.round(Number(String(t).replace(/,/g, "")) * 100);
const show = (c) => (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    console.log(`\n${BASE} — what the bank shows that the books do not\n`);
    const { page } = await signIn(browser, { phone: false });

    const api = (path) =>
      page.evaluate(async (p) => {
        const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company") };
        return fetch("/api" + p, { credentials: "include", headers }).then((r) => r.json());
      }, path);
    const places = async () => (await api("/bank")).places;
    const balance = async () => cents((await places()).find((p) => p.name === NAME).balance);

    await page.goto(BASE + "/bank", { waitUntil: "networkidle", timeout: 45000 });
    const savings = (await places()).find((p) => p.name === NAME);
    if (!savings) return bad(`there is no ${NAME}; run node tools/bank.js first`);

    // ---- bring it in: posts nothing ----------------------------------------
    const start = await balance();
    await page.locator("li", { hasText: NAME }).getByRole("button", { name: /statement/i }).click();
    await page.setInputFiles("#statement-file", { name: "statement.csv", mimeType: "text/csv", buffer: Buffer.from(FILE) });
    await page.getByTestId("statement-result").waitFor({ timeout: 15000 });
    if ((await balance()) === start) ok("importing the statement posted nothing to the books");
    else bad("the balance moved on import");
    await page.getByRole("button", { name: /done/i }).click();

    // ---- read the question ---------------------------------------------------
    await page.goto(BASE + `/bank/${savings.id}`, { waitUntil: "networkidle", timeout: 45000 });
    const card = page.getByTestId("question").filter({ hasText: PAYEE });
    await card.waitFor({ timeout: 15000 });
    const text = await card.innerText();
    if (/3 lines/.test(text) && /MVR 600\.00/.test(text) && /\bOut\b/.test(text)) ok("three transfers to one payee are one question: 3 lines, MVR 600.00");
    else bad("the question does not read as three lines, MVR 600.00 out: " + text.replace(/\n/g, " | "));
    await page.screenshot({ path: "shots/reconcile-waiting.png" });

    // Nothing to press until it is said what it was.
    if (await card.getByRole("button", { name: /^pick what it was$/i }).isDisabled()) ok("nothing can be posted until somebody says what it was");
    else bad("the post button was live before an account was chosen");

    // ---- answer it -----------------------------------------------------------
    await card.getByLabel("What was it").selectOption({ label: "Materials" });
    const commit = card.getByRole("button", { name: /^post 3 to materials/i });
    const label = (await commit.innerText()).trim();
    if (/Post 3 to Materials · MVR 600\.00/.test(label)) ok(`the button names the count, the account and the money: "${label}"`);
    else bad(`the button reads "${label}"`);
    await commit.click();
    await page.getByText(/3 posted to Materials/).waitFor({ timeout: 15000 });

    const afterPost = await balance();
    if (start - afterPost === 60000) ok(`the bank's balance in the books fell by exactly 600.00 (${show(start)} to ${show(afterPost)})`);
    else bad(`the balance fell by ${show(start - afterPost)}, not 600.00`);

    // ---- take one back -------------------------------------------------------
    await page.getByRole("tab", { name: /answered/i }).click();
    const answered = page.locator("li", { hasText: PAYEE });
    await answered.first().waitFor({ timeout: 10000 });
    if ((await answered.count()) === 3) ok("all three are in Answered");
    else bad(`Answered shows ${await answered.count()} lines, not 3`);
    const amountBack = cents((await answered.first().locator(".tabular").last().innerText()).trim());
    await answered.first().getByRole("button", { name: /take back/i }).click();
    await page.getByText("Taken back").waitFor({ timeout: 10000 });
    const afterUndo = await balance();
    if (afterUndo - afterPost === amountBack) ok(`taking one back moved the books by exactly that line, ${show(amountBack)}`);
    else bad(`taking one back moved the books by ${show(afterUndo - afterPost)}, expected ${show(amountBack)}`);

    // ---- leave the rest for later -------------------------------------------
    await page.getByRole("tab", { name: /waiting/i }).click();
    const again = page.getByTestId("question").filter({ hasText: PAYEE });
    await again.waitFor({ timeout: 10000 });
    if (/1 line\b/.test(await again.innerText())) ok("the line taken back is a question again");
    else bad("the taken-back line did not come back as one question: " + (await again.innerText()).replace(/\n/g, " | "));

    for (const who of [PAYEE, OTHER]) {
      await page.getByTestId("question").filter({ hasText: who }).getByRole("button", { name: /leave for later/i }).click();
      await page.waitForTimeout(1500);
    }
    const left = (await api(`/bank/${savings.id}/waiting`)).groups.map((g) => g.who);
    if (!left.includes(PAYEE) && !left.includes(OTHER)) ok("leaving them for later cleared them from the list");
    else bad("they are still waiting");
    if ((await balance()) === afterUndo) ok("and that touched nothing in the books");
    else bad("setting aside moved the books");
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();

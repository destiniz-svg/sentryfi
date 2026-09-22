/**
 * Closing the books, from the screen, and proof that the rule holds everywhere.
 *
 * Posts an entry into January through the Adjustment form, closes through 31
 * January, and then checks the four things that make a closed month closed:
 *
 *   - an adjustment into it with no reason is stopped before it is sent;
 *   - one with a reason goes in, and the reason is kept where it can be read;
 *   - a transfer dated inside it, sent by a route that knows nothing about
 *     periods, is refused by the database with a message a person can read;
 *   - reopening needs a reason, is written down with a name, and then the same
 *     transfer is accepted.
 *
 * It leaves the checks company open again whatever happens, because a closed
 * sandbox would make every other check fail for a reason that has nothing to
 * do with what they test.
 *
 *   node tools/closing.js
 */

const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

setTimeout(() => {
  console.log("  FAIL the check did not finish within four minutes");
  process.exit(1);
}, 240000).unref?.();

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  let page;
  const call = (method, path, body) =>
    page.evaluate(
      async ([m, p, b]) => {
        const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company"), "Content-Type": "application/json" };
        const r = await fetch("/api" + p, { method: m, credentials: "include", headers, body: b ? JSON.stringify(b) : undefined });
        return { status: r.status, body: await r.json().catch(() => ({})) };
      },
      [method, path, body || null]
    );

  try {
    console.log(`\n${BASE} — closing the books\n`);
    ({ page } = await signIn(browser, { phone: false }));
    await page.goto(BASE + "/closing", { waitUntil: "networkidle", timeout: 45000 });

    // A clean start: whatever an earlier run left closed is reopened, on the record.
    const start = (await call("GET", "/periods")).body;
    if (start.lockedThrough) {
      await call("POST", "/periods/reopen", { through: null, reason: "A check run starting clean" });
      await page.reload({ waitUntil: "networkidle" });
    }

    // ---- an entry into January, by hand -----------------------------------
    const accounts = (await call("GET", "/periods/accounts")).body.accounts;
    const materials = accounts.find((a) => a.code === "5100");
    const bank = accounts.find((a) => a.code === "1100");
    if (!materials || !bank) return bad("the checks company is missing Materials or Bank");

    const adjust = async ({ date, narrative, reason }) => {
      await page.getByRole("button", { name: /^adjustment$/i }).click();
      await page.fill("#adj-date", date);
      await page.fill("#adj-narrative", narrative);
      if (reason !== undefined) await page.fill("#adj-reason", reason);
      await page.getByLabel("Line 1: account").selectOption(materials.id);
      await page.getByLabel("Line 1: debit").fill("10.00");
      await page.getByLabel("Line 2: account").selectOption(bank.id);
      await page.getByLabel("Line 2: credit").fill("10.00");
    };

    await adjust({ date: "2026-01-15", narrative: "Closing check entry" });
    await page.getByRole("button", { name: /^post adjustment · mvr 10\.00$/i }).click();
    await page.locator("#adj-narrative").waitFor({ state: "detached", timeout: 10000 });
    ok("an adjustment into an open month goes in");

    // ---- close through 31 January ------------------------------------------
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#close-through").selectOption({ label: "Through 31 Jan 2026" });
    await page.getByRole("button", { name: /^close the books through 31 jan 2026$/i }).click();
    // The state card, not the toast: the toast says the same words a moment earlier.
    await page.getByTestId("lock-state").filter({ hasText: "Closed through 31 Jan 2026" }).waitFor({ timeout: 10000 });
    ok("the books close through 31 January 2026");
    await page.screenshot({ path: "shots/closing-closed.png" });

    // ---- into it, with no reason: stopped before it is sent -----------------
    await adjust({ date: "2026-01-20", narrative: "Closing check late entry", reason: "" });
    const label = (await page.locator("button[type=submit]").last().innerText()).trim();
    if (/say why it is going in/i.test(label)) ok(`an adjustment into a closed month with no reason is stopped: "${label}"`);
    else bad(`the button reads "${label}"`);

    await page.screenshot({ path: "shots/closing-adjust.png" });

    // ---- into it, with a reason: goes in, and the reason is kept ------------
    await page.fill("#adj-reason", "Check: invoice arrived in February");
    await page.getByRole("button", { name: /^post adjustment · mvr 10\.00$/i }).click();
    await page.locator("#adj-narrative").waitFor({ state: "detached", timeout: 10000 });
    await page.getByText("Why: Check: invoice arrived in February").first().waitFor({ timeout: 10000 });
    ok("with a reason it goes in, and the reason is written against it");

    // ---- a route that knows nothing about periods is refused too ------------
    const places = (await call("GET", "/bank")).body.places;
    const from = places.find((p) => p.name === "Bank");
    const to = places.find((p) => p.name === "Checks Savings");
    const refused = await call("POST", "/bank/transfer", { fromId: from.id, toId: to.id, amount: "1.00", on: "2026-01-10" });
    if (refused.status >= 400 && /closed through 31 Jan 2026/.test(refused.body.error?.message || "")) {
      ok(`the database refuses it, in words: "${refused.body.error.message}"`);
    } else {
      bad(`a transfer dated in the closed month got ${refused.status}: ${JSON.stringify(refused.body)}`);
    }

    // ---- reopen: a reason, a name, and then it is open ----------------------
    await page.getByRole("button", { name: /^reopen$/i }).click();
    await page.locator("#reopen-to").selectOption({ label: "Nothing closed, all the way" });
    const blocked = (await page.locator("button[type=submit]").last().innerText()).trim();
    if (/say why/i.test(blocked)) ok(`reopening with no reason is stopped: "${blocked}"`);
    else bad(`the reopen button reads "${blocked}"`);
    await page.fill("#reopen-reason", "Check: the accountant found a missing invoice");
    await page.getByRole("button", { name: /^reopen everything$/i }).click();
    await page.getByTestId("lock-state").filter({ hasText: /^Open/ }).waitFor({ timeout: 10000 });
    await page.getByText("Check: the accountant found a missing invoice").first().waitFor({ timeout: 10000 });
    const who = (await call("GET", "/periods")).body.history[0];
    if (who.action === "reopen" && who.who) ok(`the reopen is on the record with a name on it: ${who.who}`);
    else bad("the reopen is not on the record with a name");

    const allowed = await call("POST", "/bank/transfer", { fromId: from.id, toId: to.id, amount: "1.00", on: "2026-01-10" });
    if (allowed.status === 201) ok("and the same transfer is accepted now that January is open");
    else bad(`after reopening, the transfer got ${allowed.status}: ${JSON.stringify(allowed.body)}`);
  } catch (err) {
    bad(err.message);
  } finally {
    try {
      const now = (await call("GET", "/periods")).body;
      if (now.lockedThrough) await call("POST", "/periods/reopen", { through: null, reason: "A check run leaving the books open" });
    } catch {
      // The browser may already be gone; the next run starts by reopening.
    }
    await browser.close();
  }
})();

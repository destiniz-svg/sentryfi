/**
 * The tin, end to end.
 *
 * Opens a cash box, puts money in it, spends some, counts it short, and then
 * reads the journal rather than the screen. The interesting assertion is the
 * last one: after a count that came up short, the books must agree with the
 * tin and the journal must say how much was missing and what was said about
 * it. A cash feature that quietly adjusts earlier entries would pass a
 * screen-level check and destroy the only evidence that anything was wrong.
 *
 *   node tools/cash.js
 */

const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const BOX = `Tin ${Date.now().toString().slice(-6)}`;
const PUT_IN = "2000.00";
const SPENT = "300.00";
const COUNTED = "1650.00"; // 50.00 less than it should be

// A check that hangs tells you nothing and blocks everything behind it.
setTimeout(() => {
  console.log("  FAIL the check did not finish within three minutes");
  process.exit(1);
}, 180000).unref?.();

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

let browser;

/** Says what went wrong and lets go of the browser, so the check ends. */
async function stop(why) {
  bad(why);
  if (browser) await browser.close();
}

(async () => {
  browser = await chromium.launch({ channel: "chrome" });
  console.log(`\n${BASE} — money in somebody's hand\n`);
  const { page } = await signIn(browser);

  await page.goto(BASE + "/cash", { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(1500);

  // Open the tin from the screen, not the API: the empty state is the only
  // way a real person ever gets one.
  const opener = page.getByRole("button", { name: /open a cash box/i });
  if ((await opener.count()) === 0) {
    console.log("  note: a box already exists in these books; opening another");
  } else {
    await opener.click();
    await page.waitForTimeout(700);
    await page.fill("#cash-box-name", BOX);
    await page.locator("button[type=submit]").last().click();
    await page.waitForTimeout(2500);
    ok(`opened ${BOX}`);
  }

  const state = await page.evaluate(async (boxName) => {
    const companyId = localStorage.getItem("sentryfi.company");
    const headers = { "X-Company-Id": companyId, "Content-Type": "application/json" };
    const boxes = (await fetch("/api/cash", { credentials: "include", headers }).then((r) => r.json())).boxes;
    const box = boxes.find((b) => b.name === boxName) || boxes[0];
    return { box, headers };
  }, BOX);

  if (!state.box) return stop("no cash box came back");
  ok(`the box reads ${state.box.inBox} and has never been counted`);

  // Put money in it: ask, then give. Nothing moves until somebody gives it.
  const filled = await page.evaluate(
    async ([boxId, amount]) => {
      const headers = {
        "X-Company-Id": localStorage.getItem("sentryfi.company"),
        "Content-Type": "application/json",
      };
      const asked = await fetch(`/api/cash/${boxId}/topup`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ amount, note: "Opening float" }),
      }).then((r) => r.json());

      const before = (await fetch("/api/cash", { credentials: "include", headers }).then((r) => r.json())).boxes.find(
        (b) => b.id === boxId
      );

      const given = await fetch(`/api/cash/topups/${asked.id}/give`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({}),
      }).then((r) => r.json());

      const after = (await fetch("/api/cash", { credentials: "include", headers }).then((r) => r.json())).boxes.find(
        (b) => b.id === boxId
      );
      return { asked, beforeGiving: before.inBox, given, after: after.inBox };
    },
    [state.box.id, PUT_IN]
  );

  if (filled.beforeGiving === "0.00") ok("asking for it moved no money");
  else bad(`asking changed the tin to ${filled.beforeGiving}`);

  if (filled.after === "2,000.00") ok(`giving it did: the tin reads ${filled.after}`);
  else bad(`after giving, the tin reads ${filled.after}`);

  // Spend some, from the screen.
  await page.reload({ waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(1800);
  await page.getByRole("button", { name: /money out of the tin/i }).first().click();
  await page.waitForTimeout(700);
  await page.fill("#cash-amount", SPENT);
  await page.fill("#cash-what", "Two loads of sand");
  await page.locator("button[type=submit]").last().click();
  await page.waitForTimeout(2500);

  const afterSpend = await boxNow(page, state.box.id);
  if (afterSpend === "1,700.00") ok(`after spending ${SPENT}, the tin reads ${afterSpend}`);
  else bad(`after spending ${SPENT}, the tin reads ${afterSpend}; expected 1,700.00`);

  // Count it short, with no reason: it must be refused.
  await page.reload({ waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(1800);
  await page.getByRole("button", { name: /count what is in it/i }).first().click();
  await page.waitForTimeout(700);
  await page.fill("#cash-counted", COUNTED);
  await page.locator("button[type=submit]").last().click();
  await page.waitForTimeout(2000);

  const refused = await page.locator("[role=alert]").innerText().catch(() => "");
  if (/less in the box/i.test(refused)) ok("a short count with no reason is refused: " + refused.trim());
  else bad("a short count was accepted with no explanation: " + refused.trim());

  const reasonBox = page.locator("#cash-reason");
  if ((await reasonBox.count()) === 0) return stop("it refused but never asked why");
  ok("and it asks what happened");

  await reasonBox.fill("Paid the boat, no receipt");
  await page.locator("button[type=submit]").last().click();
  await page.waitForTimeout(2500);

  const afterCount = await boxNow(page, state.box.id);
  if (afterCount === "1,650.00") ok(`the books now agree with the tin: ${afterCount}`);
  else bad(`the books read ${afterCount}, the tin holds ${COUNTED}`);

  // The journal is the proof.
  const journal = await page.evaluate(async () => {
    const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company") };
    const f = await fetch("/api/figures", { credentials: "include", headers }).then((r) => r.json());
    return f.recent.map((e) => e.narrative || "");
  });

  const difference = journal.find((n) => /short by 50\.00/i.test(n));
  if (difference) ok("the journal says what was missing: " + difference);
  else bad("the journal does not record the difference");

  if (difference && /no receipt/i.test(difference)) ok("and what was said about it");
  else bad("the reason is not in the journal");

  const sand = journal.find((n) => /two loads of sand/i.test(n));
  if (sand) ok("the spend is in the books in the words used: " + sand);
  else bad("the cash spend never reached the journal");

  await browser.close();
  console.log(process.exitCode ? "\nsomething is wrong\n" : "\nthe tin and the books agree\n");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

async function boxNow(page, boxId) {
  return page.evaluate(async (id) => {
    const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company") };
    const boxes = (await fetch("/api/cash", { credentials: "include", headers }).then((r) => r.json())).boxes;
    const box = boxes.find((b) => b.id === id);
    return box ? box.inBox : "(gone)";
  }, boxId);
}

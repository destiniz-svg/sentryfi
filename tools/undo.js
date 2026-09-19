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

const BASE = process.env.SHOOT_BASE || "https://sentryfi.app";
const SUPPLIER = `Undo Test ${Date.now().toString().slice(-6)}`;
const AMOUNT = "21.00";

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  console.log(`\n${BASE} — the ten-second undo\n`);

  await page.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 60000 });
  await page.fill("input[type=email]", process.env.SHOOT_EMAIL);
  await page.fill("input[type=password]", process.env.SHOOT_PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 45000 });
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

  const row = page.locator(".phone-row", { hasText: SUPPLIER });
  if ((await row.count()) > 0) ok("the bill is on the rule");
  else return void bad("the bill never appeared");

  const put = row.getByRole("button", { name: /put it in the books/i });
  if ((await put.count()) === 0) {
    bad("no way to put it in the books — it is probably blocked on its tax");
    console.log("    row said: " + (await row.innerText()).replace(/\n/g, " · "));
  } else {
    await put.click();
    await page.waitForTimeout(2500);

    const strip = page.locator(".phone-strip");
    if ((await strip.count()) > 0) ok("the strip offered the undo");
    else bad("nothing offered an undo");

    const counting = await strip.innerText().catch(() => "");
    if (/[0-9]+ *s/i.test(counting)) ok("it is counting down: " + counting.replace(/\n/g, " "));
    else bad("no countdown in the strip");

    await strip.getByRole("button", { name: /undo/i }).click();
    await page.waitForTimeout(3000);

    const after = await page.locator(".phone-strip").innerText().catch(() => "");
    if (/taken back out/i.test(after)) ok("it said what it did: " + after.replace(/\n/g, " "));
    else bad("no honest account of the undo: " + after.replace(/\n/g, " "));
  }

  // The books are the proof, not the screen.
  const books = await page.evaluate(async () => {
    const ctx = await fetch("/api/companies", { credentials: "include" }).then((r) => r.json());
    const headers = { "X-Company-Id": ctx?.companies?.[0]?.id };
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
  const cleaned = await page.evaluate(async (target) => {
    const ctx = await fetch("/api/companies", { credentials: "include" }).then((r) => r.json());
    const headers = { "X-Company-Id": ctx?.companies?.[0]?.id, "Content-Type": "application/json" };
    const bills = (await fetch("/api/bills", { credentials: "include", headers }).then((r) => r.json())).bills;
    const match = bills.filter((b) => b.supplier_name === target && !b.voided_at);
    if (match.length !== 1) return `left alone: ${match.length} matched`;
    const res = await fetch(`/api/bills/${match[0].id}`, {
      method: "DELETE", credentials: "include", headers,
      body: JSON.stringify({ reason: "Check of the ten-second undo. Not a real bill." }),
    });
    return res.ok ? "voided" : `could not void (${res.status})`;
  }, SUPPLIER);
  console.log(`
  clean-up: ${SUPPLIER} — ${cleaned}`);
  await browser.close();
  console.log(process.exitCode ? "\nsomething is wrong\n" : "\nthe undo is real\n");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

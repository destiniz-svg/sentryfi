/**
 * An invoice's whole life, on the desk, against the ledger.
 *
 * Raises Altura's own invoice — an excavator at 3,000 a day for thirty days,
 * 8% on top — puts it in the books, takes half the money in, credits two days
 * that were not worked, and then asks the ledger rather than the screen:
 * did what customers owe move by exactly the right amount, and did the GST
 * owed to the tax authority go up by the tax charged and down by the tax
 * credited?
 *
 * Every figure is compared as a change from before the check, because the
 * checks company keeps what earlier runs left in it. Nothing here touches a
 * real company.
 *
 *   node tools/invoices.js
 */

const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const CUSTOMER = `Check Customer ${Date.now().toString().slice(-6)}`;
const PO = `PO-CHECK-${Date.now().toString().slice(-5)}`;

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

let browser;
setTimeout(() => {
  console.log("  FAIL the check did not finish within four minutes");
  process.exit(1);
}, 240000).unref?.();

const laari = (s) => {
  const [w, f = ""] = String(s || "0").replace(/,/g, "").split(".");
  return BigInt(w || "0") * 100n + BigInt((f + "00").slice(0, 2));
};
const show = (l) => {
  const neg = l < 0n;
  const a = neg ? -l : l;
  return `${neg ? "-" : ""}${(a / 100n).toLocaleString("en-US")}.${String(a % 100n).padStart(2, "0")}`;
};

async function figures(page) {
  return page.evaluate(async () => {
    const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company") };
    return fetch("/api/figures", { credentials: "include", headers }).then((r) => r.json());
  });
}

async function rowFor(page) {
  return page.locator("div.grid", { hasText: CUSTOMER }).last();
}

(async () => {
  browser = await chromium.launch({ channel: "chrome" });
  console.log(`\n${BASE} — an invoice from raising to settling\n`);
  const { page } = await signIn(browser, { phone: false });

  const before = await figures(page);

  await page.goto(BASE + "/invoices", { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(1200);

  // ---- raise ------------------------------------------------------------
  await page.getByRole("button", { name: /new invoice/i }).first().click();
  await page.waitForTimeout(900);

  const suggested = await page.inputValue("#inv-no");
  if (/\d+$/.test(suggested)) ok(`the number continues the company's run: ${suggested}`);
  else bad(`no invoice number was suggested (got "${suggested}")`);

  const blocked = await page.locator("button[type=submit]").last().innerText();
  if (/who is it to/i.test(blocked)) ok(`an empty invoice names what is missing: "${blocked.trim()}"`);
  else bad(`the empty commitment reads "${blocked.trim()}"`);

  await page.fill("#inv-customer", CUSTOMER);
  await page.fill("#inv-po", PO);
  await page.fill("#inv-subject", "Excavator rental, 30 days");
  await page.getByLabel("Line 1: what it is").fill("Excavator rental, Komatsu PC 56-7");
  await page.getByLabel("Line 1: quantity").fill("30");
  await page.getByLabel("Line 1: unit").fill("DAY");
  await page.getByLabel("Line 1: rate").fill("3000");
  await page.waitForTimeout(400);

  const commit = await page.locator("button[type=submit]").last().innerText();
  if (/MVR 97,200\.00/.test(commit)) ok(`the commitment names the total: "${commit.trim()}"`);
  else bad(`expected MVR 97,200.00 on the button, got "${commit.trim()}"`);

  await page.locator("button[type=submit]").last().click();
  await page.waitForTimeout(2500);

  let row = await rowFor(page);
  if ((await row.count()) && /draft/i.test(await row.innerText())) ok("it is saved as a draft");
  else return stop("the invoice did not appear as a draft");

  const draftFigures = await figures(page);
  if (draftFigures.owedToUs === before.owedToUs) ok("a draft moves nothing in the books");
  else bad(`a draft changed what is owed: ${before.owedToUs} → ${draftFigures.owedToUs}`);

  // ---- into the books ------------------------------------------------------
  await row.getByRole("button", { name: /put in the books/i }).click();
  await page.waitForTimeout(2500);
  row = await rowFor(page);
  if (/owed/i.test(await row.innerText())) ok("in the books, it is owed");
  else bad("after posting, the row does not say it is owed: " + (await row.innerText()).replace(/\n/g, " · "));

  const posted = await figures(page);
  const owedUp = laari(posted.owedToUs) - laari(before.owedToUs);
  const gstUp = laari(posted.gstOwed) - laari(before.gstOwed);
  if (owedUp === 9720000n) ok(`what customers owe went up by ${show(owedUp)}`);
  else bad(`what customers owe moved by ${show(owedUp)}, not 97,200.00`);
  if (gstUp === 720000n) ok(`GST owed to the tax authority went up by ${show(gstUp)} — owed, not claimed`);
  else bad(`GST owed moved by ${show(gstUp)}, not 7,200.00`);
  if (posted.owedToSuppliers === before.owedToSuppliers) {
    ok("and none of it shows up as owed to suppliers");
  } else {
    bad(`owed to suppliers moved: ${before.owedToSuppliers} → ${posted.owedToSuppliers}`);
  }

  // ---- half the money in ---------------------------------------------------
  await row.getByRole("button", { name: /money in/i }).click();
  await page.waitForTimeout(900);
  await page.fill("#receive-amount", "50000");
  await page.fill("#receive-reference", "BML transfer, check run");
  await page.locator("button[type=submit]").last().click();
  await page.waitForTimeout(2500);

  row = await rowFor(page);
  if (/47,200\.00 left/.test(await row.innerText())) ok("half paid, it shows 47,200.00 left");
  else bad("after 50,000 in, the row reads: " + (await row.innerText()).replace(/\n/g, " · "));

  // ---- two days credited ---------------------------------------------------
  await row.getByRole("button", { name: /credit note/i }).click();
  await page.waitForTimeout(900);
  await page.fill("#credit-amount", "6480");
  await page.locator("button[type=submit]").last().click();
  await page.waitForTimeout(700);
  const needsWhy = await page.locator("[role=alert]").innerText().catch(() => "");
  if (/why/i.test(needsWhy)) ok("a credit note with no reason is refused");
  else bad("a credit note went through with no reason");

  await page.fill("#credit-reason", "Two days were not worked");
  await page.locator("button[type=submit]").last().click();
  await page.waitForTimeout(2500);

  row = await rowFor(page);
  if (/40,720\.00 left/.test(await row.innerText())) ok("after crediting two days, 40,720.00 is left");
  else bad("after the credit note, the row reads: " + (await row.innerText()).replace(/\n/g, " · "));

  const after = await figures(page);
  const owedNet = laari(after.owedToUs) - laari(before.owedToUs);
  const gstNet = laari(after.gstOwed) - laari(before.gstOwed);
  if (owedNet === 4072000n) ok(`the ledger agrees: customers owe ${show(owedNet)} more than before`);
  else bad(`the ledger says customers owe ${show(owedNet)} more, not 40,720.00`);
  if (gstNet === 672000n) ok(`and GST owed is up 6,720.00 — the 480.00 on the credited days came back out`);
  else bad(`GST owed is up ${show(gstNet)}, not 6,720.00`);

  // ---- the aged list is the ledger's -----------------------------------
  const aged = await page.evaluate(async (customer) => {
    const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company") };
    const a = await fetch("/api/sales/aged", { credentials: "include", headers }).then((r) => r.json());
    return a.invoices.find((i) => i.customer === customer) || null;
  }, CUSTOMER);
  if (aged && aged.outstanding === "40,720.00") ok(`the aged list carries it at ${aged.outstanding}`);
  else bad("the aged list does not agree: " + JSON.stringify(aged));

  // ---- a posted invoice cannot be discarded; a draft can -------------------
  row = await rowFor(page);
  if ((await row.getByRole("button", { name: /^discard$/i }).count()) === 0) {
    ok("an invoice in the books offers no discard — it is credited instead");
  } else {
    bad("a posted invoice offers to be discarded");
  }

  // A name nothing like the first, so the fuzzy customer match — which is
  // meant to catch "Road Development Corp." — does not file it under the first.
  const scrap = `Scrap Draft ${Date.now().toString().slice(-6)}`;
  await page.getByRole("button", { name: /new invoice/i }).first().click();
  await page.waitForTimeout(900);
  await page.fill("#inv-customer", scrap);
  await page.getByLabel("Line 1: rate").fill("100");
  await page.locator("button[type=submit]").last().click();
  await page.waitForTimeout(2500);

  const scrapRow = page.locator("div.grid", { hasText: scrap }).last();
  const appeared = await scrapRow
    .waitFor({ timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) {
    const alerts = await page.locator("[role=alert]").allInnerTexts();
    const dialog = await page.locator("[role=dialog]").count();
    return stop(
      `the scrap draft never appeared (dialog open: ${dialog > 0}, alerts: ${JSON.stringify(alerts)})`
    );
  }
  await scrapRow.getByRole("button", { name: /^discard$/i }).click();
  await page.waitForTimeout(700);
  await page.locator("[role=dialog] input, [role=dialog] textarea").first().fill("Raised by the check, not real");
  await page.locator("[role=dialog] button[type=submit], [role=dialog] button:has-text('Void')").last().click();
  await page.waitForTimeout(2500);

  if ((await page.locator("div.grid", { hasText: scrap }).count()) === 0) {
    ok("a draft can be discarded, and it leaves the list");
  } else {
    bad("the discarded draft is still in the list");
  }

  await browser.close();
  console.log(process.exitCode ? "\nsomething is wrong\n" : "\nthe invoice and the books agree\n");
})().catch(async (e) => {
  console.error(e.message);
  if (browser) await browser.close();
  process.exit(1);
});

async function stop(why) {
  bad(why);
  if (browser) await browser.close();
}

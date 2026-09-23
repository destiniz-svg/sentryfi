/**
 * Stock, end to end, live, in the test company.
 *
 * Adds an item and ten already on hand at 100.00, records a bill and says on
 * the bill (through its Stock dialog) that it brought in ten more at 130.00,
 * puts it in the books, and reads an average cost of 115.00. Checks an invoice
 * line offers the item and fills in its name and price, sells five through the
 * API, and reads what they earned over cost. Counts one short. Screenshots the
 * page on the desk and on a phone.
 *
 *   node tools/stock.js
 */
const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const api = (page, method, url, body) =>
  page.evaluate(
    async ([m, u, b]) => {
      const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company"), "Content-Type": "application/json" };
      const r = await fetch("/api" + u, { method: m, credentials: "include", headers, body: b ? JSON.stringify(b) : undefined });
      return { status: r.status, json: await r.json().catch(() => null) };
    },
    [method, url, body]
  );

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const { page, context } = await signIn(browser, { phone: false });
    const tag = Date.now() % 1000000;
    const name = `Check cement ${tag}`;
    const supplier = `Check stock supplier ${tag}`;
    const row = () => page.locator('[data-testid="stock-row"]', { hasText: name });

    await page.goto(BASE + "/stock", { waitUntil: "networkidle", timeout: 45000 });
    await page.getByRole("heading", { name: "Stock" }).first().waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /add an item/i }).click();
    await page.fill("#item-name", name);
    await page.fill("#item-unit", "bag");
    await page.fill("#item-price", "150.00");
    await page.getByRole("button", { name: /^add it$/i }).click();
    await row().waitFor({ timeout: 15000 });
    ok(`${name} added`);

    await row().getByRole("button", { name: /already had some/i }).click();
    await page.fill("#opening-qty", "10");
    await page.fill("#opening-cost", "100.00");
    await page.getByRole("button", { name: /add to stock/i }).click();
    await page.locator("#opening-qty").waitFor({ state: "detached", timeout: 15000 });
    await page.waitForTimeout(1200);
    if (/1,000\.00/.test(await row().innerText())) ok("ten already on hand at 100.00: worth 1,000.00");
    else bad(`after opening stock the row reads: ${(await row().innerText()).replace(/\s+/g, " ")}`);

    // Drafts a failed run left behind are voided, so they cannot be mistaken for this one.
    for (const b of (await api(page, "GET", "/bills")).json.bills) {
      if ((/^STK-/.test(b.bill_no || "") || /^Check stock supplier/.test(b.supplier_name || "")) && b.status !== "posted" && !b.voided_at) await api(page, "DELETE", `/bills/${b.id}`, { reason: "left by a failed stock check" });
    }
    const billNo = `STK-${tag}`;
    const bill = await api(page, "POST", "/bills", { supplierName: supplier, billNo, amount: "1300.00", gstTreatment: "none_unregistered", issueDate: today() });
    if (bill.status !== 201) throw new Error(`the bill was not recorded: ${JSON.stringify(bill.json)}`);
    // A close supplier name is filed under the one already known, so the row is found by its bill number.
    await page.goto(BASE + "/bills", { waitUntil: "networkidle" });
    const billRow = page.locator("div.group", { hasText: billNo }).first();
    await billRow.getByRole("button", { name: /^stock on the bill/i }).click();
    await page.getByLabel("Item").selectOption({ label: name });
    await page.getByLabel("How many").fill("10");
    await page.getByRole("button", { name: /all of it is this item/i }).click();
    const said = await page.getByTestId("bill-stock-rest").innerText();
    if (/whole bill is stock/i.test(said)) ok("the Stock dialog says the whole bill is stock");
    else bad(`the Stock dialog says: ${said}`);
    await page.getByRole("button", { name: /^save$/i }).click();
    await page.getByLabel("How many").waitFor({ state: "detached", timeout: 15000 });
    await billRow.getByRole("button", { name: /put in the books/i }).click();
    await page.getByText(/Entry \d+ · MVR 1,300\.00/).waitFor({ timeout: 15000 });
    ok("the bill is in the books");

    await page.goto(BASE + "/stock", { waitUntil: "networkidle" });
    const bought = (await row().innerText()).replace(/\s+/g, " ");
    if (/20 bag/.test(bought) && /115\.00/.test(bought) && /2,300\.00/.test(bought)) ok("20 on hand at an average of 115.00, worth 2,300.00");
    else bad(`after the bill the row reads: ${bought}`);

    await page.goto(BASE + "/invoices", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /new invoice/i }).first().click();
    await page.getByLabel("Line 1: from stock").selectOption({ label: `${name} · 20 bag on hand` });
    const desc = await page.getByLabel("Line 1: what it is").inputValue();
    const rate = await page.getByLabel("Line 1: rate").inputValue();
    if (desc === name && rate === "150.00") ok("an invoice line offers the item and fills in its name and price");
    else bad(`the line filled in "${desc}" at "${rate}"`);
    await page.keyboard.press("Escape");

    const itemId = (await api(page, "GET", "/stock")).json.items.find((i) => i.name === name).id;
    const inv = await api(page, "POST", "/sales", {
      customerName: `Check stock customer ${tag}`, gstTreatment: "none_unregistered", issueDate: today(),
      lines: [{ description: name, quantity: 5, unitPrice: "150.00", itemId }],
    });
    const posted = await api(page, "POST", `/sales/${inv.json.invoice.id}/post`);
    if (posted.status !== 200) throw new Error(`the invoice did not post: ${JSON.stringify(posted.json)}`);
    const over = await api(page, "POST", "/sales", {
      customerName: `Check stock customer ${tag}`, gstTreatment: "none_unregistered", issueDate: today(),
      lines: [{ description: name, quantity: 50, unitPrice: "150.00", itemId }],
    });
    const refused = await api(page, "POST", `/sales/${over.json.invoice.id}/post`);
    if (refused.status === 400 && /Only 15 bag/.test(refused.json?.error?.message || "")) ok("selling 50 when 15 are there is refused, and says why");
    else bad(`selling more than on hand answered ${refused.status}: ${JSON.stringify(refused.json)}`);
    await api(page, "DELETE", `/sales/${over.json.invoice.id}`, { reason: "check: more than on hand" });

    await page.goto(BASE + "/stock", { waitUntil: "networkidle" });
    const sold = (await row().innerText()).replace(/\s+/g, " ");
    // Five at 150.00 = 750.00, costing 5 x 115.00 = 575.00: 175.00 over cost.
    if (/15 bag/.test(sold) && /1,725\.00/.test(sold) && /175\.00/.test(sold)) ok("sold five: 15 left worth 1,725.00, and 175.00 earned over cost");
    else bad(`after the sale the row reads: ${sold}`);

    await row().getByRole("button", { name: /^count$/i }).click();
    await page.fill("#count-qty", "14");
    await page.fill("#count-note", "One bag split");
    await page.getByRole("button", { name: /record the count/i }).click();
    await page.getByText(/1 short/).waitFor({ timeout: 15000 });
    await page.waitForTimeout(1000);
    if (/14 bag/.test(await row().innerText()) && /1,610\.00/.test(await row().innerText())) ok("counted one short: 14 left, worth 1,610.00");
    else bad(`after the count the row reads: ${(await row().innerText()).replace(/\s+/g, " ")}`);
    await page.screenshot({ path: "shots/stock-desk.png", fullPage: true });

    await row().getByRole("button").first().click();
    await page.getByText(/Counted 1 bag|Counted -1|Counted/).first().waitFor({ timeout: 10000 });
    const hist = await page.locator("[role=dialog]").innerText();
    if (/Already had 10/.test(hist) && /Bought 10/.test(hist) && /Sold 5/.test(hist)) ok("its history lists what came in, went out, and the count");
    else bad(`the history reads: ${hist.replace(/\s+/g, " ")}`);
    await context.close();

    const phone = await signIn(browser, { phone: true });
    await phone.page.goto(BASE + "/stock", { waitUntil: "networkidle" });
    await phone.page.locator('[data-testid="stock-row"]', { hasText: name }).waitFor({ timeout: 15000 });
    const wide = await phone.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (!wide) ok("on a phone the page fits, with no sideways scroll");
    else bad("on a phone the page scrolls sideways");
    await phone.page.screenshot({ path: "shots/stock-phone.png", fullPage: true });
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();

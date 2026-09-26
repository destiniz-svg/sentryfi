/**
 * A second unit, in the test company. Names are made up.
 *
 * A tile is kept by the piece and comes in boxes of 12. It is added on the
 * Items page with its box; a bill for 5 boxes brings in 60 pieces; on a new
 * invoice, choosing "box of 12" prices the line by the box; a sale of 2 boxes
 * takes out 24 pieces; and a count is entered as boxes and loose pieces.
 *
 *   node tools/packs.js
 */
const crypto = require("node:crypto");
const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};
const word = () => Array.from({ length: 6 }, () => "bcdfghjklmnpqrstvwxz"[Math.floor(Math.random() * 20)]).join("");
const today = () => new Date().toISOString().slice(0, 10);
const api = (page, method, url, body) =>
  page.evaluate(
    async ([m, u, b]) => {
      const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company"), "Content-Type": "application/json" };
      const r = await fetch("/api" + u, { method: m, credentials: "include", headers, body: b ? JSON.stringify(b) : undefined });
      return { status: r.status, json: await r.json().catch(() => null) };
    },
    [method, url, body]
  );
const shot = (page, name) => page.screenshot({ path: `${process.env.TEMP}/packs-${name}.png`, fullPage: false });
const settle = (page) => page.waitForTimeout(700);
const held = async (page, id) => (await api(page, "GET", "/stock")).json.items.find((i) => i.id === id);

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const { page } = await signIn(browser, { phone: false });
    const w = word();
    const name = `Check tile ${w}`;

    // 1. Added on the Items page, with its box.
    await page.goto(`${BASE}/stock`, { waitUntil: "networkidle", timeout: 45000 });
    await page.getByRole("button", { name: "Add an item" }).click();
    await page.locator("#item-name").fill(name);
    await page.locator("#item-unit").fill("piece");
    await page.locator("#item-pack-unit").fill("box");
    await page.locator("#item-pack-size").fill("12");
    await settle(page);
    await shot(page, "item-form");
    await page.getByRole("button", { name: /^(Save|Add it|Add the item)$/ }).first().click();
    await page.getByTestId("stock-row").filter({ hasText: name }).waitFor({ timeout: 20000 });
    let it = (await api(page, "GET", "/stock")).json.items.find((i) => i.name === name);
    if (it?.packUnit === "box" && it.packSize === "12") ok("the item keeps its box of 12");
    else bad(`the item reads ${JSON.stringify(it && { unit: it.unit, packUnit: it.packUnit, packSize: it.packSize })}`);
    await api(page, "PATCH", `/stock/${it.id}`, { salePrice: "10.00" });

    // 2. A bill for 5 boxes brings in 60 pieces.
    const bill = (await api(page, "POST", "/bills", { supplierName: `Check supplier ${w}`, billNo: `PK-${w}`, amount: "600", gstTreatment: "none_unregistered", issueDate: today() })).json?.bill;
    await api(page, "PUT", `/bills/${bill.id}/split`, { lines: [{ kind: "stock", itemId: it.id, quantity: "5", unit: "box", amount: "600" }] });
    if ((await api(page, "POST", `/bills/${bill.id}/post`)).status !== 200) throw new Error("bill not posted");
    it = await held(page, it.id);
    if (it.onHand === "60" && it.onHandPacks === "5 box" && it.averageCost === "10.00") ok("a bill for 5 boxes brought in 60 pieces at 10.00 each");
    else bad(`on hand ${it.onHand} (${it.onHandPacks}), average ${it.averageCost}`);
    await page.goto(`${BASE}/stock`, { waitUntil: "networkidle" });
    const row = (await page.getByTestId("stock-row").filter({ hasText: name }).innerText()).replace(/\s+/g, " ");
    if (row.includes("= 5 box")) ok(`the Items row reads "${row.slice(0, 80)}…"`);
    else bad(`the Items row reads "${row}"`);
    await shot(page, "items");

    // 3. On a new invoice, "box of 12" prices the line by the box.
    const customer = `Check customer ${w}`;
    const custId = (await api(page, "POST", "/contacts", { name: customer, customer: true })).json?.id;
    await page.goto(`${BASE}/invoices/new?customer=${encodeURIComponent(customer)}`, { waitUntil: "networkidle", timeout: 45000 });
    const search = page.getByPlaceholder("Search items and services");
    await search.waitFor({ timeout: 20000 });
    await search.fill(name);
    await page.getByRole("button", { name: new RegExp(name) }).first().click();
    await page.getByTestId("qty-rate").waitFor({ timeout: 15000 });
    await page.getByRole("radio", { name: "box of 12" }).click();
    await settle(page);
    await shot(page, "invoice-box");
    const rate = await page.getByLabel("Rate", { exact: true }).inputValue();
    if (rate === "120.00") ok("choosing box of 12 prices it at 120.00 a box");
    else bad(`the rate reads ${rate}`);
    await page.getByTestId("qty-add").click();
    await page.keyboard.press("Escape");
    const lineUnit = await page.getByLabel("Line 1: unit").inputValue().catch(() => "");
    if (lineUnit === "box") ok("the line is in boxes");
    else bad(`the line's unit reads "${lineUnit}"`);

    // 4. A sale of 2 boxes takes out 24 pieces.
    const due = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
    const inv = await api(page, "POST", "/sales", { clientRef: crypto.randomUUID(), customerName: customer, counterpartyId: custId, dueDate: due, gstTreatment: "none_unregistered", lines: [{ description: name, quantity: 2, uom: "box", unitPrice: "120.00", itemId: it.id }] });
    const invId = inv.json?.invoice?.id || inv.json?.id;
    const posted = invId ? await api(page, "POST", `/sales/${invId}/post`) : { status: 0, json: inv.json };
    it = await held(page, it.id);
    if (it.onHand === "36" && it.onHandPacks === "3 box") ok("a sale of 2 boxes took out 24 pieces: 36 left, 3 box");
    else bad(`after the sale: on hand ${it.onHand} (${it.onHandPacks}); invoice ${inv.status}, post ${posted.status} ${JSON.stringify(posted.json).slice(0, 200)}`);

    // 5. Counted as boxes and loose pieces.
    for (const c of (await api(page, "GET", "/counts")).json.counts.filter((x) => x.place === "Main store" && ["counting", "submitted"].includes(x.status))) await api(page, "POST", `/counts/${c.id}/cancel`);
    const me = (await api(page, "GET", "/auth/me")).json?.user;
    const count = (await api(page, "POST", "/counts", { kind: "full", placeId: null, counterId: me.id })).json;
    await page.goto(`${BASE}/counts/${count.id}`, { waitUntil: "networkidle" });
    const line = page.getByTestId("count-line").filter({ hasText: name });
    await line.getByLabel(`${name}: how many box`).fill("2");
    await line.getByLabel(`${name}: loose piece`).fill("11");
    await line.getByLabel(`${name}: loose piece`).blur();
    await settle(page);
    await shot(page, "count");
    const saved = (await api(page, "GET", `/counts/${count.id}`)).json.lines.find((l) => l.name === name);
    if (saved?.counted === "35") ok("2 box and 11 loose saved as 35 pieces");
    else bad(`the count saved ${saved?.counted}`);
    // The same line on a phone: both boxes on screen, nothing wider than it.
    const phone = await signIn(browser, { phone: true });
    await phone.page.goto(`${BASE}/counts/${count.id}`, { waitUntil: "networkidle", timeout: 45000 });
    const pline = phone.page.getByTestId("count-line").filter({ hasText: name });
    await pline.scrollIntoViewIfNeeded();
    await settle(phone.page);
    await shot(phone.page, "count-phone");
    const wide = await phone.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (!wide) ok("the box-and-piece count fits a phone");
    else bad("the count scrolls sideways on a phone");
    await api(page, "POST", `/counts/${count.id}/cancel`);
  } catch (e) {
    bad(e.message);
  } finally {
    await browser.close();
  }
})();

/**
 * Promised and coming, in the test company. Names are made up.
 *
 * Ten bags are held. A sales order promises 4; a purchase order brings 2
 * pallets of 10. The Items row says 4 promised, 20 on order, 6 free; adding
 * the item to an invoice says 6 are free to sell; a second sales order for 9
 * promises more than is free, and the Stock page says so. The orders are
 * cancelled after, so the test company is not left holding promises.
 *
 *   node tools/promised.js
 */
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
const shot = (page, name) => page.screenshot({ path: `${process.env.TEMP}/promised-${name}.png`, fullPage: false });
const settle = (page) => page.waitForTimeout(700);

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const made = [];
  let page;
  try {
    ({ page } = await signIn(browser, { phone: false }));
    const w = word();
    const name = `Check blocks ${w}`;
    const item = (await api(page, "POST", "/stock", { name, unit: "bag", packUnit: "pallet", packSize: "10", salePrice: "200" })).json?.item;
    const bill = (await api(page, "POST", "/bills", { supplierName: `Check supplier ${w}`, billNo: `PR-${w}`, amount: "1000", gstTreatment: "none_unregistered", issueDate: today() })).json?.bill;
    await api(page, "PUT", `/bills/${bill.id}/split`, { lines: [{ kind: "stock", itemId: item.id, quantity: "10", amount: "1000" }] });
    if ((await api(page, "POST", `/bills/${bill.id}/post`)).status !== 200) throw new Error("bill not posted");
    const order = async (body) => {
      const r = await api(page, "POST", "/orders", body);
      if (r.json?.id) made.push(r.json.id);
      return r;
    };
    await order({ kind: "sale", partyName: `Check customer ${w}`, lines: [{ itemId: item.id, quantity: 4, unitPrice: 200 }] });
    const po = await order({ kind: "purchase", partyName: `Check supplier ${w}`, lines: [{ itemId: item.id, quantity: 2, unit: "pallet", unitPrice: 1000 }] });
    if (po.json?.approved === false) await api(page, "POST", `/orders/${po.json.id}/approve`);

    await page.goto(`${BASE}/stock`, { waitUntil: "networkidle", timeout: 45000 });
    const row = page.getByTestId("stock-row").filter({ hasText: name });
    const said = (await row.getByTestId("promised").innerText()).trim();
    if (said === "4 promised · 20 on order · 6 free") ok(`the Items row reads "${said}"`);
    else bad(`the Items row reads "${said}"`);
    await shot(page, "items");

    // Adding it to an invoice says what is free to sell.
    await page.goto(`${BASE}/invoices/new?customer=${encodeURIComponent(`Check customer ${w}`)}`, { waitUntil: "networkidle" });
    const search = page.getByPlaceholder("Search items and services");
    await search.waitFor({ timeout: 20000 });
    await search.fill(name);
    await page.getByRole("button", { name: new RegExp(name) }).first().click();
    const held = (await page.getByTestId("qty-held").innerText()).trim();
    await settle(page);
    await shot(page, "picker");
    if (held === "6 bag free to sell (10 on hand, 4 promised)") ok(`the picker says "${held}"`);
    else bad(`the picker says "${held}"`);
    await page.keyboard.press("Escape");

    // Nine more promised than is free: the Stock page says so.
    await order({ kind: "sale", partyName: `Check customer ${w}`, lines: [{ itemId: item.id, quantity: 9, unitPrice: 200 }] });
    await page.goto(`${BASE}/inventory`, { waitUntil: "networkidle" });
    const card = page.getByTestId("snapshot-promised");
    await card.waitFor({ timeout: 20000 });
    const line = (await card.innerText()).replace(/\s+/g, " ");
    if (line.includes(name) && line.includes("13 bag promised to customers") && line.includes("20 on order") && /Oversold/.test(line)) ok("the Stock page lists it as promised, coming and oversold");
    else bad(`promised and coming reads "${line.slice(0, 300)}"`);
    const wrong = (await page.getByTestId("snapshot-wrong").innerText()).replace(/\s+/g, " ");
    if (wrong.includes(`3 bag more of ${name} are promised to customers than are free to sell`)) ok("what looks wrong says 3 more are promised than are free");
    else bad(`what looks wrong reads "${wrong.slice(0, 300)}"`);
    await card.scrollIntoViewIfNeeded();
    await shot(page, "snapshot");
  } catch (e) {
    bad(e.message);
  } finally {
    if (page) for (const id of made) await api(page, "POST", `/orders/${id}/cancel`).catch(() => {});
    await browser.close();
  }
})();

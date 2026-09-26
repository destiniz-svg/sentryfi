/**
 * Batches and expiry, in the test company. Names are made up.
 *
 * Paint is added on the Items page with batches switched on. Two bills bring
 * in two batches, one expiring in 10 days, one in 60; the second is said on the
 * bill's own What it was for screen. The Items row names the next batch out, the
 * item's sheet lists both, a sale takes the one expiring first, and the Stock
 * page warns that it is expiring.
 *
 *   node tools/batches.js
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
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const api = (page, method, url, body) =>
  page.evaluate(
    async ([m, u, b]) => {
      const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company"), "Content-Type": "application/json" };
      const r = await fetch("/api" + u, { method: m, credentials: "include", headers, body: b ? JSON.stringify(b) : undefined });
      return { status: r.status, json: await r.json().catch(() => null) };
    },
    [method, url, body]
  );
const shot = (page, name) => page.screenshot({ path: `${process.env.TEMP}/batches-${name}.png`, fullPage: false });
const settle = (page) => page.waitForTimeout(700);

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const { page } = await signIn(browser, { phone: false });
    const w = word();
    const name = `Check paint ${w}`;
    const soon = `SOON-${w}`;
    const late = `LATE-${w}`;

    // 1. Batches switched on for the item, on the Items page.
    await page.goto(`${BASE}/stock`, { waitUntil: "networkidle", timeout: 45000 });
    await page.getByRole("button", { name: "Add an item" }).click();
    await page.locator("#item-name").fill(name);
    await page.locator("#item-unit").fill("tin");
    await page.locator("#item-batches").check();
    await settle(page);
    await shot(page, "item-form");
    await page.getByRole("button", { name: /^(Save|Add it|Add the item)$/ }).first().click();
    await page.getByTestId("stock-row").filter({ hasText: name }).waitFor({ timeout: 20000 });
    let it = (await api(page, "GET", "/stock")).json.items.find((i) => i.name === name);
    if (it?.batches) ok("the item is kept in batches");
    else bad("batches were not switched on");

    // 2. A bill with its batch said by API, and one said on the bill's own screen.
    const bill = async (no, amount) => (await api(page, "POST", "/bills", { supplierName: `Check supplier ${w}`, billNo: no, amount, gstTreatment: "none_unregistered", issueDate: day(0) })).json?.bill;
    const b1 = await bill(`BT1-${w}`, "600");
    await api(page, "PUT", `/bills/${b1.id}/split`, { lines: [{ kind: "stock", itemId: it.id, quantity: "6", amount: "600", batchCode: late, expiresOn: day(60) }] });
    if ((await api(page, "POST", `/bills/${b1.id}/post`)).status !== 200) throw new Error("the first bill did not post");
    const b2 = await bill(`BT2-${w}`, "400");
    await api(page, "PUT", `/bills/${b2.id}/split`, { lines: [{ kind: "stock", itemId: it.id, quantity: "4", amount: "400" }] });
    const early = await api(page, "POST", `/bills/${b2.id}/post`);
    if (early.status >= 400 && /kept in batches/.test(JSON.stringify(early.json))) ok("a bill without its batch does not go into the books");
    else bad(`a bill without its batch answered ${early.status}`);
    await page.goto(`${BASE}/bills`, { waitUntil: "networkidle" });
    await page.locator("div.group", { hasText: `BT2-${w}` }).first().getByRole("button", { name: /^what the bill from .* was for$/i }).click();
    const batchBox = page.getByLabel("Line 1: batch");
    await batchBox.waitFor({ timeout: 15000 });
    await batchBox.fill(soon);
    await page.getByLabel("Line 1: expires on").fill(day(10));
    await settle(page);
    await shot(page, "bill-split");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await batchBox.waitFor({ state: "detached", timeout: 15000 });
    const posted = await api(page, "POST", `/bills/${b2.id}/post`);
    if (posted.status === 200) ok("the batch said on the bill's screen let it into the books");
    else bad(`the second bill did not post: ${JSON.stringify(posted.json).slice(0, 200)}`);

    // 3. The Items row names the next out; the item's sheet lists both.
    await page.goto(`${BASE}/stock`, { waitUntil: "networkidle" });
    const row = page.getByTestId("stock-row").filter({ hasText: name });
    const next = (await row.getByTestId("next-batch").innerText()).replace(/\s+/g, " ");
    if (next.includes(soon)) ok(`the Items row reads "${next}"`);
    else bad(`the Items row reads "${next}"`);
    await row.getByRole("button", { name: new RegExp(name) }).first().click();
    const list = page.getByTestId("batches");
    await list.waitFor({ timeout: 15000 });
    await settle(page);
    await shot(page, "sheet");
    const listed = (await list.innerText()).replace(/\s+/g, " ");
    if (listed.indexOf(soon) > -1 && listed.indexOf(late) > listed.indexOf(soon)) ok("the sheet lists both, the one expiring first on top");
    else bad(`the sheet reads "${listed}"`);
    await page.keyboard.press("Escape");

    // 4. A sale of 5 takes the 4 expiring first, then 1 of the other.
    const customer = `Check customer ${w}`;
    const custId = (await api(page, "POST", "/contacts", { name: customer, customer: true })).json?.id;
    const inv = await api(page, "POST", "/sales", { clientRef: crypto.randomUUID(), customerName: customer, counterpartyId: custId, dueDate: day(14), gstTreatment: "none_unregistered", lines: [{ description: name, quantity: 5, uom: "tin", unitPrice: "150.00", itemId: it.id }] });
    const invId = inv.json?.invoice?.id || inv.json?.id;
    await api(page, "POST", `/sales/${invId}/post`);
    const left = (await api(page, "GET", `/stock/${it.id}/batches`)).json.batches.map((b) => `${b.code} ${b.quantity}`);
    if (left.length === 1 && left[0] === `${late} 5`) ok(`after selling 5: ${left.join(", ")}`);
    else bad(`after selling 5: ${left.join(", ")}`);

    // 5. Another batch expiring in 10 days, and the Stock page says so.
    const b3 = await bill(`BT3-${w}`, "200");
    await api(page, "PUT", `/bills/${b3.id}/split`, { lines: [{ kind: "stock", itemId: it.id, quantity: "2", amount: "200", batchCode: `NEXT-${w}`, expiresOn: day(10) }] });
    await api(page, "POST", `/bills/${b3.id}/post`);
    await page.goto(`${BASE}/inventory`, { waitUntil: "networkidle" });
    const wrong = (await page.getByTestId("snapshot-wrong").innerText()).replace(/\s+/g, " ");
    if (wrong.includes(`batch NEXT-${w}`) && /Expiring/i.test(wrong)) ok("the Stock page warns the batch is expiring");
    else bad(`what looks wrong reads "${wrong.slice(0, 300)}"`);
    await shot(page, "snapshot");
  } catch (e) {
    bad(e.message);
  } finally {
    await browser.close();
  }
})();

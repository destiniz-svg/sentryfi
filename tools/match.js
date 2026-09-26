/**
 * A bill checked against its order, in the test company. Names are made up.
 *
 * A purchase order for 5 at MVR 100 has all arrived. The bill is made from the
 * order at MVR 120 a unit: it is held, Needs you and Approvals show it, and it
 * will not go in the books. Accepted in Approvals with a reason, it may. The
 * bill is then voided and the order closed, so nothing is left behind.
 *
 *   node tools/match.js
 */
const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};
const word = () => Array.from({ length: 6 }, () => "bcdfghjklmnpqrstvwxz"[Math.floor(Math.random() * 20)]).join("");
const api = (page, method, url, body) =>
  page.evaluate(
    async ([m, u, b]) => {
      const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company"), "Content-Type": "application/json" };
      const r = await fetch("/api" + u, { method: m, credentials: "include", headers, body: b ? JSON.stringify(b) : undefined });
      return { status: r.status, json: await r.json().catch(() => null) };
    },
    [method, url, body]
  );
const shot = (page, name) => page.screenshot({ path: `${process.env.TEMP}/match-${name}.png`, fullPage: false });
const settle = (page) => page.waitForTimeout(700);

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  let page, orderId, billId;
  try {
    ({ page } = await signIn(browser, { phone: false }));
    const w = word();
    const item = (await api(page, "POST", "/stock", { name: `Check tiles ${w}`, unit: "box" })).json?.item;
    const r = (await api(page, "POST", "/orders", { kind: "purchase", partyName: `Check supplier ${w}`, lines: [{ itemId: item.id, quantity: 5, unitPrice: 100 }] })).json;
    orderId = r.id;
    if (r.approved === false) await api(page, "POST", `/orders/${orderId}/approve`);
    const line = (await api(page, "GET", `/orders/${orderId}`)).json.lines[0].id;
    await api(page, "POST", `/orders/${orderId}/deliveries`, { lines: [{ orderLineId: line, quantity: 5 }] });

    // The bill, made from the order at a higher price.
    await page.goto(`${BASE}/orders/${orderId}`, { waitUntil: "networkidle", timeout: 45000 });
    await page.getByRole("button", { name: "Make the bill" }).first().click();
    await page.getByLabel(/Price each for/).fill("120");
    await page.locator("#bill-no").fill(`MT-${w}`);
    await settle(page);
    await page.getByRole("button", { name: "Make the bill" }).last().click();
    await page.waitForURL(/\/bills/, { timeout: 15000 });
    const bills = (await api(page, "GET", "/bills")).json.bills;
    billId = bills.find((b) => b.bill_no === `MT-${w}`)?.id;
    if (billId) ok("the bill was made from the order");
    else throw new Error("no bill made");

    const post = await api(page, "POST", `/bills/${billId}/post`);
    if (post.status === 400 && /priced above its order/.test(post.json?.error?.message || JSON.stringify(post.json))) ok("it will not go in the books while held");
    else bad(`posting answered ${post.status} ${JSON.stringify(post.json)}`);

    const attention = (await api(page, "GET", "/attention")).json.items.find((i) => i.href === `/approvals?open=match:${billId}`);
    if (attention && /MVR 120\.00 a unit on the bill, MVR 100\.00 on the order/.test(attention.detail)) ok(`Needs you: "${attention.title}"`);
    else bad(`Needs you has ${JSON.stringify(attention)}`);

    // Accepted in Approvals, with a reason.
    await page.goto(`${BASE}/approvals?open=match:${billId}`, { waitUntil: "networkidle", timeout: 45000 });
    const row = page.locator(`#approve-match-${billId}`);
    await row.waitFor({ timeout: 15000 });
    if (/bill priced above its order/i.test(await row.innerText())) ok("Approvals lists it");
    else bad(`the row reads "${(await row.innerText()).replace(/\s+/g, " ")}"`);
    const tol = await page.getByTestId("price-tolerance").innerText();
    if (/2%/.test(tol)) ok(`the tolerance reads "${tol.replace(/\s*Change$/, "")}"`);
    else bad(`the tolerance reads "${tol}"`);
    await row.getByRole("button", { name: "Accept the price" }).click();
    await row.getByLabel("Why the higher price is right").fill("Freight went up, agreed by phone");
    await settle(page);
    await shot(page, "accept");
    await row.getByRole("button", { name: "Accept it" }).click();
    await row.waitFor({ state: "detached", timeout: 15000 });
    ok("accepted, and gone from Approvals");
  } catch (e) {
    bad(e.message);
  } finally {
    if (page && billId) await api(page, "DELETE", `/bills/${billId}`, { reason: "Check bill, not real" }).catch(() => {});
    if (page && orderId) await api(page, "POST", `/orders/${orderId}/close`).catch(() => {});
    await browser.close();
  }
})();

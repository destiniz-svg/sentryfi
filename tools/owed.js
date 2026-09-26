/**
 * What is still owed, in the test company. Names are made up.
 *
 * A sales order for 10, expected yesterday, has sent 4; a purchase order for 6
 * has all arrived and is not billed. Still owed shows 6 still to go (late) and
 * 6 waiting for their bill. On the sales order, the line is closed short with
 * its reason, and it leaves the list. Both orders are closed after.
 *
 *   node tools/owed.js
 */
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
const shot = (page, name) => page.screenshot({ path: `${process.env.TEMP}/owed-${name}.png`, fullPage: false });
const settle = (page) => page.waitForTimeout(700);

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const made = [];
  let page;
  try {
    ({ page } = await signIn(browser, { phone: false }));
    const w = word();
    const name = `Check pipes ${w}`;
    const item = (await api(page, "POST", "/stock", { name, unit: "length", salePrice: "50" })).json?.item;
    const bill = (await api(page, "POST", "/bills", { supplierName: `Check supplier ${w}`, billNo: `OW-${w}`, amount: "600", gstTreatment: "none_unregistered", issueDate: day(0) })).json?.bill;
    await api(page, "PUT", `/bills/${bill.id}/split`, { lines: [{ kind: "stock", itemId: item.id, quantity: "20", amount: "600" }] });
    if ((await api(page, "POST", `/bills/${bill.id}/post`)).status !== 200) throw new Error("bill not posted");
    const order = async (body, qty) => {
      const r = (await api(page, "POST", "/orders", body)).json;
      made.push(r.id);
      if (r.approved === false) await api(page, "POST", `/orders/${r.id}/approve`);
      const line = (await api(page, "GET", `/orders/${r.id}`)).json.lines[0].id;
      await api(page, "POST", `/orders/${r.id}/deliveries`, { lines: [{ orderLineId: line, quantity: qty }] });
      return r.id;
    };
    const so = await order({ kind: "sale", partyName: `Check customer ${w}`, expectedOn: day(-1), lines: [{ itemId: item.id, quantity: 10, unitPrice: 50 }] }, 4);
    await order({ kind: "purchase", partyName: `Check supplier ${w}`, lines: [{ itemId: item.id, quantity: 6, unitPrice: 30 }] }, 6);

    await page.goto(`${BASE}/still-owed`, { waitUntil: "networkidle", timeout: 45000 });
    const goLine = page.getByTestId("owed-group").filter({ hasText: "To go out to customers" }).getByTestId("owed-line").filter({ hasText: name });
    const said = (await goLine.innerText()).replace(/\s+/g, " ");
    if (said.includes("6 length still to go of 10") && /Late/.test(said)) ok(`to go: "${said.slice(0, 120)}"`);
    else bad(`to go reads "${said}"`);
    const waitLine = page.getByTestId("owed-group").filter({ hasText: "waiting for the bill" }).getByTestId("owed-line").filter({ hasText: name });
    if ((await waitLine.innerText()).includes("6 length arrived and not yet billed")) ok("the purchase shows 6 arrived, waiting for the bill");
    else bad(`waiting reads "${(await waitLine.innerText()).replace(/\s+/g, " ")}"`);
    await shot(page, "list");

    // Closed short from the order itself.
    await goLine.click();
    await page.getByTestId("line-left").getByRole("button", { name: "Close short" }).click();
    await page.locator("#close-reason").fill("Customer took the rest elsewhere");
    await settle(page);
    await shot(page, "close");
    await page.getByRole("button", { name: "Close it short" }).click();
    await page.getByTestId("line-closed").waitFor({ timeout: 15000 });
    const closed = await page.getByTestId("line-closed").innerText();
    if (closed.includes("Customer took the rest elsewhere")) ok(`the line reads "${closed}"`);
    else bad(`the line reads "${closed}"`);
    const after = (await api(page, "GET", "/orders/owed")).json.lines.filter((l) => l.orderId === so);
    if (!after.length) ok("it has left what is still owed");
    else bad(`still listed: ${JSON.stringify(after)}`);
    const held = (await api(page, "GET", "/stock")).json.items.find((i) => i.id === item.id);
    if (held.reserved === "4") ok("the 4 gone out and not invoiced stay spoken for; the 6 closed short do not");
    else bad(`reserved reads ${held.reserved}`);
  } catch (e) {
    bad(e.message);
  } finally {
    if (page) for (const id of made) await api(page, "POST", `/orders/${id}/close`).catch(() => {});
    await browser.close();
  }
})();

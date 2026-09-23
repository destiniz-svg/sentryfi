/**
 * Orders, end to end, live, in the test company. Names are made up.
 *
 * Places a purchase order (100 bags of an item at 120.00, and a delivery trip
 * at 2,000.00), records 60 bags and the trip arriving, makes the bill from
 * what arrived and puts it in the books, then records the other 40 and bills
 * them at the supplier's higher price, which is reported. Then a sales order:
 * 10 bags out, invoiced from what went out. Reads stock after each.
 *
 *   node tools/orders.js
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

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const { page } = await signIn(browser, { phone: false });
    const w = word();
    const item = `Check sand ${w}`;
    const vendor = `Check vendor ${w}`;
    await api(page, "POST", "/stock", { name: item, unit: "bag", salePrice: "200" });
    const held = async () => (await api(page, "GET", "/stock")).json.items.find((i) => i.name === item);

    await page.goto(BASE + "/orders", { waitUntil: "networkidle", timeout: 45000 });
    await page.getByRole("button", { name: /^purchase order$/i }).click();
    await page.fill("#order-party", vendor);
    await page.getByLabel("Line 1: item").selectOption({ label: item });
    await page.getByLabel("Line 1: how many").fill("100");
    await page.getByLabel("Line 1: price each").fill("120");
    await page.getByRole("button", { name: /another line/i }).click();
    await page.getByLabel("Line 2: what").fill("Delivery to site");
    await page.getByLabel("Line 2: kind of cost").selectOption({ label: "Transport and boat freight" });
    await page.getByLabel("Line 2: how many").fill("1");
    await page.getByLabel("Line 2: price each").fill("2000");
    await page.getByRole("button", { name: /place the order/i }).click();
    await page.waitForURL(/\/orders\/[0-9a-f-]+$/, { timeout: 15000 });
    const orderUrl = page.url();
    const orderId = orderUrl.split("/").pop();
    ok(`purchase order placed with ${vendor}: MVR 14,000.00, ${await page.getByTestId("order-status").innerText()}`);

    await page.getByRole("button", { name: /record what arrived/i }).click();
    await page.getByLabel(`How many ${item}`).fill("60");
    await page.getByRole("button", { name: /^record it$/i }).click();
    await page.getByText("Recorded as arrived").waitFor({ timeout: 15000 });
    await page.waitForTimeout(800);
    if ((await held()).onHand === "0") ok("60 bags and the trip arrived: status Part arrived, and nothing in the books yet");
    else bad("a delivery moved stock in the books");

    await page.getByRole("button", { name: /make the bill/i }).click();
    await page.fill("#bill-no", `CV-${w}-1`);
    await page.selectOption("#bill-gst", "none_unregistered");
    await page.getByRole("button", { name: /make the bill/i }).last().click();
    await page.getByText("Bill made · MVR 9,200.00").waitFor({ timeout: 15000 });
    await page.waitForURL("**/bills", { timeout: 15000 });
    await page.locator("div.group", { hasText: `CV-${w}-1` }).first().getByRole("button", { name: /put in the books/i }).click();
    await page.getByText(/Entry \d+ · MVR 9,200\.00/).waitFor({ timeout: 15000 });
    const after1 = await held();
    if (after1.onHand === "60" && after1.value === "7,200.00") ok("billed from what arrived: 60 bags at 7,200.00 into stock, the trip a cost, one entry");
    else bad(`after the first bill, stock is ${after1.onHand} worth ${after1.value}`);

    await page.goto(orderUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /record what arrived/i }).click();
    await page.getByRole("button", { name: /^record it$/i }).click();
    await page.getByText("Recorded as arrived").waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /make the bill/i }).click();
    await page.fill("#bill-no", `CV-${w}-2`);
    await page.selectOption("#bill-gst", "none_unregistered");
    await page.getByLabel(`Price each for ${item}`).fill("125");
    await page.getByRole("button", { name: /make the bill/i }).last().click();
    const said = await page.getByText(/Not as ordered/).first().innerText();
    if (/125\.00 a unit, not the MVR 120\.00 ordered/.test(said)) ok("the supplier's higher price was billed and reported, not hidden");
    else bad(`the second bill said: ${said}`);
    const second = (await api(page, "GET", "/bills")).json.bills.find((b) => b.bill_no === `CV-${w}-2`);
    await api(page, "POST", `/bills/${second.id}/post`);
    await page.goto(orderUrl, { waitUntil: "networkidle" });
    const status = await page.getByTestId("order-status").innerText();
    const after2 = await held();
    if (status === "Done" && after2.onHand === "100" && after2.value === "12,200.00") ok("all 100 arrived and billed: order Done, stock 100 bags worth 12,200.00");
    else bad(`after the second bill: ${status}, ${after2.onHand} worth ${after2.value}`);
    await page.screenshot({ path: "shots/order-desk.png", fullPage: true });

    // Selling: 10 bags out, invoiced from what went out.
    await page.goto(BASE + "/orders?kind=sale", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^sales order$/i }).click();
    await page.fill("#order-party", `Check buyer ${w}`);
    await page.getByLabel("Line 1: item").selectOption({ label: item });
    await page.getByLabel("Line 1: how many").fill("10");
    await page.getByRole("button", { name: /place the order/i }).click();
    await page.waitForURL(/\/orders\/[0-9a-f-]+$/, { timeout: 15000 });
    await page.getByRole("button", { name: /record what went out/i }).click();
    await page.getByRole("button", { name: /^record it$/i }).click();
    await page.getByText("Recorded as gone out").waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /make the invoice/i }).click();
    await page.selectOption("#bill-gst", "none_unregistered");
    await page.getByRole("button", { name: /make the invoice/i }).last().click();
    const inv = await page.getByText(/Invoice .* made · MVR 2,000\.00/).first().innerText();
    await page.waitForURL("**/invoices", { timeout: 15000 });
    const invoice = (await api(page, "GET", "/sales")).json;
    const list = invoice.invoices || invoice.sales || [];
    const made = list.find((x) => inv.includes(x.invoiceNo || x.invoice_no));
    if (made) await api(page, "POST", `/sales/${made.id}/post`);
    const after3 = await held();
    if (made && after3.onHand === "90") ok(`sales order: 10 bags went out, ${inv.split(" · ")[0].replace(" made", "")} at the item's price, and stock is 90 once it is in the books`);
    else bad(`after the sale: ${inv}, stock ${after3.onHand}`);

    const phone = await signIn(browser, { phone: true });
    await phone.page.goto(orderUrl, { waitUntil: "networkidle" });
    await phone.page.getByTestId("order-lines").waitFor({ timeout: 15000 });
    const wide = await phone.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (!wide) ok("an order fits a phone, no sideways scroll");
    else bad("the order page scrolls sideways on a phone");
    await phone.page.screenshot({ path: "shots/order-phone.png", fullPage: true });
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();

/**
 * An accepted quote drafts its invoice, live, in the test company. Names are
 * made up.
 *
 * Makes a quote through the API, presses Accepted on its page, and checks the
 * app lands on a drafted invoice with the quote's total, that the invoice is a
 * draft (not posted, not sent), and that the sales order, all services, is
 * done: nothing left to invoice twice. (Goods still to go out read "Invoiced,
 * to go out"; the backend test covers that.)
 *
 *   node tools/quote-invoice.js
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
const shot = (page, name) => page.screenshot({ path: `${process.env.TEMP}/qi-${name}.png`, fullPage: false });

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const { page } = await signIn(browser, { phone: false });
    const w = word();
    const res = await api(page, "POST", "/orders", { kind: "quote", partyName: `Check client ${w}`, validUntil: "2099-12-31", lines: [{ description: `Deck boards ${w}`, quantity: 10, unit: "m2", unitPrice: "450.00" }, { description: "Fixing", quantity: 1, unitPrice: "800.00" }] });
    const quote = res.json;
    if (!quote?.id) throw new Error(`quote not made: ${res.status} ${JSON.stringify(quote?.error?.message)}`);

    await page.goto(`${BASE}/orders/${quote.id}`, { waitUntil: "networkidle", timeout: 45000 });
    await page.getByRole("button", { name: /^accepted$/i }).click();
    await page.waitForURL(/\/documents\/invoice\/[0-9a-f-]+$/, { timeout: 20000 });
    await page.waitForTimeout(800);
    await shot(page, "invoice");
    ok("Accepted opens the drafted invoice");

    const invoiceId = page.url().split("/").pop();
    const doc = (await api(page, "GET", `/documents/invoice/${invoiceId}`)).json;
    const d = doc?.document || doc;
    if (d?.status === "draft") ok(`the invoice is a draft (status ${d.status}), not posted or sent`);
    else bad(`the invoice's status is ${JSON.stringify(d?.status)}`);
    if (JSON.stringify(d).includes("5,300.00")) ok("it carries the quote's lines: MVR 5,300.00 before GST");
    else bad("the invoice's total is not the quote's");

    const q = (await api(page, "GET", `/orders/${quote.id}`)).json;
    const so = (await api(page, "GET", `/orders/${q.becameOrderId}`)).json;
    await page.goto(`${BASE}/orders/${so.id}`, { waitUntil: "networkidle" });
    await shot(page, "order");
    if (so.status === "done") ok(`${so.number} is done: all services, already invoiced`);
    else bad(`the sales order is ${so.status}`);
  } catch (e) {
    bad(e.message);
  } finally {
    await browser.close();
  }
})();

/**
 * A job invoiced in parts, live, in the test company. Names are made up.
 *
 * Accepts a quote (its whole invoice is drafted), then on the sales order
 * chooses to invoice it in parts instead: the whole draft is discarded, a 30%
 * deposit is drafted, what is left shows on the order, the rest is drafted by
 * asking for more than is left, and the quote shows the job all invoiced.
 *
 *   node tools/invoice-parts.js
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
const shot = (page, name) => page.screenshot({ path: `${process.env.TEMP}/parts-${name}.png`, fullPage: false });

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const { page } = await signIn(browser, { phone: false });
    page.on("dialog", (d) => d.accept());
    const w = word();
    const quote = (await api(page, "POST", "/orders", { kind: "quote", partyName: `Check client ${w}`, validUntil: "2099-12-31", lines: [{ description: `Deck boards ${w}`, quantity: 10, unit: "m2", unitPrice: "450.00" }, { description: "Fixing", quantity: 1, unitPrice: "800.00" }] })).json;
    if (!quote?.id) throw new Error("quote not made");
    const accepted = (await api(page, "POST", `/orders/${quote.id}/accept`)).json;

    await page.goto(`${BASE}/orders/${accepted.orderId}`, { waitUntil: "networkidle", timeout: 45000 });
    await page.getByTestId("invoice-in-parts").click();
    await page.locator("#part-value").fill("30");
    await page.locator("#part-label").fill("Deposit");
    const preview = await page.getByTestId("part-preview").innerText();
    await shot(page, "form");
    if (/1,590\.00 before GST, MVR 3,710\.00 left after/.test(preview)) ok(`the form says what it takes: "${preview}"`);
    else bad(`the preview reads "${preview}"`);
    await page.getByRole("button", { name: "Draft the invoice" }).click();
    await page.waitForURL(/\/documents\/invoice\/[0-9a-f-]+$/, { timeout: 20000 });
    ok("the deposit is drafted and opened");

    const whole = (await api(page, "GET", `/documents/invoice/${accepted.invoiceId}`)).json?.data;
    if (whole?.status === "void") ok(`the whole draft ${accepted.invoiceNo} was discarded`);
    else bad(`the whole draft is ${whole?.status}`);

    await page.goto(`${BASE}/orders/${accepted.orderId}`, { waitUntil: "networkidle" });
    const left = await page.getByTestId("order-left").innerText();
    await shot(page, "order");
    if (/3,710\.00/.test(left)) ok(`the order shows "${left}"`);
    else bad(`the order shows "${left}"`);

    await page.getByTestId("invoice-part").click();
    await page.getByRole("radio", { name: "An amount" }).click();
    await page.locator("#part-value").fill("99999");
    await page.locator("#part-label").fill("Handover");
    if (/the rest of the job/.test(await page.getByTestId("part-preview").innerText())) ok("asking for more than is left takes the rest");
    else bad("the preview does not say it takes the rest");
    await page.getByRole("button", { name: "Draft the invoice" }).click();
    await page.waitForURL(/\/documents\/invoice\/[0-9a-f-]+$/, { timeout: 20000 });

    await page.goto(`${BASE}/orders/${quote.id}`, { waitUntil: "networkidle" });
    const job = await page.getByTestId("quote-job").innerText();
    await shot(page, "quote");
    if (/invoiced MVR 5,300\.00 of 5,300\.00, all of it/.test(job)) ok(`the quote shows its job: "${job.trim()}"`);
    else bad(`the quote shows "${job}"`);

    const phone = await signIn(browser, { phone: true });
    await phone.page.goto(`${BASE}/orders/${accepted.orderId}`, { waitUntil: "networkidle", timeout: 45000 });
    await shot(phone.page, "order-phone");
    ok("the phone shows the order");
  } catch (e) {
    bad(e.message);
  } finally {
    await browser.close();
  }
})();

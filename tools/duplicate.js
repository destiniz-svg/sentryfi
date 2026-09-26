/**
 * Duplicate, live, in the test company. Names are made up.
 *
 * Makes a quote and a draft invoice through the API, opens each as a
 * document, presses Duplicate, checks the form arrives filled in with the
 * copy's note, saves it, and checks the new one has a new number and the
 * same lines. Then the same from a purchase order's own page.
 *
 *   node tools/duplicate.js
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
const shot = (page, name) => page.screenshot({ path: `${process.env.TEMP}/dup-${name}.png`, fullPage: false });

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const { page } = await signIn(browser, { phone: false });
    const w = word();
    const customer = `Check client ${w}`;

    // A quote, duplicated from its document.
    const quote = (await api(page, "POST", "/orders", { kind: "quote", partyName: customer, lines: [{ description: `Deck boards ${w}`, quantity: 12, unit: "m2", unitPrice: "450.00" }, { description: "Fixing", quantity: 1, unitPrice: "800.00" }] })).json;
    await page.goto(`${BASE}/documents/quote/${quote.id}`, { waitUntil: "networkidle", timeout: 45000 });
    await page.getByTestId("duplicate").click();
    await page.getByTestId("copy-of").waitFor({ timeout: 15000 });
    await shot(page, "quote-desk");
    if ((await page.getByText(customer, { exact: true }).first().isVisible()) && (await page.getByLabel("Line 1: what").inputValue()) === `Deck boards ${w}` && (await page.getByLabel("Line 2: price each").inputValue()) === "800.00")
      ok("a quote's Duplicate opens the quote form filled in, with the note");
    else bad("the quote's copy is not filled in as the original");
    await page.getByRole("button", { name: /save the quote/i }).click();
    await page.waitForURL(/\/orders\/[0-9a-f-]+$/, { timeout: 15000 });
    const copy = (await api(page, "GET", `/orders/${page.url().split("/").pop()}`)).json;
    if (copy.id !== quote.id && copy.number !== quote.number && copy.lines.length === 2 && copy.party === customer) ok(`saved as ${copy.number}, a new quote with both lines (from ${quote.number})`);
    else bad(`the saved copy is ${JSON.stringify({ number: copy.number, lines: copy.lines?.length })}`);

    // A purchase order, duplicated from its own page.
    const cost = (await api(page, "GET", "/orders/options")).json.accounts[0].id;
    const poRes = await api(page, "POST", "/orders", { kind: "purchase", partyName: `Check vendor ${w}`, lines: [{ description: "Bolts", accountId: cost, quantity: 40, unitPrice: "3.50" }] });
    if (!poRes.json?.id) throw new Error(`purchase order not made: ${poRes.status} ${JSON.stringify(poRes.json?.error?.message)}`);
    const po = poRes.json;
    await page.goto(`${BASE}/orders/${po.id}`, { waitUntil: "networkidle" });
    await page.getByTestId("duplicate").first().click();
    await page.getByTestId("copy-of").waitFor({ timeout: 15000 });
    if ((await page.getByLabel("Line 1: how many").inputValue()) === "40") ok("a purchase order's Duplicate opens the order form filled in");
    else bad("the purchase order's copy is not filled in");

    // A draft invoice, duplicated from its document.
    const draft = (await api(page, "POST", "/sales", { customerName: customer, gstTreatment: "none_unregistered", subject: `Deck works ${w}`, lines: [{ description: `Labour ${w}`, quantity: 3, unitPrice: "1500" }] })).json;
    const inv = draft?.invoice || draft;
    if (!inv?.id) throw new Error(`invoice not made: ${JSON.stringify(draft).slice(0, 200)}`);
    await page.goto(`${BASE}/documents/invoice/${inv.id}`, { waitUntil: "networkidle" });
    await page.getByTestId("duplicate").click();
    await page.getByTestId("copy-of").waitFor({ timeout: 15000 });
    await page.waitForTimeout(600);
    await shot(page, "invoice-desk");
    await page.getByRole("radiogroup", { name: "Payment terms" }).getByRole("radio").first().click();
    const save = page.getByRole("button", { name: /^save inv/i }).last();
    const label = await save.innerText();
    if (/4,500\.00/.test(label) && !label.includes(inv.invoiceNo)) ok(`an invoice's Duplicate opens a new invoice filled in: "${label.trim()}"`);
    else bad(`the invoice's copy reads "${label}"`);
    await save.click();
    await page.waitForURL(/\/documents\/invoice\/[0-9a-f-]+$/, { timeout: 15000 });
    const newId = page.url().split("/").pop();
    if (newId !== inv.id) ok("saved as a new draft invoice");
    else bad("the copy saved over the original");

    // The phone.
    const phone = await signIn(browser, { phone: true });
    await phone.page.goto(`${BASE}/documents/quote/${quote.id}`, { waitUntil: "networkidle", timeout: 45000 });
    await shot(phone.page, "quote-phone-doc");
    await phone.page.getByTestId("duplicate").click();
    await phone.page.getByTestId("copy-of").waitFor({ timeout: 15000 });
    await shot(phone.page, "quote-phone-form");
    ok("the phone opens the copy too");
  } catch (e) {
    bad(e.message);
  } finally {
    await browser.close();
  }
})();

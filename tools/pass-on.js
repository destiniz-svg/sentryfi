/**
 * Costs passed on, and repeating bills, live, in the test company. Names are made up.
 *
 * A supplier's bill has a cost marked for a customer with a 10% markup; once
 * posted, the new invoice for that customer offers it at cost plus markup, a
 * person adds it, and after saving it waits no more. The claim form offers the
 * same choice per line, and the Bills page drafts a repeating bill.
 *
 *   node tools/pass-on.js
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
const shot = (page, name) => page.screenshot({ path: `${process.env.TEMP}/passon-${name}.png`, fullPage: false });

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const { page } = await signIn(browser, { phone: false });
    page.on("dialog", (d) => d.accept());
    const w = word();
    const customer = `Check client ${w}`;
    const customerId = (await api(page, "POST", "/contacts", { name: customer, customer: true })).json?.id;
    if (!customerId) throw new Error("customer not made");

    const bill = (await api(page, "POST", "/bills", { supplierName: `Check hardware ${w}`, billNo: `HW-${w}`, amount: "1500", gstTreatment: "none_unregistered", issueDate: today() })).json?.bill;
    if (!bill?.id) throw new Error("bill not recorded");
    const split = (await api(page, "GET", `/bills/${bill.id}/split`)).json;
    const accountId = split.options.accounts[0].id;
    if (split.options.customers?.some((c) => c.id === customerId)) ok("the bill split offers the customer");
    else bad("the bill split does not offer the customer");
    const put = await api(page, "PUT", `/bills/${bill.id}/split`, {
      lines: [
        { kind: "cost", description: `Tiles for ${w}`, amount: "1000", accountId, forCustomerId: customerId, markup: "10" },
        { kind: "cost", description: "Our own glue", amount: "500", accountId },
      ],
    });
    if (put.status !== 200) throw new Error(`split: ${JSON.stringify(put.json)}`);
    const posted = await api(page, "POST", `/bills/${bill.id}/post`);
    if (posted.status !== 200) throw new Error(`post: ${JSON.stringify(posted.json)}`);

    await page.goto(`${BASE}/invoices/new?customer=${encodeURIComponent(customer)}`, { waitUntil: "networkidle", timeout: 45000 });
    await page.keyboard.press("Escape");
    const panel = page.getByTestId("pass-on");
    await panel.waitFor({ timeout: 20000 });
    const text = await panel.innerText();
    await shot(page, "invoice");
    if (/Tiles for/.test(text) && /1,100\.00/.test(text) && /\+ 10%/.test(text)) ok("the invoice offers the tiles at cost plus 10%: 1,100.00");
    else bad(`the panel reads "${text}"`);
    await panel.getByRole("button", { name: `Add Tiles for ${w}` }).click();
    if ((await page.getByLabel("Line 1: rate").inputValue()) === "1100.00") ok("added as a line at 1,100.00");
    else bad(`the line's rate is ${await page.getByLabel("Line 1: rate").inputValue()}`);
    if (!(await panel.count())) ok("the panel goes once nothing is left");
    else bad("the panel is still shown");
    await shot(page, "invoice-added");

    const due = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
    const raised = await api(page, "POST", "/sales", { clientRef: crypto.randomUUID(), customerName: customer, counterpartyId: customerId, dueDate: due, gstTreatment: "none_unregistered", lines: [{ description: `Tiles for ${w}`, quantity: 1, unitPrice: "1100.00" }], passOnIds: (await api(page, "GET", `/sales/pass-on?counterpartyId=${customerId}`)).json.costs.map((c) => c.id) });
    if (raised.status === 201 || raised.status === 200) ok("an invoice takes it");
    else bad(`the invoice was refused: ${JSON.stringify(raised.json)}`);
    const after = (await api(page, "GET", `/sales/pass-on?counterpartyId=${customerId}`)).json.costs;
    if (after.length === 0) ok("and it waits no more");
    else bad(`${after.length} still waiting`);

    await page.goto(`${BASE}/claims`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "New claim" }).first().click();
    const charge = page.getByLabel("Line 1: charge to a customer");
    await charge.selectOption({ label: `Charge to ${customer}` });
    await page.getByLabel("Line 1: markup, percent").fill("15");
    await shot(page, "claim");
    ok("a claim line can be charged to the customer, with a markup");
    await page.keyboard.press("Escape");

    await page.goto(`${BASE}/bills`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Repeating bills" }).click();
    await page.getByRole("button", { name: "New schedule" }).click();
    await page.locator("#rb-customer").fill(`Check landlord ${w}`);
    await page.locator("#rb-what").fill("Rent, office 2");
    await page.locator("#rb-amount").fill("8000");
    await page.locator("#rb-account").selectOption({ index: 1 });
    const start = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    await page.locator("#rb-start").fill(start);
    if (!(await page.locator("#rb-post").count())) ok("a repeating bill never offers to post itself");
    else bad("the post-by-itself box shows for a bill");
    await shot(page, "repeat-form");
    await page.getByRole("button", { name: "Save the schedule" }).click();
    await page.getByTestId("schedules").waitFor({ timeout: 20000 });
    const list = await page.getByTestId("schedules").innerText();
    await shot(page, "repeat-list");
    if (list.includes(`Check landlord ${w}`)) ok("the repeating bill is saved");
    else bad(`the list reads "${list}"`);
    const mine = (await api(page, "GET", "/recurring?kind=bill")).json.schedules.find((s) => s.customer === `Check landlord ${w}`);
    if (mine) await api(page, "POST", `/recurring/${mine.id}/pause`, { paused: true });

    const phone = await signIn(browser, { phone: true });
    await phone.page.goto(`${BASE}/bills`, { waitUntil: "networkidle", timeout: 45000 });
    await phone.page.getByRole("button", { name: "Repeating bills" }).click();
    await shot(phone.page, "repeat-phone");
    ok("the phone shows repeating bills");
  } catch (e) {
    bad(e.message);
  } finally {
    await browser.close();
  }
})();

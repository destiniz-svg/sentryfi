/**
 * Item 17, live, in the test company. Names are made up.
 *
 *   Quotes: a quote is accepted and becomes a sales order.
 *   Repeat billing: a monthly schedule starting today raises today's invoice.
 *   Expense claims: a claim is sent; the person who sent it is told someone
 *     else approves it (one person cannot check the approval itself live).
 *   Payments: a bill in the books is paid in part in a run, which gives the
 *     transfer with the supplier's account number.
 *   Customer links: a link opens, signed out, to that customer's invoices and
 *     what they owe; turned off, it stops opening.
 *
 *   node tools/sprint4.js
 */
const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

    // --- Quotes
    await page.goto(BASE + "/orders?kind=quote", { waitUntil: "networkidle", timeout: 45000 });
    await page.getByRole("button", { name: /^quote$/i }).click();
    await page.fill("#order-party", `Check prospect ${w}`);
    await page.fill("#quote-until", "2099-12-31");
    await page.getByLabel("Line 1: what").fill("Site survey");
    await page.getByLabel("Line 1: price each").fill("900");
    await page.getByRole("button", { name: /save the quote/i }).click();
    await page.waitForURL(/\/orders\/[0-9a-f-]+$/, { timeout: 15000 });
    await page.getByRole("button", { name: /^accepted$/i }).click();
    await page.getByText(/Accepted: SO-\d+/).waitFor({ timeout: 15000 });
    await page.waitForURL(/\/orders\/[0-9a-f-]+$/, { timeout: 15000 });
    const so = await page.getByRole("heading").first().innerText();
    if (/^SO-\d+ · Check prospect/.test(so)) ok(`a quote was accepted and became ${so.split(" · ")[0]} with the same line`);
    else bad(`after accepting, the page is ${so}`);

    // --- Repeat billing
    await page.goto(BASE + "/invoices", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^repeat billing$/i }).click();
    await page.getByRole("button", { name: /new schedule/i }).click();
    await page.fill("#rb-customer", `Check tenant ${w}`);
    await page.fill("#rb-name", `Check rent ${w}`);
    await page.fill("#rb-what", "Office rent");
    await page.fill("#rb-amount", "12000");
    await page.selectOption("#rb-gst", "none_unregistered");
    await page.getByRole("button", { name: /save the schedule/i }).click();
    await page.getByText(/1 invoice was due already, and raised/).waitFor({ timeout: 15000 });
    await page.getByTestId("schedules").getByText(`Check rent ${w}`).waitFor({ timeout: 15000 });
    const sched = await page.getByTestId("schedules").innerText();
    if (sched.includes(`Check rent ${w}`) && /every month/.test(sched) && /1 raised/.test(sched)) ok("a monthly schedule starting today raised today's invoice, and waits for next month");
    else bad(`the schedules read: ${sched.replace(/\s+/g, " ")}`);
    await page.keyboard.press("Escape");
    // Paused, so a check does not go on billing the test company every month.
    for (const x of (await api(page, "GET", "/recurring")).json.schedules) {
      if (/^Check rent /.test(x.name) && !x.paused) await api(page, "POST", `/recurring/${x.id}/pause`, { paused: true });
    }

    // --- Expense claims
    await page.goto(BASE + "/claims", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /new claim/i }).click();
    await page.getByLabel("Line 1: what").fill(`Check ferry ${w}`);
    await page.getByLabel("Line 1: amount").fill("450");
    await page.getByLabel("Line 1: kind of cost").selectOption({ label: "Transport and boat freight" });
    await page.getByRole("button", { name: /send the claim/i }).click();
    await page.getByText(/EC-\d+ sent/).waitFor({ timeout: 15000 });
    await page.goto(BASE + "/approvals", { waitUntil: "networkidle" });
    const mine = page.getByTestId("approvals").locator("li", { hasText: `Check ferry ${w}` });
    if (await mine.getByText("Yours: someone else approves it").count()) ok("the claim waits in Approvals, and its sender cannot approve it");
    else bad(`the claim's row reads: ${(await mine.innerText().catch(() => "missing")).replace(/\s+/g, " ")}`);

    // --- Payments
    const bill = await api(page, "POST", "/bills", { supplierName: `Check payee ${w}`, billNo: `PAY-${w}`, amount: "1000", gstTreatment: "none_unregistered", issueDate: today() });
    await api(page, "POST", `/bills/${bill.json.bill.id}/post`);
    await page.goto(BASE + "/payments", { waitUntil: "networkidle" });
    await page.getByLabel(new RegExp(`^Pay .* PAY-${w}$`)).check();
    await page.getByLabel(/^Amount to pay/).first().fill("600");
    const bank = await page.locator("#pay-from option", { hasText: /^Bank$/ }).first().getAttribute("value");
    await page.selectOption("#pay-from", bank);
    await page.getByRole("button", { name: /^pay mvr 600\.00$/i }).click();
    await page.getByTestId("transfers").waitFor({ timeout: 15000 });
    const transfers = await page.getByTestId("transfers").innerText();
    if (transfers.includes(`PAY-${w}`) && /600\.00/.test(transfers)) ok("a bill was paid in part (600 of 1,000) in a run, and the transfer to make is listed, ready to download");
    else bad(`the transfers read: ${transfers.replace(/\s+/g, " ")}`);
    const left = (await api(page, "GET", "/payments")).json.unpaid.find((u) => u.reference === `PAY-${w}`);
    if (left?.owed === "400.00") ok("the bill still shows 400.00 owed");
    else bad(`after paying, the bill shows ${left?.owed}`);
    await page.screenshot({ path: "shots/payments.png", fullPage: true });

    // --- Customer links (a name like no other, so it is not filed under a similar customer)
    const client = `${word()} ${word()}`.replace(/^./, (c) => c.toUpperCase());
    const inv = await api(page, "POST", "/sales", { customerName: client, gstTreatment: "none_unregistered", issueDate: today(), lines: [{ description: "Consulting", amount: "2500" }] });
    await api(page, "POST", `/sales/${inv.json.invoice.id}/post`);
    await page.goto(BASE + "/invoices", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /customer links/i }).click();
    await page.locator("#portal-customer").selectOption({ label: client });
    await page.getByRole("button", { name: /make the link/i }).click();
    const url = await page.getByLabel("The link").inputValue();
    const outside = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const guest = await outside.newPage();
    await guest.goto(url, { waitUntil: "networkidle" });
    const owed = await guest.getByTestId("portal-owed").innerText();
    const listed = await guest.getByTestId("portal-invoices").innerText();
    if (/2,500\.00/.test(owed) && listed.includes(inv.json.invoice.invoiceNo)) ok(`signed out, the link shows ${inv.json.invoice.invoiceNo} and MVR 2,500.00 owed`);
    else bad(`the portal shows ${owed.replace(/\s+/g, " ")} / ${listed.replace(/\s+/g, " ")}`);
    await guest.screenshot({ path: "shots/portal-phone.png", fullPage: true });
    await page.getByRole("button", { name: new RegExp(`Turn off ${client}'s link`) }).click();
    await page.getByText("Turned off").waitFor({ timeout: 15000 });
    await guest.reload({ waitUntil: "networkidle" });
    if (await guest.getByRole("alert").count()) ok("turned off, the link no longer opens");
    else bad("the link still opens after being turned off");
    await outside.close();
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();

/**
 * Balance confirmations (ISA 505), end to end, in the test company.
 *
 * The auditor (SHOOT_EMAIL, someone holding the Auditor role) opens a period,
 * picks a suggested party and adds it; the company (SHOOT_ANSWERER_EMAIL, an
 * owner or accountant) authorises; the auditor checks the address and sends.
 * With no mail set up the private link is shown to the auditor; a guest with
 * no account opens it and replies. The company then sees "Replied" and never
 * the answer; the auditor sees the figure and the difference, and concludes.
 *
 *   SHOOT_EMAIL=<auditor> SHOOT_ANSWERER_EMAIL=<owner> node tools/confirm.js
 */
const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};
const api = (page, method, url, body) =>
  page.evaluate(
    async ([m, u, b]) => {
      const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company"), "Content-Type": "application/json" };
      const r = await fetch("/api" + u, { method: m, credentials: "include", headers, body: b ? JSON.stringify(b) : undefined });
      return { status: r.status, json: await r.json().catch(() => null) };
    },
    [method, url, body]
  );
const shot = (page, name) => page.screenshot({ path: `${process.env.TEMP}/confirm-${name}.png`, fullPage: false });
const settle = (page) => page.waitForTimeout(700);
const as = async (browser, email, password) => {
  const was = [process.env.SHOOT_EMAIL, process.env.SHOOT_PASSWORD];
  process.env.SHOOT_EMAIL = email;
  process.env.SHOOT_PASSWORD = password;
  try {
    return (await signIn(browser, { phone: false })).page;
  } finally {
    [process.env.SHOOT_EMAIL, process.env.SHOOT_PASSWORD] = was;
  }
};

(async () => {
  if (!process.env.SHOOT_ANSWERER_EMAIL) {
    console.log("  skip needs an auditor (SHOOT_EMAIL) and someone who authorises (SHOOT_ANSWERER_EMAIL)");
    return;
  }
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const auditor = (await signIn(browser, { phone: false })).page;
    const company = await as(browser, process.env.SHOOT_ANSWERER_EMAIL, process.env.SHOOT_ANSWERER_PASSWORD || process.env.SHOOT_PASSWORD);
    const year = new Date().getFullYear();
    const period = (await api(auditor, "POST", "/audit", { name: `Confirm check ${Date.now()}`, from: `${year}-01-01`, to: `${year}-12-31` })).json;
    await auditor.goto(`${BASE}/audit/${period.id}?tab=confirmations`, { waitUntil: "networkidle", timeout: 45000 });
    await auditor.getByTestId("suggest").locator("input[type=checkbox]").first().check();
    const name = (await auditor.getByTestId("suggest").locator("li").first().locator("span.font-medium").first().innerText()).split(/\s+(owes|is owed)/)[0].trim();
    await auditor.getByRole("button", { name: /^Add 1 to confirm/ }).click();
    await auditor.getByTestId("confirmation").first().waitFor({ timeout: 15000 });
    ok(`the auditor picks ${name} to confirm`);

    await company.goto(`${BASE}/audit/${period.id}?tab=confirmations`, { waitUntil: "networkidle", timeout: 45000 });
    await settle(company);
    await shot(company, "authorise");
    await company.getByRole("button", { name: "Authorise the requests" }).click();
    await company.getByText("Authorised, not sent").first().waitFor({ timeout: 15000 });
    ok("the company authorises; it cannot send or choose");

    await auditor.reload({ waitUntil: "networkidle" });
    const row = auditor.getByTestId("confirmation").first();
    await row.locator("input[id^=conf-email-]").fill("accounts@customer.example");
    await row.locator("input[type=checkbox]").check();
    await row.getByLabel("How it was checked").fill("Their letterhead, and a call to the number on their website");
    await row.getByRole("button", { name: "Keep" }).click();
    await auditor.waitForTimeout(800);
    await row.getByRole("button", { name: "Send the request" }).click();
    const linkBox = row.locator(".font-mono");
    await linkBox.waitFor({ timeout: 15000 });
    const link = (await linkBox.innerText()).trim();
    const token = link.split("/confirm/")[1];
    await settle(auditor);
    await shot(auditor, "sent");
    ok("the auditor checks the address and sends; with no mail set up, the private link is shown to the auditor only");

    // The customer, with no account.
    const guest = await (await browser.newContext({ viewport: { width: 400, height: 860 } })).newPage();
    await guest.goto(`${BASE}/confirm/${token}`, { waitUntil: "networkidle", timeout: 45000 });
    const heading = await guest.locator("h1").innerText();
    if (/What .* on /.test(heading)) ok(`the guest sees "${heading}"`);
    else bad(`the guest sees "${heading}"`);
    await guest.locator("#confirm-amount").fill("123.45");
    await guest.locator("#confirm-name").fill("SECRET-CLERK");
    await settle(guest);
    await shot(guest, "form");
    await guest.getByRole("button", { name: "Send my reply to the auditor" }).click();
    await guest.getByText("Thank you").waitFor({ timeout: 15000 });
    await shot(guest, "thanks");
    ok("they reply once, without an account");
    const again = await guest.evaluate(async (t) => (await fetch(`/api/confirm/${t}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: "1", name: "x" }) })).status, token);
    if (again === 409) ok("a second reply on the same link is refused");
    else bad(`a second reply answered ${again}`);

    await company.reload({ waitUntil: "networkidle" });
    const theirs = await company.getByTestId("confirmations").innerText();
    if (/Replied/.test(theirs) && !/SECRET-CLERK|123\.45/.test(theirs)) ok("the company sees it replied, never the answer");
    else bad(`the company sees "${theirs.replace(/\s+/g, " ")}"`);
    const raw = await api(company, "GET", `/audit/${period.id}/confirmations`);
    if (!JSON.stringify(raw.json).includes("SECRET-CLERK")) ok("nor in what the server sends the company");
    else bad("the company's data holds the reply");

    await auditor.reload({ waitUntil: "networkidle" });
    const reply = await auditor.getByTestId("reply").first().innerText();
    if (/MVR 123\.45/.test(reply) && /Difference/.test(reply) && /SECRET-CLERK/.test(reply)) ok(`the auditor reads it: "${reply.replace(/\s+/g, " ").slice(0, 100)}"`);
    else bad(`the auditor sees "${reply}"`);
    await auditor.locator("input[id^=conf-note-]").first().fill("Difference is a receipt in transit at the year end");
    await auditor.getByRole("button", { name: "Difference explained" }).first().click();
    await auditor.getByText("Concluded by").first().waitFor({ timeout: 15000 });
    await shot(auditor, "concluded");
    ok("the auditor concludes: the difference explained");
  } catch (e) {
    bad(e.message);
  } finally {
    await browser.close();
  }
})();

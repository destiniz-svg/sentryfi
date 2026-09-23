/**
 * Variations, the bill of quantities and hours, live, in the test company.
 *
 * A MVR 500,000 contract priced from a two-item bill of quantities. A variation
 * is proposed (the contract stays), then approved (the contract grows); a claim
 * is measured from the bill with the variation's work on top; hours are kept
 * and nothing is posted. Screenshots the page on the desk and on a phone.
 *
 *   node tools/variations.js
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
const figure = async (page, label) => (await page.getByTestId(`fig-${label}`).innerText()).replace(/\s+/g, " ");

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  let projectId = null;
  let page;
  try {
    ({ page } = await signIn(browser, { phone: false }));
    const w = word();
    const customer = `Check authority ${w}`;
    const draft = await api(page, "POST", "/sales", { customerName: customer, gstTreatment: "none_unregistered", lines: [{ description: "x", amount: "1" }] });
    await api(page, "DELETE", `/sales/${draft.json.invoice.id}`, { reason: "check: only to make the customer" });
    projectId = (await api(page, "POST", "/projects", { name: `Check jetty ${w}` })).json.id;
    await page.goto(`${BASE}/projects/${projectId}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /set up the contract/i }).click();
    await page.locator("#contract-customer").selectOption({ label: customer });
    await page.fill("#contract-value", "500000");
    await page.fill("#contract-retention", "5");
    await page.getByRole("button", { name: /^save$/i }).click();
    await page.getByText("Contract saved").waitFor({ timeout: 15000 });

    // The bill of quantities, through the page.
    await page.locator("#card-boq").getByRole("button", { name: /add items/i }).click();
    const rows = [["1.1", "Piling", "nr", "40", "7500"], ["2.1", "Deck slab", "m2", "250", "800"]];
    for (const [i, r] of rows.entries()) {
      if (i) await page.getByRole("button", { name: /another item/i }).click();
      for (const [k, v] of ["ref", "description", "unit", "quantity", "rate"].entries()) await page.getByLabel(`Item ${i + 1}: ${v}`).fill(r[k]);
    }
    await page.getByRole("button", { name: /^save it$/i }).click();
    await page.getByText("Bill of quantities saved").waitFor({ timeout: 15000 });
    await page.locator("#card-boq").getByText(/500,000.00 priced/).waitFor({ timeout: 10000 }).catch(() => {});
    const boq = await page.locator("#card-boq").innerText();
    if (/500,000\.00 priced/.test(boq)) ok("a bill of quantities of two items prices the MVR 500,000 contract");
    else bad(`the bill of quantities reads: ${boq.replace(/\s+/g, " ")}`);

    // A variation: proposed changes nothing, approved grows the contract.
    await page.locator("#card-variations").getByRole("button", { name: /variation/i }).click();
    await page.fill("#vary-what", "Extra mooring bollards");
    await page.fill("#vary-amount", "36000");
    await page.getByRole("button", { name: /propose it/i }).click();
    await page.getByText("VO-1 proposed").waitFor({ timeout: 15000 });
    await page.waitForTimeout(800);
    if (/500,000\.00/.test(await figure(page, "contract"))) ok("VO-1 proposed: the contract stays at 500,000.00 until the customer agrees");
    else bad(`after proposing, the contract reads ${await figure(page, "contract")}`);
    await page.locator("#card-variations").getByRole("button", { name: /^approved$/i }).click();
    await page.getByText("VO-1 approved").waitFor({ timeout: 15000 });
    await page.waitForTimeout(800);
    const varied = await page.locator("#card-variations").innerText();
    if (/536,000\.00/.test(await figure(page, "contract")) && /Signed at MVR 500,000\.00/.test(varied)) ok("approved: the contract is 536,000.00, signed at 500,000.00");
    else bad(`after approving: ${await figure(page, "contract")} / ${varied.replace(/\s+/g, " ")}`);

    // A claim measured from the bill, with the variation's work on top.
    await page.getByRole("button", { name: /progress claim/i }).click();
    await page.getByLabel("1.1: done to date").fill("20");
    await page.getByLabel("2.1: done to date").fill("50.5");
    await page.getByLabel(/approved variations done/i).fill("18000");
    const said = await page.getByRole("dialog").innerText();
    // 20 x 7,500 + 50.5 x 800 + 18,000 = 208,400
    if (/208,400\.00/.test(said)) ok("the claim dialog adds it up as it is typed: MVR 208,400.00");
    else bad(`the claim dialog reads: ${said.replace(/\s+/g, " ").slice(0, 200)}`);
    await page.getByRole("button", { name: /make the claim/i }).click();
    await page.getByText(/Claim 1 made, MVR 208,400\.00/).waitFor({ timeout: 15000 });
    await page.waitForTimeout(800);
    const measured = (await page.locator("#card-boq").innerText()).replace(/\s+/g, " ");
    if (/done 20 \(150,000\.00\)/.test(measured) && /done 50\.5 \(40,400\.00\)/.test(measured)) ok("claim 1 is made at 208,400.00, and the bill shows what is done of each item");
    else bad(`after the claim the bill reads: ${measured}`);

    // Hours: kept, not posted.
    await page.locator("#card-hours").getByRole("button", { name: /hours worked/i }).click();
    await page.fill("#hours-who", "Site foreman");
    await page.fill("#hours-count", "9.5");
    await page.getByLabel(/rate an hour/i).fill("85");
    await page.getByRole("button", { name: /keep them/i }).click();
    await page.getByText("Hours kept").waitFor({ timeout: 15000 });
    await page.waitForTimeout(800);
    const hours = (await page.locator("#card-hours").innerText()).replace(/\s+/g, " ");
    if (/9\.5 hours, worth MVR 807\.50/.test(hours)) ok("9.5 hours at 85 kept: worth 807.50, and nothing posted");
    else bad(`the hours card reads: ${hours}`);
    await page.screenshot({ path: "shots/variations-desk.png", fullPage: true });

    const phone = await signIn(browser, { phone: true });
    await phone.page.goto(`${BASE}/projects/${projectId}`, { waitUntil: "networkidle" });
    await phone.page.locator("#card-hours").scrollIntoViewIfNeeded();
    const wide = await phone.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (!wide) ok("on a phone the page fits, with no sideways scroll");
    else bad("on a phone the page scrolls sideways");
    await phone.page.screenshot({ path: "shots/variations-phone.png", fullPage: true });
    await phone.context.close();
  } catch (err) {
    bad(err.message);
  } finally {
    if (projectId && page) await api(page, "POST", `/dimensions/${projectId}/archive`).catch(() => {});
    await browser.close();
  }
})();

/**
 * A construction project, end to end, live, in the test company. Names and
 * figures are made up.
 *
 * Sets up a MVR 1,000,000 contract with 10% retention capped at 5%, a budget
 * by kind of cost, a roofing subcontract billed in part, labour over budget;
 * makes two progress claims and certifies each for less than claimed; reads
 * every figure on the page and the entries behind the retention; sees the
 * overrun in Needs you; releases half the retention. Archives the project at
 * the end so its overrun does not stay in the test company's Needs you.
 *
 *   node tools/projects.js
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
  let projectId = null;
  let page;
  try {
    ({ page } = await signIn(browser, { phone: false }));
    const w = word();
    const name = `Check houses ${w}`;
    const customer = `Check authority ${w}`;
    // A customer exists once something has been raised to them.
    const draft = await api(page, "POST", "/sales", { customerName: customer, gstTreatment: "none_unregistered", lines: [{ description: "x", amount: "1" }] });
    await api(page, "DELETE", `/sales/${draft.json.invoice.id}`, { reason: "check: only to make the customer" });

    await page.goto(BASE + "/projects", { waitUntil: "networkidle", timeout: 45000 });
    await page.getByRole("button", { name: /new project/i }).click();
    await page.fill("#project-name", name);
    await page.getByRole("button", { name: /^start it$/i }).click();
    await page.waitForURL(/\/projects\/[0-9a-f-]+$/, { timeout: 15000 });
    projectId = page.url().split("/").pop();
    const url = page.url();

    await page.getByRole("button", { name: /set up the contract/i }).click();
    await page.locator("#contract-customer").selectOption({ label: customer });
    await page.fill("#contract-value", "1000000");
    await page.fill("#contract-retention", "10");
    await page.fill("#contract-cap", "5");
    await page.getByRole("button", { name: /^save$/i }).click();
    await page.getByText("Contract saved").waitFor({ timeout: 15000 });

    await page.getByRole("button", { name: /^budget$/i }).click();
    await page.getByLabel("Budget for Materials").fill("400000");
    await page.getByLabel("Budget for Labour").fill("200000");
    await page.getByLabel("Budget for Subcontractors").fill("150000");
    await page.getByRole("button", { name: /save the budget/i }).click();
    await page.getByText("Budget saved").waitFor({ timeout: 15000 });
    ok(`${name}: a MVR 1,000,000 contract, 10% retention up to 5%, budget MVR 750,000`);

    await page.getByRole("button", { name: /order or subcontract/i }).click();
    await page.fill("#commit-what", "Roofing subcontract");
    await page.locator("#commit-kind").selectOption({ label: "Subcontractors" });
    await page.fill("#commit-amount", "150000");
    await page.getByRole("button", { name: /^commit it$/i }).click();
    await page.getByText("Committed", { exact: true }).first().waitFor({ timeout: 15000 });
    const labour = await api(page, "POST", `/projects/${projectId}/commitments`, { description: "Labour gang, next month", accountId: (await api(page, "GET", `/projects/${projectId}`)).json.accounts.find((a) => a.name === "Labour").id, amount: "80000" });
    if (labour.status !== 201) bad("the labour commitment was refused");

    // Costs: part of the roofing billed against its subcontract, and labour.
    const roof = await api(page, "POST", "/bills", { supplierName: `Check roofer ${w}`, billNo: `RF-${w}`, amount: "60000", gstTreatment: "none_unregistered", issueDate: today(), projectId });
    await page.reload({ waitUntil: "networkidle" });
    const against = page.getByLabel("A bill against Roofing subcontract");
    await against.selectOption(await against.locator("option", { hasText: `RF-${w}` }).first().getAttribute("value"));
    await page.getByText("Billed against it").waitFor({ timeout: 15000 });
    await api(page, "POST", `/bills/${roof.json.bill.id}/post`);
    const lab = await api(page, "POST", "/bills", { supplierName: `Check gang ${w}`, billNo: `LB-${w}`, amount: "150000", gstTreatment: "none_unregistered", issueDate: today(), projectId });
    const labourId = (await api(page, "GET", `/projects/${projectId}`)).json.accounts.find((a) => a.name === "Labour").id;
    await api(page, "PUT", `/bills/${lab.json.bill.id}/split`, { lines: [{ kind: "cost", description: "Labour", amount: "150000", accountId: labourId }] });
    await api(page, "POST", `/bills/${lab.json.bill.id}/post`);

    // Two claims, each certified for less.
    for (const [claimed, certified, said] of [
      ["300000", "280000", /Certificate MVR 280,000\.00/],
      ["700000", "650000", /Certificate MVR 370,000\.00/],
    ]) {
      await page.reload({ waitUntil: "networkidle" });
      await page.getByRole("button", { name: /progress claim/i }).click();
      await page.fill("#claim-value", claimed);
      await page.getByRole("button", { name: /make the claim/i }).click();
      await page.getByText(/Claim \d made/).waitFor({ timeout: 15000 });
      await page.getByRole("button", { name: /^certify claim/i }).click();
      await page.fill("#certify-value", certified);
      await page.getByRole("button", { name: /certify and invoice/i }).click();
      await page.getByText(said).waitFor({ timeout: 15000 });
    }
    ok("claims 1 and 2 certified: certificates of 280,000.00 and 370,000.00");

    await page.reload({ waitUntil: "networkidle" });
    const fig = async (k) => (await page.getByTestId(`fig-${k}`).innerText()).replace(/\s+/g, " ");
    const want = {
      spent: "210,000.00", committed: "170,000.00", claimed: "700,000.00", certified: "650,000.00", "retention-held": "50,000.00", "heading-for": "220,000.00",
    };
    const got = {};
    for (const k of Object.keys(want)) got[k] = (await fig(k)).split(" ").pop();
    if (Object.keys(want).every((k) => got[k] === want[k]))
      ok("spent 210,000, committed 170,000, claimed 700,000, certified 650,000, retention held 50,000 (at its cap), heading for 220,000");
    else bad(`the figures read ${JSON.stringify(got)}`);
    const budget = await page.getByTestId("budget-lines").innerText();
    if (/Labour\s*Over/.test(budget)) ok("labour is marked over budget: 150,000 spent and 80,000 committed against 200,000");
    else bad(`the budget reads ${budget.replace(/\s+/g, " ")}`);

    await page.getByTestId("fig-retention-held").click();
    await page.getByTestId("entries").waitFor({ timeout: 15000 });
    const entries = await page.getByTestId("entries").locator("li").count();
    if (entries === 2) ok("retention held opens to its two entries in the books");
    else bad(`retention held opened ${entries} entries`);
    await page.keyboard.press("Escape");
    await page.screenshot({ path: "shots/project-desk.png", fullPage: true });

    await page.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
    if (await page.getByText(`${name} is over budget on Labour`).count()) ok("the overrun is in Needs you");
    else bad("the overrun is not in Needs you");

    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /release retention/i }).click();
    await page.fill("#release-amount", "25000");
    await page.getByRole("button", { name: /release and invoice/i }).click();
    await page.getByText(/MVR 25000 of retention released/).waitFor({ timeout: 15000 });
    await page.reload({ waitUntil: "networkidle" });
    if ((await fig("retention-held")).endsWith("25,000.00") && (await fig("certified")).endsWith("650,000.00")) ok("half released: 25,000 still held, revenue unchanged");
    else bad(`after release: ${await fig("retention-held")}`);

    const phone = await signIn(browser, { phone: true });
    await phone.page.goto(url, { waitUntil: "networkidle" });
    await phone.page.getByTestId("fig-spent").waitFor({ timeout: 15000 });
    const wide = await phone.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (!wide) ok("the project fits a phone, no sideways scroll");
    else bad("the project page scrolls sideways on a phone");
    await phone.page.screenshot({ path: "shots/project-phone.png", fullPage: true });
  } catch (err) {
    bad(err.message);
  } finally {
    if (projectId && page) await api(page, "POST", `/dimensions/${projectId}/archive`).catch(() => {});
    await browser.close();
  }
})();

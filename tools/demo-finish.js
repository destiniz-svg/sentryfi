/**
 * The demo company's last touches, after tools/demo.js: units as they should
 * read, the first certificate paid, June closed, September's bank statement
 * brought in (made up, with lines still to explain), and a colleague invited
 * at a sentryfi.app address so the invite can be accepted.
 *
 *   DEMO_PASSWORD=... node tools/demo-finish.js
 */
const { chromium } = require("playwright");
const { BASE } = require("./session");

const log = (m) => console.log("  " + m);

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await (await browser.newContext()).newPage();
  const call = async (method, url, body, raw) => {
    const r = await page.evaluate(
      async ([m, u, b, text]) => {
        const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company") };
        if (!text) headers["Content-Type"] = "application/json";
        const res = await fetch("/api" + u, { method: m, credentials: "include", headers, body: text ?? (b ? JSON.stringify(b) : undefined) });
        return { status: res.status, json: await res.json().catch(() => null) };
      },
      [method, url, body, raw]
    );
    if (r.status >= 400) log(`skip ${method} ${url} → ${r.status} ${r.json?.error?.message || ""}`);
    return r.status < 400 ? r.json : null;
  };
  try {
    await page.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 60000 });
    await page.fill("input[type=email]", "demo@sentryfi.app");
    await page.fill("input[type=password]", process.env.DEMO_PASSWORD);
    await page.click("button[type=submit]");
    await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 45000 });
    const co = (await call("GET", "/companies")).companies.find((c) => c.name === "Coralmark Builders Pvt Ltd");
    await page.evaluate((id) => localStorage.setItem("sentryfi.company", id), co.id);

    const units = { "Cement 50 kg": "bag", "Rebar 16 mm": "length", "Rebar 10 mm": "length", "River sand": "m3", "Hollow block 6 inch": "each", "Waterproofing membrane": "roll" };
    for (const it of (await call("GET", "/stock")).items) if (units[it.name] && it.unit !== units[it.name]) await call("PATCH", `/stock/${it.id}`, { unit: units[it.name] });
    log("units read as bag, length, m3 and roll again");

    const bank = (await call("GET", "/bank")).places.find((p) => p.name === "Main current account");
    const invoices = (await call("GET", "/sales")).invoices;
    const moonreef = invoices.filter((i) => /Moonreef/.test(i.customerName || i.customer || "") && i.status === "posted").sort((a, b) => String(a.issueDate || a.issue_date).localeCompare(String(b.issueDate || b.issue_date)));
    const first = moonreef[0];
    if (first) {
      const owed = String(first.outstanding || first.gross).replace(/,/g, "");
      await call("POST", "/sales/receipts", { accountId: bank.id, receivedOn: "2026-08-28", reference: "Moonreef certificate 1", amount: owed, allocations: [{ invoiceId: first.id, amount: owed }] });
      log(`Moonreef paid ${first.invoiceNo || first.invoice_no}, MVR ${owed}`);
    }

    await call("POST", "/periods/close", { through: "2026-06-30" });
    log("June closed");

    // September's statement, made up: a few lines the books already have, a few still to explain.
    let balance = 1184600;
    const rows = [];
    const line = (on, kind, ref, who, debit, credit) => {
      balance += (credit || 0) - (debit || 0);
      const d = on.replace(/-/g, "/");
      const at = `${on.slice(8, 10)}-${on.slice(5, 7)}-${on.slice(0, 4)} 10-15-00`;
      const cell = (v) => `"${v}"`;
      rows.push([d, d, kind, ref, `IR${ref.slice(-8)}`, at, who, "Internet Banking", debit ? debit.toFixed(2) : "", credit ? credit.toFixed(2) : "", balance.toFixed(2)].map(cell).join(","));
    };
    line("2026-09-02", "Transfer Credit", "BLAZ900000000101", "TIDEHOUSE CAFE", 0, 18500);
    line("2026-09-10", "Transfer Debit", "BLAZ900000000102", "LOAN REPAYMENT 0917", 28830, 0);
    line("2026-09-11", "Service Charge", "BLAZ900000000103", "MONTHLY ACCOUNT FEE", 45, 0);
    line("2026-09-14", "Transfer Debit", "BLAZ900000000104", "NORTHWIND STEEL TRADING", 132840, 0);
    line("2026-09-14", "Transfer Debit", "BLAZ900000000105", "BRIGHTWATER FUEL CO", 16092, 0);
    line("2026-09-19", "Transfer Credit", "BLAZ900000000106", "MOONREEF HOTELS PVT LTD", 0, 250000);
    line("2026-09-21", "Transfer Debit", "BLAZ900000000107", "ISLEWAY POWER AND WATER", 7236, 0);
    line("2026-09-22", "Transfer Credit", "BLAZ900000000108", "PALMWAY APARTMENTS", 0, 12500);
    const imported = await call("POST", `/bank/${bank.id}/statement`, null, rows.join("\n") + "\n");
    if (imported) log(`September's statement brought in: ${rows.length} lines`);

    await call("POST", "/companies/current/people", { email: "mariyam.demo@sentryfi.app", role: "accountant" });
    log("Mariyam Shifa invited as accountant");
    await call("POST", "/cfo/brief");
    log("the morning brief made again from the finished books");
  } finally {
    await browser.close();
  }
})();

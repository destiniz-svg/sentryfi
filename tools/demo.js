/**
 * The demo company, filled in: Coralmark Builders Pvt Ltd, a made-up Malé
 * contractor, with every part of the app in use. Every name and figure is
 * invented. Runs through the app's own API as the demo person, so every
 * figure adds up the way real use would.
 *
 *   DEMO_PASSWORD=... node tools/demo.js
 *
 * Refuses to run twice: if the company is already there it stops.
 */
const { chromium } = require("playwright");
const { BASE } = require("./session");

const EMAIL = process.env.DEMO_EMAIL || "demo@sentryfi.app";
const COMPANY = "Coralmark Builders Pvt Ltd";
const log = (m) => console.log("  " + m);
const failures = [];

(async () => {
  if (!process.env.DEMO_PASSWORD) throw new Error("Set DEMO_PASSWORD.");
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await (await browser.newContext()).newPage();
  const api = async (method, url, body, { soft = true } = {}) => {
    const r = await page.evaluate(
      async ([m, u, b]) => {
        const headers = { "Content-Type": "application/json" };
        const co = localStorage.getItem("sentryfi.company");
        if (co) headers["X-Company-Id"] = co;
        const res = await fetch("/api" + u, { method: m, credentials: "include", headers, body: b ? JSON.stringify(b) : undefined });
        return { status: res.status, json: await res.json().catch(() => null) };
      },
      [method, url, body]
    );
    if (r.status >= 400) {
      const why = `${method} ${url} → ${r.status} ${r.json?.error?.message || JSON.stringify(r.json).slice(0, 160)}`;
      if (!soft) throw new Error(why);
      failures.push(why);
      log("skip " + why);
      return null;
    }
    return r.json;
  };

  try {
    await page.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 60000 });
    await page.fill("input[type=email]", EMAIL);
    await page.fill("input[type=password]", process.env.DEMO_PASSWORD);
    await page.click("button[type=submit]");
    await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 45000 });

    // ------------------------------------------------------------ the company
    const have = (await api("GET", "/companies", null, { soft: false })).companies;
    if (have.some((c) => c.name === COMPANY)) throw new Error(`${COMPANY} is already there; nothing done.`);
    const co = (await api("POST", "/companies", { name: COMPANY, tin: "1099842GST501", gstNumber: "1099842GST501", gstRegistered: true, country: "MV" }, { soft: false })).company;
    await page.evaluate((id) => localStorage.setItem("sentryfi.company", id), co.id);
    log(`${COMPANY} opened`);
    await api("POST", "/gst/settings", { activityNo: "1099842GST501", frequency: "quarter" });
    await api("PUT", "/documents/brand", {
      name: COMPANY,
      tagline: "Building on sand, properly",
      address: "H. Coral Villa, 3rd floor\nBoduthakurufaanu Magu, Malé 20057\nRepublic of Maldives",
      phone: "+960 330 1482",
      email: "accounts@coralmark.example",
      website: "coralmark.example",
      accent: "#0E7C86",
      font: "barlow",
      signatory: "Aisha Rameez",
      signatoryTitle: "Managing Director",
      paymentDetails: "Pay to Coralmark Builders Pvt Ltd\nAccount 7730 0000 48215 (MVR)\nAccount 7730 0000 48216 (USD)\nQuote the invoice number with your payment.",
      footer: "Thank you for building with us. Questions about this document: accounts@coralmark.example",
    });
    await api("PUT", "/portal-links/payment-details", { paymentDetails: "Transfer to account 7730 0000 48215 (MVR) or 7730 0000 48216 (USD), quoting the invoice number." });

    // ------------------------------------------------------------ money places
    const bank = (await api("POST", "/bank", { name: "Main current account", currency: "MVR" }, { soft: false })).account;
    const usd = (await api("POST", "/bank", { name: "Dollar account", currency: "USD" }))?.account;
    await api("POST", "/bank/rates", { currency: "USD", on: "2026-06-01", rate: "15.42", source: "Bank selling rate" });
    await api("POST", "/bank/rates", { currency: "USD", on: "2026-09-20", rate: "15.46", source: "Bank selling rate" });
    const accounts = (await api("GET", "/periods/accounts", null, { soft: false })).accounts;
    const acc = (re, type) => accounts.find((a) => (!type || a.type === type) && re.test(a.name)) || null;
    const equity = acc(/opening/i, "equity") || acc(/capital|stake|share/i, "equity") || accounts.find((a) => a.type === "equity");
    await api("POST", "/periods/adjust", {
      date: "2026-06-01",
      narrative: "Opening balances brought in from the old books",
      reason: "Books started on Sentryfi on 1 June 2026",
      lines: [
        { accountId: bank.id, debit: "1850000", memo: "Main current account at 31 May" },
        { accountId: equity.id, credit: "1850000", memo: "Opening balances" },
      ],
    });
    if (usd) await api("POST", "/bank/transfer", { fromId: bank.id, toId: usd.id, amount: "154200", amountFc: "10000", note: "Dollars for the steel order", on: "2026-06-03" });
    log("bank, dollar account, rates and opening balances in");

    // ------------------------------------------------------------ tracking
    const dims = {};
    for (const [kind, name] of [["branch", "Malé yard"], ["branch", "Hulhumalé site office"], ["machine", "Excavator EX-2"], ["machine", "Pickup P-14"], ["department", "Site works"], ["department", "Office"]]) {
      const d = await api("POST", "/dimensions", { kind, name });
      if (d) dims[name] = d.id;
    }
    const staffBlock = (await api("POST", "/projects", { name: "Moonreef staff block" }, { soft: false })).id;
    const jetty = (await api("POST", "/projects", { name: "Sandvale jetty repair" }, { soft: false })).id;
    log("branches, machines, departments and two projects");

    // ------------------------------------------------------------ stock
    const items = {};
    for (const [name, unit, price, qty, cost] of [
      ["Cement 50 kg", "bag", "128.00", "400", "96.50"],
      ["Rebar 16 mm", "length", "310.00", "250", "238.00"],
      ["Rebar 10 mm", "length", "150.00", "300", "112.00"],
      ["River sand", "m3", "780.00", "60", "590.00"],
      ["Hollow block 6 inch", "each", "14.50", "5000", "9.80"],
      ["Waterproofing membrane", "roll", "1450.00", "24", "1080.00"],
    ]) {
      const it = await api("POST", "/stock", { name, unit, salePrice: price });
      if (!it) continue;
      items[name] = it.item.id;
      await api("POST", `/stock/${it.item.id}/opening`, { quantity: qty, unitCost: cost, on: "2026-06-01" });
    }
    await api("PATCH", `/stock/${items["Cement 50 kg"]}`, { reorderAt: "120" });
    await api("PATCH", `/stock/${items["Waterproofing membrane"]}`, { reorderAt: "30" });
    log("six stock items with what was on hand");

    // ------------------------------------------------------------ bills
    const expense = (re) => acc(re, "expense")?.id;
    const suppliers = {
      "Seabridge Cement Supplies": { tin: "1044810GST501", gst_number: "1044810GST501", email: "sales@seabridge.example", phone: "+960 331 5120", address: "M. Seabreeze, Malé", bank_account: "7701 0000 11873" },
      "Northwind Steel Trading": { tin: "1051277GST501", gst_number: "1051277GST501", email: "orders@northwind.example", phone: "+960 332 8841", address: "G. Northwind Hiya, Malé", bank_account: "7701 0000 20451" },
      "Brightwater Fuel Co": { tin: "1063390GST501", gst_number: "1063390GST501", email: "billing@brightwater.example", phone: "+960 334 0907", address: "Thilafushi, Plot 41", bank_account: "7701 0000 33920" },
      "Reefside Hardware": { email: "reefside@example.com", phone: "+960 779 2210", address: "Majeedhee Magu, Malé" },
      "Portmark Clearing Agency": { tin: "1070123", email: "desk@portmark.example", phone: "+960 330 6655", address: "Commercial Harbour, Malé" },
      "Isleway Power & Water": { tin: "1011002GST501", gst_number: "1011002GST501", email: "accounts@isleway.example", phone: "+960 1616" },
    };
    const bills = [];
    const bill = async (supplierName, billNo, amount, issueDate, dueDate, gstTreatment, extra = {}) => {
      const b = await api("POST", "/bills", { supplierName, billNo, amount, issueDate, dueDate, gstTreatment, supplier: suppliers[supplierName], ...extra });
      if (!b) return null;
      const posted = await api("POST", `/bills/${b.bill.id}/post`);
      bills.push({ id: b.bill.id, supplierName, amount, dueDate, posted: Boolean(posted) });
      return b.bill.id;
    };
    await bill("Seabridge Cement Supplies", "SCS-2026-0612", "43200.00", "2026-06-12", "2026-07-12", "inclusive", { projectId: staffBlock, lines: [{ description: "Cement 50 kg, 400 bags", amount: "43200.00" }] });
    await bill("Northwind Steel Trading", "NST/1188", "88560.00", "2026-06-18", "2026-07-18", "inclusive", { projectId: staffBlock, lines: [{ description: "Rebar 16 mm, 300 lengths", amount: "88560.00" }] });
    await bill("Brightwater Fuel Co", "BF-77120", "12420.00", "2026-06-30", "2026-07-15", "inclusive", { dimensionIds: [dims["Excavator EX-2"]].filter(Boolean) });
    await bill("Isleway Power & Water", "IPW-0626-4471", "6318.00", "2026-06-30", "2026-07-20", "inclusive", { dimensionIds: [dims["Malé yard"]].filter(Boolean) });
    await bill("Reefside Hardware", "R-5521", "3875.00", "2026-07-08", "2026-07-22", "none_unregistered", { projectId: jetty });
    await bill("Seabridge Cement Supplies", "SCS-2026-0744", "51840.00", "2026-07-20", "2026-08-19", "inclusive", { projectId: staffBlock });
    await bill("Brightwater Fuel Co", "BF-78301", "14688.00", "2026-07-31", "2026-08-15", "inclusive", { dimensionIds: [dims["Excavator EX-2"]].filter(Boolean) });
    await bill("Isleway Power & Water", "IPW-0726-4502", "6804.00", "2026-07-31", "2026-08-20", "inclusive", { dimensionIds: [dims["Malé yard"]].filter(Boolean) });
    await bill("Portmark Clearing Agency", "PCA-339", "18500.00", "2026-08-06", "2026-08-20", "none_unregistered");
    await bill("Northwind Steel Trading", "NST/1302", "132840.00", "2026-08-14", "2026-09-13", "inclusive", { projectId: staffBlock });
    await bill("Brightwater Fuel Co", "BF-79455", "16092.00", "2026-08-31", "2026-09-15", "inclusive", { dimensionIds: [dims["Excavator EX-2"]].filter(Boolean) });
    await bill("Isleway Power & Water", "IPW-0826-4533", "7236.00", "2026-08-31", "2026-09-20", "inclusive", { dimensionIds: [dims["Malé yard"]].filter(Boolean) });
    await bill("Reefside Hardware", "R-5790", "2640.00", "2026-09-09", "2026-09-23", "none_unregistered", { projectId: jetty });
    await bill("Seabridge Cement Supplies", "SCS-2026-0911", "64800.00", "2026-09-15", "2026-10-15", "inclusive", { projectId: staffBlock });
    await bill("Brightwater Fuel Co", "BF-80102", "15336.00", "2026-09-22", "2026-10-07", "inclusive", { dimensionIds: [dims["Excavator EX-2"]].filter(Boolean) });
    // One waiting for a person to say how it is taxed.
    await api("POST", "/bills", { supplierName: "Reefside Hardware", billNo: "R-5842", amount: "1180.00", issueDate: "2026-09-23", gstTreatment: "unknown", supplier: suppliers["Reefside Hardware"] });
    log(`${bills.length} bills in the books, one waiting to be checked`);

    // Paid: everything due before August, in three runs.
    const from = (await api("GET", "/payments"))?.from?.find((a) => a.id === bank.id)?.id || bank.id;
    const pay = async (paidOn, reference, which) => {
      const list = bills.filter((b) => b.posted && which(b));
      if (list.length) await api("POST", "/payments", { fromAccountId: from, paidOn, reference, items: list.map((b) => ({ billId: b.id, amount: b.amount })) });
    };
    await pay("2026-07-14", "RUN-JUL-1", (b) => b.dueDate <= "2026-07-20");
    await pay("2026-08-18", "RUN-AUG-1", (b) => b.dueDate > "2026-07-20" && b.dueDate <= "2026-08-20");
    await pay("2026-09-14", "RUN-SEP-1", (b) => b.dueDate > "2026-08-20" && b.dueDate <= "2026-09-15");
    log("bills paid in payment runs in July, August and September");

    // ------------------------------------------------------------ sales
    const moneyIn = (await api("GET", "/sales/money-accounts"))?.accounts?.find((a) => a.id === bank.id)?.id || bank.id;
    const invoices = [];
    const sell = async (customerName, issueDate, dueDate, lines, extra = {}) => {
      const r = await api("POST", "/sales", { customerName, issueDate, dueDate, gstTreatment: "exclusive", lines, ...extra });
      if (!r) return null;
      await api("POST", `/sales/${r.invoice.id}/post`);
      invoices.push({ id: r.invoice.id, gross: r.invoice.gross, customerName, issueDate });
      return r.invoice;
    };
    const receive = async (inv, receivedOn, amount, reference) =>
      inv && api("POST", "/sales/receipts", { accountId: moneyIn, receivedOn, reference, amount: amount || String(inv.gross).replace(/,/g, ""), allocations: [{ invoiceId: inv.id, amount: amount || String(inv.gross).replace(/,/g, "") }] });

    const i1 = await sell("Tidehouse Café", "2026-06-08", "2026-06-22", [{ description: "Kitchen floor retiling, labour and materials", quantity: 1, unitPrice: "38500.00" }], { purchaseOrder: "TH-PO-014", subject: "Kitchen floor, June" });
    await receive(i1, "2026-06-20", null, "TT from Tidehouse");
    const i2 = await sell("Sandvale Resort & Spa", "2026-06-15", "2026-07-15", [
      { description: "Excavator EX-2 hire with operator", quantity: 12, uom: "day", unitPrice: "3200.00" },
      { description: "Mobilisation to site by barge", quantity: 1, unitPrice: "8500.00" },
    ], { projectId: jetty, subject: "Jetty repair, excavator hire" });
    await receive(i2, "2026-07-10", null, "Sandvale transfer 0710");
    const i3 = await sell("Palmway Apartments", "2026-06-25", "2026-07-25", [{ description: "Water tank replacement, block B", quantity: 1, unitPrice: "64200.00" }]);
    await receive(i3, "2026-08-02", "30000.00", "Palmway part payment");
    await sell("Sandvale Resort & Spa", "2026-07-05", "2026-08-04", [{ description: "Jetty deck boards, supply and fix", quantity: 180, uom: "m2", unitPrice: "650.00" }], { projectId: jetty, subject: "Jetty repair, deck" });
    const i5 = await sell("Tidehouse Café", "2026-07-28", "2026-08-11", [
      { description: "Cement 50 kg", quantity: 40, uom: "bag", unitPrice: "128.00", itemId: items["Cement 50 kg"] },
      { description: "River sand", quantity: 4, uom: "m3", unitPrice: "780.00", itemId: items["River sand"] },
    ]);
    await receive(i5, "2026-08-10", null, "Tidehouse cash deposit");
    const i6 = await sell("Palmway Apartments", "2026-08-20", "2026-09-19", [
      { description: "Hollow block 6 inch", quantity: 1200, unitPrice: "14.50", itemId: items["Hollow block 6 inch"] },
      { description: "Waterproofing membrane", quantity: 8, uom: "roll", unitPrice: "1450.00", itemId: items["Waterproofing membrane"] },
    ]);
    await sell("Tidehouse Café", "2026-09-12", "2026-09-26", [{ description: "Terrace canopy frame, supply and install", quantity: 1, unitPrice: "46800.00" }]);
    await sell("Sandvale Resort & Spa", "2026-09-18", "2026-10-18", [{ description: "Excavator EX-2 hire with operator", quantity: 9, uom: "day", unitPrice: "3200.00" }], { projectId: jetty });
    if (i6) await api("POST", `/sales/${i6.id}/credit`, { reason: "Two rolls of membrane came back unused", amount: "3132.00", issueDate: "2026-09-02", returned: [{ itemId: items["Waterproofing membrane"], quantity: "2" }] });
    // A draft waiting to go out.
    await api("POST", "/sales", { customerName: "Moonreef Hotels", issueDate: "2026-09-24", dueDate: "2026-10-24", gstTreatment: "exclusive", subject: "Staff block, additional works", lines: [{ description: "Extra drainage pit and connection", quantity: 1, unitPrice: "22400.00" }] });
    log(`${invoices.length} invoices, receipts, a credit note with stock back, a draft`);

    // ------------------------------------------------------------ the staff block project
    const parties = (await api("GET", "/orders/options"))?.parties || [];
    let moonreef = parties.find((p) => p.name === "Moonreef Hotels")?.id;
    if (!moonreef) {
      const d = await api("POST", "/sales", { customerName: "Moonreef Hotels", gstTreatment: "exclusive", lines: [{ description: "x", amount: "1" }] });
      moonreef = (await api("GET", "/orders/options"))?.parties?.find((p) => p.name === "Moonreef Hotels")?.id;
      if (d) await api("DELETE", `/sales/${d.invoice.id}`, { reason: "only to name the customer" });
    }
    await api("PUT", `/projects/${staffBlock}/contract`, { counterpartyId: moonreef, contract: "2400000", retentionPct: 10, retentionCapPct: 5, startsOn: "2026-06-10", endsOn: "2027-02-28" });
    const materials = expense(/material/i), labour = expense(/labour|wage|salar/i), subs = expense(/subcontract/i) || expense(/contract/i);
    await api("PUT", `/projects/${staffBlock}/budget`, { lines: [materials && { accountId: materials, amount: "980000" }, labour && { accountId: labour, amount: "520000" }, subs && { accountId: subs, amount: "360000" }].filter(Boolean) });
    await api("PUT", `/projects/${staffBlock}/boq`, { items: [
      { ref: "1.1", description: "Site clearance and excavation", unit: "m3", quantity: "850", rate: "180" },
      { ref: "2.1", description: "Reinforced concrete foundations", unit: "m3", quantity: "210", rate: "3400" },
      { ref: "3.1", description: "Blockwork walls, 6 inch", unit: "m2", quantity: "1900", rate: "310" },
      { ref: "4.1", description: "Roof slab and waterproofing", unit: "m2", quantity: "620", rate: "980" },
      { ref: "5.1", description: "MEP first fix", unit: "item", quantity: "1", rate: "297900" },
    ] });
    const vo1 = await api("POST", `/projects/${staffBlock}/variations`, { description: "Additional septic tank and soakaway", amount: "86500" });
    if (vo1) await api("POST", `/projects/${staffBlock}/variations/${vo1.id}/decide`, { approved: true, on: "2026-08-02" });
    await api("POST", `/projects/${staffBlock}/variations`, { description: "Upgrade to anti-slip corridor tiles", amount: "41200" });
    const boq = (await api("GET", `/projects/${staffBlock}`))?.boq || [];
    const done = (ref, q) => ({ boqId: boq.find((b) => b.ref === ref)?.id, done: q });
    const c1 = boq.length && (await api("POST", `/projects/${staffBlock}/claims`, { periodTo: "2026-07-31", measured: [done("1.1", "850"), done("2.1", "120")] }));
    if (c1) await api("POST", `/projects/${staffBlock}/claims/${c1.id}/certify`, { certifiedToDate: "553000", on: "2026-08-08" });
    const c2 = boq.length && (await api("POST", `/projects/${staffBlock}/claims`, { periodTo: "2026-08-31", measured: [done("2.1", "210"), done("3.1", "700")], claimedToDate: "40000" }));
    if (c2) await api("POST", `/projects/${staffBlock}/claims/${c2.id}/certify`, { certifiedToDate: "1033000", on: "2026-09-07" });
    const c3 = boq.length && (await api("POST", `/projects/${staffBlock}/claims`, { periodTo: "2026-09-20", measured: [done("3.1", "1350")], claimedToDate: "86500" }));
    if (subs) await api("POST", `/projects/${staffBlock}/commitments`, { description: "Electrical and plumbing subcontract, first fix", accountId: subs, amount: "285000" });
    for (const [on, who, h, rate, note] of [
      ["2026-09-21", "Ibrahim Nadeem", "9", "95", "Block B blockwork"],
      ["2026-09-21", "Hassan Rizwan", "8", "70", "Block B blockwork"],
      ["2026-09-22", "Ibrahim Nadeem", "10", "95", "Roof shuttering"],
      ["2026-09-22", "Moosa Aflah", "8", "65", "Roof shuttering"],
      ["2026-09-23", "Ibrahim Nadeem", "8.5", "95", "Pour prep"],
    ]) await api("POST", `/projects/${staffBlock}/hours`, { workedOn: on, who, hours: h, rate, note });
    await api("PUT", `/projects/${jetty}/contract`, { counterpartyId: parties.find((p) => p.name === "Sandvale Resort & Spa")?.id, contract: "310000", retentionPct: 5 });
    log(`staff block: contract, budget, bill of quantities, two variations, ${c3 ? 3 : 2} claims, hours`);

    // ------------------------------------------------------------ cash on site
    const tin = (await api("POST", "/cash", { name: "Staff block site tin", projectId: staffBlock, float: "10000" }))?.box;
    const office = (await api("POST", "/cash", { name: "Office petty cash", float: "3000" }))?.box;
    const kinds = (await api("GET", "/cash/kinds"))?.kinds || [];
    const kind = (re) => (kinds.find((k) => re.test(k.name)) || kinds[0])?.id;
    // The holder signs for each float, so the cash is in the tin before it is spent.
    const signFor = async () => {
      for (const b of (await api("GET", "/cash"))?.boxes || []) for (const t of b.handed || []) await api("POST", `/cash/topups/${t.id}/receive`, { received: t.amount.replace(/,/g, "") });
    };
    if (tin) {
      await api("POST", `/cash/${tin.id}/give`, { amount: "10000", bankAccountId: bank.id, note: "Float for the site" });
      await signFor();
      for (const [what, amount, re, spentOn] of [
        ["Drinking water for the crew", "640.00", /food|meal|welfare|general|sundr/i, "2026-09-02"],
        ["Ferry tickets to Hulhumalé, 6 people", "360.00", /travel|transport/i, "2026-09-05"],
        ["Binding wire, 5 rolls", "925.00", /material/i, "2026-09-09"],
        ["Generator diesel top-up", "1180.00", /fuel/i, "2026-09-15"],
        ["Lunch for the pour crew", "1450.00", /food|meal|welfare|general|sundr/i, "2026-09-19"],
      ]) await api("POST", `/cash/${tin.id}/spend`, { amount, what, accountId: kind(re), projectId: staffBlock, spentOn });
    }
    if (office) {
      await api("POST", `/cash/${office.id}/give`, { amount: "3000", bankAccountId: bank.id, note: "Petty cash float" });
      await signFor();
      await api("POST", `/cash/${office.id}/spend`, { amount: "285.00", what: "Printer paper and toner", accountId: kind(/office|station/i), spentOn: "2026-09-11" });
      await api("POST", `/cash/${office.id}/spend`, { amount: "150.00", what: "Courier to the council office", accountId: kind(/post|courier|general|sundr/i), spentOn: "2026-09-17" });
    }
    log("two cash tins with floats and spends");

    // ------------------------------------------------------------ assets and a loan
    const payFrom = (await api("GET", "/assets"))?.payFrom?.find((a) => a.id === bank.id)?.id || bank.id;
    await api("POST", "/assets", { name: "Excavator EX-2 (20 t tracked)", category: "equipment", cost: "1250000", residual: "150000", acquiredOn: "2026-06-15", lifeYears: 8, method: "straight_line", fromAccountId: payFrom });
    await api("POST", "/assets", { name: "Pickup P-14 (double cab)", category: "vehicles", cost: "385000", residual: "60000", acquiredOn: "2026-06-20", lifeYears: 5, method: "straight_line", fromAccountId: payFrom });
    await api("POST", "/assets", { name: "Site office container and furniture", category: "furniture", cost: "74500", acquiredOn: "2026-07-01", lifeYears: 4, fromAccountId: payFrom });
    const places = (await api("GET", "/loans"))?.places || [];
    const loan = await api("POST", "/loans", { kind: "bank_term", name: "Equipment term loan", principal: "900000", startsOn: "2026-06-10", ratePct: 9.5, rateBasis: "reducing", termMonths: 36, method: "annuity", firstDue: "2026-07-10", intoAccountId: places.find((p) => p.id === bank.id)?.id || bank.id });
    const loanId = loan?.id || loan?.loan?.id;
    if (loanId) for (const on of ["2026-07-10", "2026-08-10", "2026-09-10"]) await api("POST", `/loans/${loanId}/repay`, { on, amount: "28830.00", fromAccountId: bank.id });
    await api("POST", "/loans", { kind: "director_in", name: "Loan from Aisha Rameez", principal: "250000", startsOn: "2026-06-05", method: "none", intoAccountId: bank.id });
    log("three assets on the register, an equipment loan being repaid, a director's loan");

    // ------------------------------------------------------------ orders, quotes, repeat billing
    await api("POST", "/orders", { kind: "purchase", partyName: "Northwind Steel Trading", projectId: staffBlock, orderedOn: "2026-09-16", expectedOn: "2026-10-01", note: "Deliver to the staff block site, gate 2", lines: [
      { itemId: items["Rebar 16 mm"], description: "Rebar 16 mm", quantity: 200, unit: "length", unitPrice: "246.00" },
      { itemId: items["Rebar 10 mm"], description: "Rebar 10 mm", quantity: 250, unit: "length", unitPrice: "115.00" },
    ] });
    await api("POST", "/orders", { kind: "purchase", partyName: "Seabridge Cement Supplies", orderedOn: "2026-09-22", expectedOn: "2026-09-29", lines: [{ itemId: items["Cement 50 kg"], description: "Cement 50 kg", quantity: 500, unit: "bag", unitPrice: "98.00" }] });
    await api("POST", "/orders", { kind: "sale", partyName: "Palmway Apartments", orderedOn: "2026-09-20", lines: [{ itemId: items["Hollow block 6 inch"], description: "Hollow block 6 inch", quantity: 1500, unitPrice: "14.50" }] });
    const q1 = await api("POST", "/orders", { kind: "quote", partyName: "Moonreef Hotels", validUntil: "2026-10-31", note: "Price holds for 30 days", lines: [
      { description: "Guest villa roof repairs, 6 villas", quantity: 6, unit: "villa", unitPrice: "18500.00" },
      { description: "Scaffolding and safety", quantity: 1, unitPrice: "9800.00" },
    ] });
    const q2 = await api("POST", "/orders", { kind: "quote", partyName: "Tidehouse Café", validUntil: "2026-09-30", lines: [{ description: "Outdoor seating deck, 45 m2", quantity: 45, unit: "m2", unitPrice: "720.00" }] });
    if (q2) await api("POST", `/orders/${q2.id}/accept`);
    void q1;
    await api("POST", "/recurring", { customerName: "Palmway Apartments", name: "Building maintenance contract", every: "month", startsOn: "2026-07-01", gstTreatment: "exclusive", postAutomatically: true, lines: [{ description: "Monthly maintenance, blocks A and B", quantity: 1, unitPrice: "12500.00" }] });
    log("two purchase orders, a sales order, two quotes (one accepted), a monthly contract");

    // ------------------------------------------------------------ claims, notes, people
    const staffAcc = (await api("GET", "/claims/options"))?.accounts || [];
    const claimAcc = (re) => (staffAcc.find((a) => re.test(a.name)) || staffAcc[0])?.id;
    await api("POST", "/claims", { note: "Trip to the Sandvale site", lines: [
      { spentOn: "2026-09-10", description: "Speedboat to Sandvale and back", accountId: claimAcc(/travel|transport/i), projectId: jetty, amount: "1800.00" },
      { spentOn: "2026-09-10", description: "Lunch with the resort engineer", accountId: claimAcc(/meal|food|entertain|general/i), projectId: jetty, amount: "420.00" },
    ] });
    for (const [topic, note] of [
      ["What we sell", "Building and civil works for resorts and apartment owners, plus excavator hire and building materials from the yard."],
      ["Seasons", "Resort work peaks between May and October, before the busy tourist season; apartment work is steady all year."],
      ["Watch", "Steel prices move with the dollar; we buy rebar in dollars from Northwind."],
    ]) await api("PUT", "/cfo/notes", { topic, note });
    for (const [email, role] of [["foreman.demo@example.com", "site_staff"], ["accounts.demo@example.com", "accountant"], ["approver.demo@example.com", "approver"]]) {
      await api("POST", "/companies/current/people", { email, role });
    }
    log("an expense claim waiting for approval, notes for the CFO, three people invited");

    console.log(`\n  ${COMPANY} is filled in.${failures.length ? `\n  ${failures.length} step(s) skipped:\n   - ${failures.join("\n   - ")}` : " Nothing skipped."}`);
  } catch (err) {
    console.log("  STOPPED: " + err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();

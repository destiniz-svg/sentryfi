/**
 * A Zoho Books backup (Settings, Export data, the whole organisation as a zip
 * of CSVs), turned into the balanced transactions the history import posts.
 *
 * The backup holds documents, not a ledger: invoices, bills, expenses,
 * payments, transfers and manual journals, each one row per line with its
 * header repeated. Zoho posts some lines itself that the files do not carry,
 * so they are put back here, the way Zoho posts them:
 *   - an invoice: receivable against each line's account, GST owed, and its
 *     adjustment and round-off to Other Charges;
 *   - a bill: each line's account and GST claimable against payable;
 *   - an expense: its account (net of tax when the amount included it) and
 *     GST claimable against the account it was paid from;
 *   - a payment: the bank against receivable or payable at the document's own
 *     rate, the difference to Exchange Gain or Loss, and any amount not applied
 *     left with the customer or supplier as an advance;
 *   - a manual journal: its lines, plus the GST Zoho adds for a line that
 *     carries tax (the export has the tax on the line, not the line itself).
 * Amounts are in the document's currency and converted at its own rate; a
 * dollar line keeps its dollars. Each transaction is keyed by its Zoho type
 * and id, so the same backup brought in twice changes nothing.
 *
 * Pure: files in, transactions out; the database is the history import's.
 * Checks the backup against itself as it goes: every document's total, and
 * every balance, must agree with its lines and payments, or it says so.
 */
const { tokenise, unwrap } = require("./statement");
const fx = require("./fx");

const BASE = "MVR";
// The names the lines go under: Zoho's own, except GST, whose one account is
// split by direction so it can land on GST owed and GST claimable here.
const AR = "Accounts Receivable";
const AP = "Accounts Payable";
const GST_OUT = "GST on sales (Zoho: GST - Tax Payable)";
const GST_IN = "GST on purchases (Zoho: GST - Tax Payable)";
const OTHER = "Other Charges";
const FX_DIFF = "Exchange Gain or Loss";

function rows(text) {
  if (!text) return [];
  const all = tokenise(String(text).replace(/^﻿/, "")).filter((r) => r.some((c) => String(c).trim()));
  const head = (all[0] || []).map((h) => unwrap(h).trim());
  return all.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, unwrap(r[i] ?? "").trim()])));
}

/** "1689.330" or "-12.5" as laari, rounded half away from zero. */
function laari(v) {
  const s = String(v ?? "").replace(/,/g, "").trim();
  if (!s || !/^-?\d*\.?\d*$/.test(s)) return 0n;
  const neg = s.startsWith("-");
  const [w, f = ""] = s.replace("-", "").split(".");
  const cents = BigInt(w || "0") * 100n + BigInt((f + "000").slice(0, 2));
  const up = Number((f + "000")[2]) >= 5 ? 1n : 0n;
  return (neg ? -1n : 1n) * (cents + up);
}

const group = (list, key) => {
  const m = new Map();
  for (const r of list) {
    const k = r[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
};

/** A document's amount in rufiyaa at its own rate; a rufiyaa amount as it is. */
function inBase(amount, currency, rate) {
  return !currency || currency === BASE || Number(rate) === 1 ? amount : fx.toBase(amount, String(Number(rate)));
}

/** Lines to a balanced transaction: rounding left by conversion goes to the largest line that is not the anchor. */
function settle(t, anchorIndex = 0) {
  const d = t.lines.reduce((a, l) => a + l.debit, 0n);
  const c = t.lines.reduce((a, l) => a + l.credit, 0n);
  let off = d - c;
  if (off !== 0n && off > -100n && off < 100n) {
    const idx = t.lines.map((l, i) => i).filter((i) => i !== anchorIndex).sort((a, b) => Number((t.lines[b].debit + t.lines[b].credit) - (t.lines[a].debit + t.lines[a].credit)))[0];
    const l = t.lines[idx];
    if (l) {
      if (l.credit > 0n) l.credit += off;
      else l.debit -= off;
      off = 0n;
    }
  }
  t.lines = t.lines.filter((l) => l.debit > 0n || l.credit > 0n);
  const debit = t.lines.reduce((a, l) => a + l.debit, 0n);
  const credit = t.lines.reduce((a, l) => a + l.credit, 0n);
  return { ...t, debit, credit, balanced: debit === credit && t.lines.length >= 2 };
}

/** A signed amount onto the side it belongs: positive to `side`, negative to the other. */
function line(account, amount, side, extra = {}) {
  if (amount === 0n) return null;
  const pos = amount > 0n;
  const abs = pos ? amount : -amount;
  const debit = (side === "debit") === pos ? abs : 0n;
  return { account, debit, credit: debit ? 0n : abs, ...extra };
}

/**
 * Zoho writes each reporting tag as a column of its own, headed by the tag's
 * option and holding that same name on each line it applies to. A column like
 * that is a tag; every other column is a field.
 */
function tagColumns(list) {
  if (!list.length) return [];
  return Object.keys(list[0]).filter((h) => {
    const v = list.map((r) => r[h]).filter(Boolean);
    return v.length > 0 && v.every((x) => x === h);
  });
}
const tagsOf = (row, cols) => cols.filter((c) => row[c]);
/** A line's tags and project, when it has any. */
const markOf = (row, cols) => {
  const dims = tagsOf(row, cols);
  const project = row["Project Name"] || null;
  return { ...(dims.length ? { dims } : {}), ...(project ? { project } : {}) };
};

function convert(files) {
  const get = (name) => rows(files[name]);
  const chart = get("Chart_of_Accounts.csv");
  const currencyOf = new Map(chart.map((a) => [a["Account Name"], a.Currency || BASE]));
  const types = Object.fromEntries(chart.map((a) => [a["Account Name"], a["Account Type"]]));
  const problems = [];
  const out = [];
  const fcOn = (account, currency, amount, rate) =>
    currency && currency !== BASE && (currencyOf.get(account) === currency || account === AR || account === AP)
      ? { fc: { currency, amount: amount < 0n ? -amount : amount, rate: String(Number(rate)) } }
      : {};
  const push = (t, anchor) => {
    const s = settle({ ...t, lines: t.lines.filter(Boolean) }, anchor);
    if (!s.balanced) problems.push(`${t.type} ${t.theirId} does not balance`);
    out.push(s);
  };

  // ---- invoices
  const invoiceRate = new Map();
  for (const [id, ls] of group(get("Invoice.csv"), "Invoice ID")) {
    const h = ls[0];
    if (/draft|void/i.test(h["Invoice Status"])) continue;
    const cur = h["Currency Code"] || BASE;
    const rate = h["Exchange Rate"] || "1";
    invoiceRate.set(h["Invoice Number"], { cur, rate });
    const total = laari(h.Total);
    const party = { name: h["Customer Name"], kind: "customer" };
    const lines = [line(AR, inBase(total, cur, rate), "debit", { party, ...fcOn(AR, cur, total, rate), memo: h["Invoice Number"] })];
    let sum = 0n;
    for (const l of ls) {
      const net = laari(l["Item Total"]);
      const tax = laari(l["Item Tax Amount"]);
      sum += net + tax;
      lines.push(line(l.Account, inBase(net, cur, rate), "credit", { memo: l["Item Name"] || null }));
      lines.push(line(GST_OUT, inBase(tax, cur, rate), "credit"));
    }
    const extra = laari(h.Adjustment) + laari(h["Round Off"]) + laari(h["Shipping Charge"]) - laari(h["Entity Discount Amount"]);
    lines.push(line(OTHER, inBase(extra, cur, rate), "credit", { memo: h["Adjustment Description"] || "Adjustment" }));
    if (sum + extra !== total) problems.push(`Invoice ${h["Invoice Number"]}: its lines do not add up to its total`);
    push({ key: `invoice|${id}|${h["Invoice Date"]}`, date: h["Invoice Date"], type: "Invoice", theirId: h["Invoice Number"], memo: h["Customer Name"], lines });
  }

  // A payment left as a draft (or voided) never reached Zoho's books.
  const paid = (file, idCol) => [...group(get(file), idCol)].filter(([, ls]) => !/draft|void/i.test(ls[0]["Payment Status"] || ""));

  // ---- customer payments
  for (const [id, ls] of paid("Customer_Payment.csv", "CustomerPayment ID")) {
    const h = ls[0];
    const cur = h["Currency Code"] || BASE;
    const rate = h["Exchange Rate"] || "1";
    const amount = laari(h.Amount);
    const party = { name: h["Customer Name"], kind: "customer" };
    const lines = [line(h["Deposit To"], inBase(amount, cur, rate), "debit", { ...fcOn(h["Deposit To"], cur, amount, rate), memo: h["Reference Number"] || null })];
    let applied = 0n;
    for (const a of ls) {
      const amt = laari(a["Amount Applied to Invoice"]);
      if (!amt) continue;
      applied += amt;
      const inv = invoiceRate.get(a["Invoice Number"]) || { cur, rate };
      lines.push(line(AR, inBase(amt, inv.cur, inv.rate), "credit", { party, ...fcOn(AR, inv.cur, amt, inv.rate), memo: a["Invoice Number"] }));
    }
    const charges = laari(h["Bank Charges"]);
    if (charges) lines.push(line("Bank Fees and Charges", inBase(charges, cur, rate), "debit"));
    const spare = amount - applied - charges;
    if (spare > 0n) lines.push(line(AR, inBase(spare, cur, rate), "credit", { party, ...fcOn(AR, cur, spare, rate), memo: "Paid in advance" }));
    // Whatever the two rates leave is the exchange difference.
    const d = lines.filter(Boolean).reduce((s, l) => s + l.debit - l.credit, 0n);
    if (d !== 0n) lines.push(line(FX_DIFF, -d, "debit"));
    push({ key: `customer_payment|${id}|${h.Date}`, date: h.Date, type: "Customer payment", theirId: h["Payment Number"], memo: h["Customer Name"], lines });
  }

  // ---- bills
  const billRate = new Map();
  const billRows = get("Bill.csv");
  const billTags = tagColumns(billRows);
  for (const [id, ls] of group(billRows, "Bill ID")) {
    const h = ls[0];
    if (/draft|void/i.test(h["Bill Status"])) continue;
    const cur = h["Currency Code"] || BASE;
    const rate = h["Exchange Rate"] || "1";
    billRate.set(id, { cur, rate });
    const total = laari(h.Total);
    const party = { name: h["Vendor Name"], kind: "supplier" };
    const lines = [line(AP, inBase(total, cur, rate), "credit", { party, ...fcOn(AP, cur, total, rate), memo: h["Bill Number"] })];
    let sum = 0n;
    for (const l of ls) {
      const net = laari(l["Item Total"]);
      const tax = laari(l["Tax Amount"]);
      sum += net + tax;
      lines.push(line(l.Account, inBase(net, cur, rate), "debit", { memo: l["Item Name"] || l.Description || null, ...markOf(l, billTags) }));
      lines.push(line(GST_IN, inBase(tax, cur, rate), "debit"));
    }
    const extra = laari(h.Adjustment) - laari(h["Entity Discount Amount"]);
    lines.push(line(OTHER, inBase(extra, cur, rate), "debit", { memo: h["Adjustment Description"] || "Adjustment" }));
    if (sum + extra !== total) problems.push(`Bill ${h["Bill Number"]}: its lines do not add up to its total`);
    push({ key: `bill|${id}|${h["Bill Date"]}`, date: h["Bill Date"], type: "Bill", theirId: h["Bill Number"], memo: h["Vendor Name"], lines });
  }

  // ---- vendor payments
  for (const [id, ls] of paid("Vendor_Payment.csv", "VendorPayment ID")) {
    const h = ls[0];
    const cur = h["Currency Code"] || BASE;
    const rate = h["Exchange Rate"] || "1";
    const amount = laari(h.Amount);
    const unused = laari(h["Unused Amount"]);
    const party = { name: h["Vendor Name"], kind: "supplier" };
    const lines = [line(h["Paid Through"], inBase(amount, cur, rate), "credit", { ...fcOn(h["Paid Through"], cur, amount, rate), memo: h["Reference Number"] || null })];
    // What was not applied stays with the supplier as an advance, even where
    // the export still lists it against a bill.
    let toApply = amount - unused - laari(h["Bank Charges"]);
    for (const a of ls) {
      let amt = laari(a["Bill Amount"]);
      if (amt > toApply) amt = toApply;
      if (amt <= 0n) continue;
      toApply -= amt;
      const b = billRate.get(a["Bill ID"]) || { cur, rate };
      lines.push(line(AP, inBase(amt, b.cur, b.rate), "debit", { party, ...fcOn(AP, b.cur, amt, b.rate), memo: a["Bill Number"] }));
    }
    if (unused > 0n) lines.push(line(AP, inBase(unused, cur, rate), "debit", { party, ...fcOn(AP, cur, unused, rate), memo: "Paid in advance" }));
    const charges = laari(h["Bank Charges"]);
    if (charges) lines.push(line("Bank Fees and Charges", inBase(charges, cur, rate), "debit"));
    const d = lines.filter(Boolean).reduce((s, l) => s + l.debit - l.credit, 0n);
    if (d !== 0n) lines.push(line(FX_DIFF, -d, "debit"));
    push({ key: `vendor_payment|${id}|${h.Date}`, date: h.Date, type: "Vendor payment", theirId: h["Payment Number"], memo: h["Vendor Name"], lines });
  }

  // ---- expenses
  const expenseRows = get("Expense.csv");
  const expenseTags = tagColumns(expenseRows);
  for (const [id, ls] of group(expenseRows, "Expense Reference ID")) {
    const h = ls[0];
    const cur = h["Currency Code"] || BASE;
    const rate = h["Exchange Rate"] || "1";
    const total = laari(h.Total);
    const lines = [line(h["Paid Through"], inBase(total, cur, rate), "credit", { ...fcOn(h["Paid Through"], cur, total, rate), memo: h["Reference#"] || null })];
    let sum = 0n;
    for (const l of ls) {
      const tax = laari(l["Tax Amount"]);
      const amount = laari(l["Expense Amount"]);
      const net = l["Is Inclusive Tax"] === "true" ? amount - tax : amount;
      sum += net + tax;
      lines.push(line(l["Expense Account"], inBase(net, cur, rate), "debit", { memo: l["Expense Description"] || l.Vendor || null, ...markOf(l, expenseTags) }));
      lines.push(line(GST_IN, inBase(tax, cur, rate), "debit"));
    }
    if (sum !== total) problems.push(`Expense ${h["Entry Number"]}: its lines do not add up to its total`);
    push({ key: `expense|${id}|${h["Expense Date"]}`, date: h["Expense Date"], type: "Expense", theirId: h["Entry Number"] || h["Reference#"], memo: h.Vendor || h["Expense Description"] || null, lines });
  }

  // ---- money moved between accounts
  get("Transfer_Fund.csv").forEach((r, i) => {
    const cur = r["Currency Code"] || BASE;
    const rate = r["Exchange Rate"] || "1";
    const amount = laari(r.Total);
    const base = inBase(amount, cur, rate);
    push({
      key: `transfer_fund|${i}|${r["Transaction Date"]}|${r.Reference || ""}`,
      date: r["Transaction Date"],
      type: "Transfer",
      theirId: r.Reference || null,
      memo: r.Description || null,
      lines: [line(r["To Account"], base, "debit", fcOn(r["To Account"], cur, amount, rate)), line(r["From Account"], base, "credit", fcOn(r["From Account"], cur, amount, rate))],
    });
  });

  // ---- manual journals
  const journalRows = get("Journal.csv");
  const journalTags = tagColumns(journalRows);
  for (const [id, ls] of group(journalRows, "Journal ID")) {
    const h = ls[0];
    if (!/published/i.test(h.Status || "Published")) continue;
    const lines = [];
    for (const l of ls) {
      const cur = l.Currency || BASE;
      const rate = l["Exchange Rate"] || "1";
      const debit = laari(l.Debit);
      const credit = laari(l.Credit);
      const party = l["Contact Name"] && (l.Account === AR || l.Account === AP) ? { party: { name: l["Contact Name"], kind: l.Account === AR ? "customer" : "supplier" } } : {};
      const amt = debit || credit;
      lines.push(line(l.Account, inBase(amt, cur, rate), debit ? "debit" : "credit", { ...party, ...fcOn(l.Account, cur, amt, rate), memo: l.Description || null, ...markOf(l, journalTags) }));
      // The tax on a line is a line of its own in Zoho's ledger, on the same side.
      const tax = laari(l["Tax Amount"]);
      if (tax) lines.push(line(debit ? GST_IN : GST_OUT, inBase(tax, cur, rate), debit ? "debit" : "credit"));
    }
    push({ key: `journal|${id}|${h["Journal Date"]}`, date: h["Journal Date"], type: "Journal", theirId: `${h["Journal Number"] || ""}${h["Journal Number Suffix"] || ""}` || null, memo: h.Notes || h["Reference Number"] || null, lines });
  }

  // ---- what the backup says of itself, for checking afterwards
  const balances = { invoices: [], bills: [] };
  for (const [, ls] of group(get("Invoice.csv"), "Invoice ID")) if (!/draft|void/i.test(ls[0]["Invoice Status"])) balances.invoices.push({ number: ls[0]["Invoice Number"], customer: ls[0]["Customer Name"], currency: ls[0]["Currency Code"], balance: laari(ls[0].Balance) });
  for (const [, ls] of group(get("Bill.csv"), "Bill ID")) if (!/draft|void/i.test(ls[0]["Bill Status"])) balances.bills.push({ number: ls[0]["Bill Number"], vendor: ls[0]["Vendor Name"], currency: ls[0]["Currency Code"], balance: laari(ls[0].Balance) });

  const counted = (name) => rows(files[name]).length;
  const address = (r) => [r["Billing Address"], r["Billing Street2"], r["Billing City"], r["Billing State"], r["Billing Country"]].filter(Boolean).join(", ") || null;
  const person = new Map(get("Contact_Persons.csv").filter((p) => p["Is Primary"] !== "false").map((p) => [p["Customer Name"], p]));
  const contact = (r, kind) => {
    const p = person.get(r["Display Name"]) || {};
    return {
      name: r["Display Name"] || r["Contact Name"],
      kind,
      email: r.EmailID || p.EmailID || null,
      phone: r.MobilePhone || r.Phone || p.MobilePhone || p.Phone || null,
      address: address(r),
      notes: [r.Notes, r["Company Name"] && r["Company Name"] !== r["Display Name"] ? `Registered as ${r["Company Name"]}` : null].filter(Boolean).join(" ") || null,
      paymentTermsDays: r["Payment Terms"] !== "" && Number.isFinite(Number(r["Payment Terms"])) ? Number(r["Payment Terms"]) : null,
      creditLimit: laari(r["Credit Limit"]) || null,
      active: !/inactive/i.test(r.Status || ""),
    };
  };
  const orderLines = (ls, qtyKey) =>
    ls.map((l, i) => ({
      position: i,
      description: l["Item Name"] || l["Item Desc"] || l.Description || "Item",
      account: l.Account || null,
      quantity: String(Number(l[qtyKey] || l.Quantity || 1) || 1),
      unit: l["Usage unit"] || null,
      unitPrice: laari(l["Item Price"] || l.Rate || "0"),
    }));
  const records = {
    contacts: [...get("Contacts.csv").map((r) => contact(r, "customer")), ...get("Vendors.csv").map((r) => contact(r, "supplier"))],
    quotes: [...group(get("Estimate.csv"), "Estimate ID").values()].map((ls) => {
      const h = ls[0];
      const st = String(h["Estimate Status"] || "").toLowerCase();
      return {
        key: `estimate|${h["Estimate ID"]}`, number: h["Estimate Number"], date: h["Estimate Date"], validUntil: h["Expiry Date"] || null,
        party: h["Customer Name"], status: /accept|invoic/.test(st) ? "accepted" : /declin/.test(st) ? "declined" : st,
        note: [h.Notes, h["Terms & Conditions"]].filter(Boolean).join("\n\n"), lines: orderLines(ls, "Quantity"),
      };
    }),
    purchaseOrders: [...group(get("Purchase_Order.csv"), "Purchase Order ID").values()].map((ls) => {
      const h = ls[0];
      const st = String(h["Purchase Order Status"] || "").toLowerCase();
      return {
        key: `purchaseorder|${h["Purchase Order ID"]}`, number: h["Purchase Order Number"], date: h["Purchase Order Date"], expectedOn: h["Delivery Date"] || null,
        party: h["Vendor Name"], status: st, note: [h["Delivery Instructions"], h["Terms & Conditions"]].filter(Boolean).join("\n\n"), lines: orderLines(ls, "QuantityOrdered"),
      };
    }),
    tags: [...new Set([...billTags, ...expenseTags, ...journalTags])],
    // The documents themselves, as the books already hold them: each one is
    // filed against the entry its own transaction became (same key).
    invoices: [...group(get("Invoice.csv"), "Invoice ID")].filter(([, ls]) => !/draft|void/i.test(ls[0]["Invoice Status"])).map(([id, ls]) => {
      const h = ls[0];
      const cur = h["Currency Code"] || BASE;
      const rate = h["Exchange Rate"] || "1";
      const tax = ls.reduce((a, l) => a + laari(l["Item Tax Amount"]), 0n);
      const total = laari(h.Total);
      return {
        key: `invoice|${id}|${h["Invoice Date"]}`, number: h["Invoice Number"], date: h["Invoice Date"], due: h["Due Date"] || null,
        party: h["Customer Name"], purchaseOrder: h.PurchaseOrder || null, subject: h.Subject || null, currency: cur, rate: String(Number(rate)),
        gross: inBase(total, cur, rate), tax: inBase(tax, cur, rate), fcGross: cur === BASE ? null : total, fcTax: cur === BASE ? null : tax,
        lines: ls.map((l, i) => ({ position: i, description: [l["Item Name"], l["Item Desc"]].filter(Boolean).join(": ") || "Item", quantity: String(Number(l.Quantity || 1) || 1), unitPrice: laari(l["Item Price"]), net: laari(l["Item Total"]), tax: laari(l["Item Tax Amount"]) })),
      };
    }),
    bills: [...group(get("Bill.csv"), "Bill ID")].filter(([, ls]) => !/draft|void/i.test(ls[0]["Bill Status"])).map(([id, ls]) => {
      const h = ls[0];
      const cur = h["Currency Code"] || BASE;
      const rate = h["Exchange Rate"] || "1";
      const tax = ls.reduce((a, l) => a + laari(l["Tax Amount"]), 0n);
      const total = laari(h.Total);
      return {
        key: `bill|${id}|${h["Bill Date"]}`, zohoId: id, number: h["Bill Number"] || null, date: h["Bill Date"], due: h["Due Date"] || null,
        party: h["Vendor Name"], currency: cur, rate: String(Number(rate)), taxBp: Number(ls.find((l) => l["Tax Percentage"])?.["Tax Percentage"] || 0) * 100 || null,
        gross: inBase(total, cur, rate), tax: inBase(tax, cur, rate), fcGross: cur === BASE ? null : total, fcTax: cur === BASE ? null : tax,
        lines: ls.map((l, i) => ({ position: i, description: [l["Item Name"], l.Description].filter(Boolean).join(": ") || l.Account || "Item", quantity: String(Number(l.Quantity || 1) || 1), unitPrice: laari(l.Rate), net: laari(l["Item Total"]), tax: laari(l["Tax Amount"]) })),
      };
    }),
    // Payments Zoho holds only as drafts or voided, by the key an earlier import may have posted them under.
    notPosted: [["Customer_Payment.csv", "CustomerPayment ID", "customer_payment"], ["Vendor_Payment.csv", "VendorPayment ID", "vendor_payment"]].flatMap(([file, idCol, type]) =>
      [...group(get(file), idCol)].filter(([, ls]) => /draft|void/i.test(ls[0]["Payment Status"] || "")).map(([id, ls]) => `${type}|${id}|${ls[0].Date}`)
    ),
    customerPayments: paid("Customer_Payment.csv", "CustomerPayment ID").map(([id, ls]) => {
      const h = ls[0];
      const cur = h["Currency Code"] || BASE;
      const rate = h["Exchange Rate"] || "1";
      const amount = laari(h.Amount);
      return {
        key: `customer_payment|${id}|${h.Date}`, number: h["Payment Number"], date: h.Date, party: h["Customer Name"], account: h["Deposit To"], reference: h["Reference Number"] || null,
        currency: cur, rate: String(Number(rate)), amount: inBase(amount, cur, rate), fcAmount: cur === BASE ? null : amount,
        applied: ls.filter((a) => laari(a["Amount Applied to Invoice"]) > 0n).map((a) => {
          const inv = invoiceRate.get(a["Invoice Number"]) || { cur, rate };
          return { invoice: a["Invoice Number"], amount: inBase(laari(a["Amount Applied to Invoice"]), inv.cur, inv.rate) };
        }),
      };
    }),
    vendorPayments: paid("Vendor_Payment.csv", "VendorPayment ID").map(([id, ls]) => {
      const h = ls[0];
      const cur = h["Currency Code"] || BASE;
      const rate = h["Exchange Rate"] || "1";
      let toApply = laari(h.Amount) - laari(h["Unused Amount"]) - laari(h["Bank Charges"]);
      const applied = [];
      for (const a of ls) {
        let amt = laari(a["Bill Amount"]);
        if (amt > toApply) amt = toApply;
        if (amt <= 0n) continue;
        toApply -= amt;
        const b = billRate.get(a["Bill ID"]) || { cur, rate };
        applied.push({ bill: a["Bill ID"], amount: inBase(amt, b.cur, b.rate) });
      }
      return { key: `vendor_payment|${id}|${h.Date}`, number: h["Payment Number"], date: h.Date, party: h["Vendor Name"], account: h["Paid Through"], reference: h["Reference Number"] || null, applied };
    }),
    projects: get("Projects.csv").map((p) => ({ name: p["Project Name"], customer: p["Customer Name"] || null, contract: laari(p["Project Cost"]) || null, budget: laari(p["Budget Amount"] || p["Cost Budget"]) || null })),
  };
  // Two documents Zoho gave the same key (it happens with references): each keeps its own, numbered.
  const seen = new Map();
  for (const t of out) {
    const n = (seen.get(t.key) || 0) + 1;
    seen.set(t.key, n);
    if (n > 1) t.key = `${t.key}#${n}`;
  }
  return {
    transactions: out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    types,
    problems,
    balances,
    records,
    contacts: { customers: counted("Contacts.csv"), suppliers: counted("Vendors.csv") },
    notBroughtIn: Object.fromEntries(
      ["Item.csv", "Activity Logs.csv", "Credit_Note.csv", "Vendor_Credits.csv", "Fixed_Asset.csv", "Recurring_Invoice.csv", "Sales_Order.csv"].map((n) => [n.replace(".csv", ""), counted(n)]).filter(([, n]) => n > 0)
    ),
  };
}

/** What a Zoho account type is here, for accounts the books do not have yet. */
function kindOf(zohoType) {
  const t = String(zohoType || "").toLowerCase();
  if (/income/.test(t)) return "income";
  if (/expense|cost of goods/.test(t)) return "expense";
  if (/equity/.test(t)) return "equity";
  if (/liabilit|payable|credit card/.test(t)) return "liability";
  return "asset";
}

module.exports = { convert, kindOf, laari, GST_IN, GST_OUT, AR, AP };

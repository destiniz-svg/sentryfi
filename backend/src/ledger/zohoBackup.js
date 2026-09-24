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

  // ---- customer payments
  for (const [id, ls] of group(get("Customer_Payment.csv"), "CustomerPayment ID")) {
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
  for (const [id, ls] of group(get("Bill.csv"), "Bill ID")) {
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
      lines.push(line(l.Account, inBase(net, cur, rate), "debit", { memo: l["Item Name"] || l.Description || null }));
      lines.push(line(GST_IN, inBase(tax, cur, rate), "debit"));
    }
    const extra = laari(h.Adjustment) - laari(h["Entity Discount Amount"]);
    lines.push(line(OTHER, inBase(extra, cur, rate), "debit", { memo: h["Adjustment Description"] || "Adjustment" }));
    if (sum + extra !== total) problems.push(`Bill ${h["Bill Number"]}: its lines do not add up to its total`);
    push({ key: `bill|${id}|${h["Bill Date"]}`, date: h["Bill Date"], type: "Bill", theirId: h["Bill Number"], memo: h["Vendor Name"], lines });
  }

  // ---- vendor payments
  for (const [id, ls] of group(get("Vendor_Payment.csv"), "VendorPayment ID")) {
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
  for (const [id, ls] of group(get("Expense.csv"), "Expense Reference ID")) {
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
      lines.push(line(l["Expense Account"], inBase(net, cur, rate), "debit", { memo: l["Expense Description"] || l.Vendor || null }));
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
  for (const [id, ls] of group(get("Journal.csv"), "Journal ID")) {
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
      lines.push(line(l.Account, inBase(amt, cur, rate), debit ? "debit" : "credit", { ...party, ...fcOn(l.Account, cur, amt, rate), memo: l.Description || null }));
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
    contacts: { customers: counted("Contacts.csv"), suppliers: counted("Vendors.csv") },
    notBroughtIn: Object.fromEntries(
      ["Estimate.csv", "Purchase_Order.csv", "Item.csv", "Projects.csv", "Activity Logs.csv", "Credit_Note.csv", "Vendor_Credits.csv", "Fixed_Asset.csv", "Recurring_Invoice.csv", "Sales_Order.csv"].map((n) => [n.replace(".csv", ""), counted(n)]).filter(([, n]) => n > 0)
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

const { formatLaari } = require("./money");
const { packFor, rateOn } = require("./tax");
const { today: localToday } = require("./today");

/**
 * The GST return, ready before the deadline.
 *
 * Built from the documents in the period, because the statements MIRA asks for
 * list documents, and then checked against the ledger, because the return must
 * agree with the books. If the two disagree the return is wrong somewhere and
 * it says so instead of picking one.
 *
 * Three kinds of finding, kept apart on purpose:
 *   - figures: what the return says, today;
 *   - problems: what would make the return wrong if it were filed now;
 *   - unfinished: what is not in the books yet and might belong in the period.
 *
 * The statement layouts are MIRA's own templates (v23.1), read from the files
 * MIRA publishes: the Input Tax Statement's twelve columns and the Output Tax
 * Statement's TaxInvoices and OtherTransactions sheets.
 * docs/real-world-samples/mira-statements.md records them.
 */

// The rate columns MIRA's Input Tax Statement v23.1 has. A rate that is not
// one of these cannot be put on the statement and is reported as a problem.
// 17% is tourism GST from 1 July 2025; its column follows 16% (to confirm
// against MIRA's current template, docs/domain/to-confirm.md).
const INPUT_RATE_COLUMNS = [600, 800, 1200, 1600, 1700];

const pad = (n) => String(n).padStart(2, "0");
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const niceDate = (iso) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * A period from its key: "2026-08" is August, "2026-Q3" is July to September.
 * Due by the pack's day of the month after the period ends.
 */
function period(key, { dueDay = 28, today = localToday() } = {}) {
  const m = /^(\d{4})-(?:(\d{2})|Q([1-4]))$/.exec(String(key || ""));
  if (!m) throw new Error("A period is a month (2026-08) or a quarter (2026-Q3).");
  const y = +m[1];
  const firstMonth = m[2] ? +m[2] : (+m[3] - 1) * 3 + 1;
  const lastMonth = m[2] ? firstMonth : firstMonth + 2;
  if (firstMonth < 1 || firstMonth > 12) throw new Error("There is no such month.");
  const from = `${y}-${pad(firstMonth)}-01`;
  const to = `${y}-${pad(lastMonth)}-${pad(lastDay(y, lastMonth))}`;
  const dueY = lastMonth === 12 ? y + 1 : y;
  const dueM = lastMonth === 12 ? 1 : lastMonth + 1;
  const due = dueDay ? `${dueY}-${pad(dueM)}-${pad(Math.min(dueDay, lastDay(dueY, dueM)))}` : null;
  const daysLeft = due ? Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000) : null;
  const label = m[2]
    ? new Date(from + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
    : `Q${m[3]} ${y}`;
  return { key, from, to, due, daysLeft, label, over: to < today };
}

/** The period most recently ended: the one whose return is due next. */
function currentKey(kind, today = localToday()) {
  const [y, mo] = today.split("-").map(Number);
  if (kind === "quarter") {
    const q = Math.floor((mo - 1) / 3); // the quarter before this one
    return q === 0 ? `${y - 1}-Q4` : `${y}-Q${q}`;
  }
  return mo === 1 ? `${y - 1}-12` : `${y}-${pad(mo - 1)}`;
}

/** The period still running, whose return is not due yet. */
function runningKey(kind, today = localToday()) {
  const [y, mo] = today.split("-").map(Number);
  return kind === "quarter" ? `${y}-Q${Math.floor((mo - 1) / 3) + 1}` : `${y}-${pad(mo)}`;
}

/** The recent periods, newest first, for a picker. */
function recentKeys(kind, count = 12, today = localToday()) {
  const keys = [];
  let key = currentKey(kind, today);
  for (let i = 0; i < count; i += 1) {
    keys.push(key);
    const p = period(key);
    const before = new Date(Date.parse(p.from) - 86_400_000).toISOString().slice(0, 10);
    const [y, mo] = before.split("-").map(Number);
    key = kind === "quarter" ? `${y}-Q${Math.floor((mo - 1) / 3) + 1}` : `${y}-${pad(mo)}`;
  }
  return keys;
}

async function build(client, { companyId, key }) {
  const pack = await packFor(client, { companyId });
  const { rows: co } = await client.query(
    "SELECT name, tin, gst_number, gst_period, trim(base_currency) AS currency FROM companies WHERE id = $1",
    [companyId]
  );
  const company = co[0];
  const p = period(key || currentKey(company.gst_period), { dueDay: pack.filing.dueDay });

  // What went in: every bill entry dated in the period that claimed GST, and
  // every reversal of one, as a negative line in the period of the reversal.
  // Read from the journal rather than from bill status, so a bill reversed in
  // a later month stays claimed in its own month and comes back out in the
  // later one, exactly as the books have it.
  const { rows: bills } = await client.query(
    `WITH claims AS (
       SELECT e.id AS entry_id, e.entry_date, e.source_id AS bill_id, 1 AS sign FROM journal_entries e
        WHERE e.company_id = $1 AND e.source = 'bill' AND e.entry_date BETWEEN $2 AND $3
       UNION ALL
       SELECT o.id, r.entry_date, o.source_id, -1 FROM journal_entries r
         JOIN journal_entries o ON o.id = r.reverses_id AND o.source = 'bill'
        WHERE r.company_id = $1 AND r.entry_date BETWEEN $2 AND $3)
     SELECT b.id, b.bill_no, k.entry_date::text AS dated, k.sign,
            b.net_laari, b.tax_laari, b.gst_rate_bp, b.gst_treatment::text AS treatment,
            c.name AS supplier, COALESCE(c.tin, c.gst_number) AS tin,
            EXISTS (SELECT 1 FROM journal_lines l JOIN accounts a ON a.id = l.account_id
                     WHERE l.entry_id = k.entry_id AND l.debit_laari > 0
                       AND a.type = 'asset' AND a.code <> '1400') AS capital
       FROM claims k JOIN bills b ON b.id = k.bill_id
       LEFT JOIN counterparties c ON c.id = b.counterparty_id
      WHERE b.tax_laari > 0
      ORDER BY k.entry_date, b.bill_no`,
    [companyId, p.from, p.to]
  );

  // GST paid at Customs on an import (shipments.payDirect), and any reversal of
  // it. Not a bill, so the query above cannot see it, but it is input tax all
  // the same: on the statement it is a line from Customs, the shipment's
  // reference its document. Found by the line's own words, which the journal
  // keeps unchanged, so imports posted before this was read are found too.
  const { rows: customs } = await client.query(
    `SELECT e.id, e.entry_date::text AS dated, split_part(l.memo, ': GST paid at Customs', 1) AS ref,
            SUM(l.debit_laari - l.credit_laari) AS tax
       FROM journal_lines l
       JOIN journal_entries e ON e.id = l.entry_id
       JOIN accounts a ON a.id = l.account_id AND a.code = '1400'
      WHERE l.company_id = $1 AND e.source <> 'bill' AND e.entry_date BETWEEN $2 AND $3
        AND l.memo LIKE '%: GST paid at Customs'
      GROUP BY e.id, e.entry_date, l.memo
      ORDER BY e.entry_date`,
    [companyId, p.from, p.to]
  );
  // ponytail: the value before GST is worked back from the GST at the general
  // rate, not read from the Customs declaration, so it can differ by a laari
  // or two; store the declared value on payDirect if MIRA ever queries it.
  for (const c of customs) {
    const tax = BigInt(c.tax);
    if (tax === 0n) continue;
    const { bp } = await rateOn(client, { companyId, on: c.dated });
    const abs = tax < 0n ? -tax : tax;
    bills.push({
      id: null, customs: true, bill_no: c.ref, dated: c.dated, sign: tax < 0n ? -1 : 1,
      tax_laari: abs.toString(), net_laari: ((abs * 10000n + BigInt(bp) / 2n) / BigInt(bp)).toString(),
      gst_rate_bp: bp, treatment: "exclusive", supplier: "Maldives Customs Service", tin: null, capital: false,
    });
  }
  // Goods or charges sent back to a supplier: the GST claimed on them comes back off, in the month they went back.
  const { rows: back } = await client.query(
    `SELECT r.bill_id, r.number, r.issue_date::text AS dated, r.net_laari, r.tax_laari, b.gst_rate_bp, b.gst_treatment::text AS treatment,
            c.name AS supplier, COALESCE(c.tin, c.gst_number) AS tin
       FROM supplier_returns r JOIN bills b ON b.id = r.bill_id LEFT JOIN counterparties c ON c.id = r.counterparty_id
      WHERE r.company_id = $1 AND r.tax_laari > 0 AND r.issue_date BETWEEN $2 AND $3`,
    [companyId, p.from, p.to]
  );
  for (const r of back) bills.push({ id: r.bill_id, bill_no: r.number, dated: r.dated, sign: -1, net_laari: r.net_laari, tax_laari: r.tax_laari, gst_rate_bp: r.gst_rate_bp, treatment: r.treatment, supplier: r.supplier, tin: r.tin, capital: false });
  bills.sort((a, b) => (a.dated < b.dated ? -1 : a.dated > b.dated ? 1 : 0));

  // What went out: posted invoices in the period, and credit notes against them.
  const { rows: invoices } = await client.query(
    `SELECT s.invoice_no AS no, s.issue_date::text AS dated, s.net_laari, s.tax_laari,
            s.gst_treatment::text AS treatment, c.name AS customer, COALESCE(c.tin, c.gst_number) AS tin, 1 AS sign
       FROM sales_invoices s LEFT JOIN counterparties c ON c.id = s.counterparty_id
      WHERE s.company_id = $1 AND s.status = 'posted' AND s.voided_at IS NULL AND NOT s.opening
        AND s.issue_date BETWEEN $2 AND $3
     UNION ALL
     SELECT n.note_no, n.issue_date::text, n.net_laari, n.tax_laari,
            s.gst_treatment::text, c.name, COALESCE(c.tin, c.gst_number), -1
       FROM credit_notes n JOIN sales_invoices s ON s.id = n.invoice_id
       LEFT JOIN counterparties c ON c.id = n.counterparty_id
      WHERE n.company_id = $1 AND n.issue_date BETWEEN $2 AND $3
     UNION ALL
     -- Paid in advance: GST is due when the money arrives (time of supply),
     -- and comes back off when the advance is used on a tax invoice or given back.
     SELECT COALESCE(q.number, 'Advance ' || to_char(a.received_on, 'YYYY-MM-DD')), a.received_on::text, a.amount_laari - a.tax_laari, a.tax_laari,
            'inclusive', c.name, COALESCE(c.tin, c.gst_number), 1
       FROM customer_advances a LEFT JOIN advance_requests q ON q.id = a.request_id LEFT JOIN counterparties c ON c.id = a.counterparty_id
      WHERE a.company_id = $1 AND a.tax_laari > 0 AND a.received_on BETWEEN $2 AND $3
     UNION ALL
     SELECT CASE WHEN u.kind = 'invoice' THEN 'Advance used on ' || s.invoice_no ELSE 'Advance given back' END, u.used_on::text,
            u.amount_laari - u.tax_laari, u.tax_laari, 'inclusive', c.name, COALESCE(c.tin, c.gst_number), -1
       FROM advance_uses u JOIN customer_advances a ON a.id = u.advance_id LEFT JOIN sales_invoices s ON s.id = u.invoice_id
       LEFT JOIN counterparties c ON c.id = a.counterparty_id
      WHERE u.company_id = $1 AND u.tax_laari > 0 AND u.used_on BETWEEN $2 AND $3
      ORDER BY 2, 1`,
    [companyId, p.from, p.to]
  );

  // The same two figures from the ledger, to prove the documents are all of it.
  const { rows: led } = await client.query(
    `SELECT COALESCE(SUM(CASE WHEN a.code = '2200' THEN l.credit_laari - l.debit_laari END), 0) AS output,
            COALESCE(SUM(CASE WHEN a.code = '1400' THEN l.debit_laari - l.credit_laari END), 0) AS input
       FROM journal_lines l
       JOIN journal_entries e ON e.id = l.entry_id
       JOIN accounts a ON a.id = l.account_id
      WHERE l.company_id = $1 AND e.entry_date BETWEEN $2 AND $3 AND a.code IN ('2200','1400')`,
    [companyId, p.from, p.to]
  );

  const sum = (list, f) => list.reduce((s, r) => s + f(r), 0n);
  const signed = (r, v) => BigInt(v) * BigInt(r.sign);
  const out = {
    standard: sum(invoices.filter((r) => ["inclusive", "exclusive"].includes(r.treatment)), (r) => signed(r, r.net_laari)),
    zeroRated: sum(invoices.filter((r) => r.treatment === "zero_rated"), (r) => signed(r, r.net_laari)),
    exempt: sum(invoices.filter((r) => r.treatment === "exempt"), (r) => signed(r, r.net_laari)),
    tax: sum(invoices, (r) => signed(r, r.tax_laari)),
  };
  const inp = { value: sum(bills, (r) => signed(r, r.net_laari)), tax: sum(bills, (r) => signed(r, r.tax_laari)) };
  const ledger = { output: BigInt(led[0].output), input: BigInt(led[0].input) };

  // ---- what would make it wrong ------------------------------------------
  // In the pack's own words: GST and MIRA in the Maldives, VAT and the FTA in the UAE.
  const W = pack.words;
  const cur = company.currency || pack.currency || "";
  const problems = [];
  if (!company.gst_number) {
    problems.push({
      what: pack.statements ? "No taxable activity number" : `No ${W.registration}`,
      detail: pack.statements
        ? "Both statements need it on every line. It is the GST number on your registration, like 1145053GST501. Set it in Settings, Tax."
        : `The return and every tax invoice need your ${W.registration}. Set it in Settings, Tax.`,
      href: "/settings?tab=tax",
    });
  }
  // One item for all of them, naming the suppliers: a list that grows by one
  // line per bill buries everything under it.
  const noTin = bills.filter((r) => r.sign > 0 && !r.tin && !r.customs);
  if (noTin.length) {
    const who = [...new Set(noTin.map((b) => b.supplier || "an unnamed supplier"))];
    problems.push({
      what: noTin.length === 1 ? `${who[0]} has no ${W.taxId}` : `${noTin.length} bills claim ${W.tax} from suppliers with no ${W.taxId}`,
      detail:
        `${cur} ${formatLaari(sum(noTin, (b) => BigInt(b.tax_laari)))} of ${W.tax} claimed from ${who.slice(0, 5).join(", ")}${who.length > 5 ? ` and ${who.length - 5} more` : ""}. ` +
        `A claim needs the supplier's ${W.taxId}. Add it, or the claim can be refused.`,
      href: "/bills",
    });
  }
  for (const b of pack.inputRateColumns ? bills.filter((r) => r.sign > 0 && !pack.inputRateColumns.includes(r.gst_rate_bp)) : []) {
    problems.push({
      what: `Bill ${b.bill_no || ""} at ${b.gst_rate_bp / 100}%`,
      detail: "MIRA's Input Tax Statement has columns for 6, 8, 12, 16 and 17% only. Check the rate on the paper.",
      href: "/bills",
    });
  }
  if (ledger.output !== out.tax) {
    problems.push({
      what: "Output tax in the books does not match the invoices",
      detail: `The books say ${cur} ${formatLaari(ledger.output)} owed for these dates; the invoices and credit notes say ${cur} ${formatLaari(out.tax)}. An entry against ${W.tax} owed was made by hand or dated differently. Find it before filing.`,
      href: "/statements",
    });
  }
  if (ledger.input !== inp.tax) {
    problems.push({
      what: "Input tax in the books does not match the bills",
      detail: `The books say ${cur} ${formatLaari(ledger.input)} claimable for these dates; the bills say ${cur} ${formatLaari(inp.tax)}. Find the difference before filing.`,
      href: "/statements",
    });
  }

  // ---- what is not finished ------------------------------------------------
  const { rows: u } = await client.query(
    `SELECT
       (SELECT count(*) FROM bills WHERE company_id = $1 AND voided_at IS NULL AND status IN ('draft','awaiting_review')
          AND COALESCE(issue_date, received_at::date) BETWEEN $2 AND $3)::int AS bills,
       (SELECT count(*) FROM bills WHERE company_id = $1 AND voided_at IS NULL AND status <> 'discarded'
          AND gst_treatment = 'unknown' AND COALESCE(issue_date, received_at::date) BETWEEN $2 AND $3)::int AS undecided,
       (SELECT count(*) FROM sales_invoices WHERE company_id = $1 AND voided_at IS NULL AND status = 'draft'
          AND issue_date BETWEEN $2 AND $3)::int AS invoices,
       (SELECT count(*) FROM bank_statement_lines WHERE company_id = $1 AND status = 'open'
          AND debit_laari + credit_laari > 0 AND posted_on BETWEEN $2 AND $3)::int AS bank`,
    [companyId, p.from, p.to]
  );
  const n = u[0];
  const unfinished = [
    n.undecided && { what: `${n.undecided} ${n.undecided === 1 ? "bill says" : "bills say"} nothing about how ${W.tax} was quoted`, href: "/bills" },
    n.bills && { what: `${n.bills} ${n.bills === 1 ? "bill is" : "bills are"} recorded but not in the books`, href: "/bills" },
    n.invoices && { what: `${n.invoices} invoice ${n.invoices === 1 ? "draft" : "drafts"} dated in the period`, href: "/invoices" },
    n.bank && { what: `${n.bank} bank ${n.bank === 1 ? "line" : "lines"} in the period the books do not explain`, href: "/bank" },
  ].filter(Boolean);

  const { rows: filed } = await client.query(
    `SELECT f.reference, f.filed_at, f.output_laari, f.input_laari, u.name AS who
       FROM gst_filings f LEFT JOIN users u ON u.id = f.filed_by
      WHERE f.company_id = $1 AND f.period_key = $2`,
    [companyId, p.key]
  );

  // Filed, and the books have moved since: what was filed is no longer what the
  // books say, which needs an amended return or an explanation.
  const was = filed[0];
  if (was && (BigInt(was.output_laari) !== out.tax || BigInt(was.input_laari) !== inp.tax)) {
    problems.push({
      what: "The books changed after this return was filed",
      detail: `Filed with output tax ${cur} ${formatLaari(BigInt(was.output_laari))} and input tax ${cur} ${formatLaari(BigInt(was.input_laari))}; the books now say ${cur} ${formatLaari(out.tax)} and ${cur} ${formatLaari(inp.tax)}. That needs an amended return or a correction in a later period.`,
      href: "/closing",
    });
  }

  return { company, pack, period: p, bills, invoices, out, inp, ledger, problems, unfinished, filed: was || null };
}

/** The Input Tax Statement, exactly as MIRA's template lays it out. */
function inputRows(r) {
  const head = [
    "#", "Supplier TIN", "Supplier Name", "Supplier Invoice Number", "Invoice Date",
    "Invoice Total (excluding GST)", "GST Charged at 6%", "GST Charged at 8%", "GST Charged at 12%",
    "GST Charged at 16%", "GST Charged at 17%", "Your Taxable Activity Number", "Revenue / Capital",
  ];
  const money = (v, sign = 1) => Number(formatLaari(BigInt(v) * BigInt(sign), { withGrouping: false }));
  return [
    head,
    ...r.bills.map((b, i) => {
      const at = (bp) => (b.gst_rate_bp === bp ? money(b.tax_laari, b.sign) : null);
      return [
        i + 1, b.tin || "", b.supplier || "", b.bill_no || "", b.dated, money(b.net_laari, b.sign),
        at(600), at(800), at(1200), at(1600), at(1700), r.company.gst_number || "", b.capital ? "Capital" : "Revenue",
      ];
    }),
  ];
}

/** The Output Tax Statement: tax invoices, and the other-transactions sheet. */
function outputSheets(r) {
  const money = (v, sign) => Number(formatLaari(BigInt(v) * BigInt(sign), { withGrouping: false }));
  const col = (row, t) => (row.treatment === t ? money(row.net_laari, row.sign) : null);
  return [
    {
      name: "TaxInvoices",
      rows: [
        [
          "Customer TIN", "Customer Name", "Invoice No.", "Invoice Date",
          "Value of Supplies Subject to GST at 8% or 16% (excluding GST)", "Value of Zero-Rated Supplies",
          "Value of Exempt Supplies", "Value of Out-of-Scope Supplies", "Your Taxable Activity No.",
        ],
        ...r.invoices.map((s) => [
          s.tin || "", s.customer || "", s.no, s.dated,
          ["inclusive", "exclusive"].includes(s.treatment) ? money(s.net_laari, s.sign) : null,
          col(s, "zero_rated"), col(s, "exempt"), null, r.company.gst_number || "",
        ]),
      ],
    },
    {
      name: "OtherTransactions",
      rows: [[
        "Your Taxable Activity No.", "Value of Supplies Subject to GST at 8% or 16% (excluding GST)",
        "Value of Zero-Rated Supplies", "Value of Exempt Supplies", "Value of Out-of-Scope Supplies",
      ]],
    },
  ];
}

/** The figures a person keys into the return, in the form the pack's authority uses. */
function figures(r) {
  const f = (v) => formatLaari(v);
  const net = r.out.tax - r.inp.tax;
  if (r.pack.form === "vat201") {
    // The UAE's VAT 201, box by box. Every sale is put in the company's own emirate (box 1).
    return [
      { label: "Box 1: Standard-rated supplies, amount", amount: f(r.out.standard) },
      { label: "Box 1: Standard-rated supplies, VAT", amount: f(r.out.tax) },
      { label: "Box 4: Zero-rated supplies", amount: f(r.out.zeroRated) },
      { label: "Box 5: Exempt supplies", amount: f(r.out.exempt) },
      { label: "Box 9: Standard-rated expenses, amount", amount: f(r.inp.value) },
      { label: "Box 9: Standard-rated expenses, recoverable VAT", amount: f(r.inp.tax) },
      { label: "Box 12: Total value of due tax", amount: f(r.out.tax), strong: true },
      { label: "Box 13: Total value of recoverable tax", amount: f(r.inp.tax), strong: true },
      { label: net < 0n ? "Box 14: Payable tax for the period (repayable)" : "Box 14: Payable tax for the period", amount: f(net < 0n ? -net : net), strong: true, total: true },
    ];
  }
  const t = r.pack.words.tax;
  if (r.pack.form === "generic")
    return [
      { label: `Sales with ${t}, before ${t}`, amount: f(r.out.standard) },
      { label: `${t} charged`, amount: f(r.out.tax), strong: true },
      { label: `Purchases with ${t}, before ${t}`, amount: f(r.inp.value) },
      { label: `${t} paid and claimable`, amount: f(r.inp.tax), strong: true },
      { label: net < 0n ? "Refundable" : "Payable", amount: f(net < 0n ? -net : net), strong: true, total: true },
    ];
  return [
    { label: "Standard-rated supplies, excluding GST", amount: f(r.out.standard) },
    { label: "Zero-rated supplies", amount: f(r.out.zeroRated) },
    { label: "Exempt supplies", amount: f(r.out.exempt) },
    { label: "Output tax", amount: f(r.out.tax), strong: true },
    { label: "Taxable purchases, excluding GST", amount: f(r.inp.value) },
    { label: "Input tax claimed", amount: f(r.inp.tax), strong: true },
    { label: r.out.tax - r.inp.tax < 0n ? "Refundable" : "Payable", amount: f(r.out.tax - r.inp.tax < 0n ? r.inp.tax - r.out.tax : r.out.tax - r.inp.tax), strong: true, total: true },
  ];
}

async function markFiled(client, { companyId, userId, key, reference }) {
  const r = await build(client, { companyId, key });
  if (!r.period.over) throw new Error("That period is not over yet.");
  const { rows } = await client.query(
    `INSERT INTO gst_filings (company_id, period_key, period_from, period_to, output_laari, input_laari, reference, filed_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (company_id, period_key) DO NOTHING RETURNING id`,
    [companyId, r.period.key, r.period.from, r.period.to, r.out.tax.toString(), r.inp.tax.toString(), String(reference || "").trim() || null, userId]
  );
  if (!rows.length) throw new Error(`${r.period.label} is already marked as filed.`);
  return { filed: true };
}

module.exports = { period, currentKey, runningKey, recentKeys, build, inputRows, outputSheets, figures, markFiled, niceDate, INPUT_RATE_COLUMNS };

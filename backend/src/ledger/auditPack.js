/**
 * The audit pack: one download for a period, in the forms audit software
 * takes in, each file fingerprinted in a manifest.
 *
 * The general ledger follows the AICPA Audit Data Standards (GL detail), so
 * journal-entry testing tools read it as it is: each line with the date it is
 * for and the date and time it was entered, who entered it, where it came
 * from, and a debit/credit sign. Balances are as at the period's last day.
 *
 * Every pack made is kept on record with its fingerprint, so what was handed
 * to the auditor can be shown later, byte for byte.
 */
const crypto = require("crypto");
const { formatLaari } = require("./money");
const statements = require("./statements");
const stock = require("./stock");
const audit = require("./audit");
const risk = require("./auditRisk");
const { zip } = require("../utils/zip");

// Papers for the sampled items are included up to this much in all; beyond it they are listed.
const PAPERS_CAP = 60 * 1024 * 1024;
const MANUAL = new Set(["adjustment", "import", "opening_balance", "intercompany", "company"]);

const plain = (laari) => formatLaari(BigInt(laari || 0), { withGrouping: false });
/** A cell a spreadsheet will not run: a leading = + - @ is kept as text. Numbers pass as they are. */
function cell(v) {
  if (v === null || v === undefined) return "";
  let t = String(v);
  if (typeof v !== "number" && !/^-?\d+(\.\d+)?$/.test(t) && /^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
const csv = (head, rows) => "﻿" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
const dayBefore = (day) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 864e5);
const bucket = (late) => (late <= 0 ? "Not yet due" : late <= 30 ? "1-30 days" : late <= 60 ? "31-60 days" : late <= 90 ? "61-90 days" : "Over 90 days");

async function trialBalance(client, { companyId, from, to }) {
  const opening = new Map((await statements.totals(client, { companyId, asAt: dayBefore(from) })).map((r) => [r.id, r.debit - r.credit]));
  const moved = await statements.totals(client, { companyId, asAt: to, from });
  const rows = [];
  let d = 0n;
  let c = 0n;
  for (const r of moved) {
    const open = opening.get(r.id) || 0n;
    const close = open + r.debit - r.credit;
    if (open === 0n && r.debit === 0n && r.credit === 0n) continue;
    rows.push([r.code, r.name, r.type, plain(open), plain(r.debit), plain(r.credit), plain(close > 0n ? close : 0n), plain(close < 0n ? -close : 0n)]);
    if (close > 0n) d += close;
    else c -= close;
  }
  rows.push(["", "Total", "", "", "", "", plain(d), plain(c)]);
  return { file: csv(["Account_Code", "Account_Name", "Account_Type", "Opening_Balance", "Period_Debits", "Period_Credits", "Closing_Debit", "Closing_Credit"], rows), balanced: d === c };
}

async function generalLedger(client, { companyId, from, to, currency }) {
  const { rows } = await client.query(
    `SELECT e.entry_no::text AS entry_no, l.position, e.entry_date::text AS effective,
            to_char(e.posted_at AT TIME ZONE 'Indian/Maldives', 'YYYY-MM-DD') AS entered_date,
            to_char(e.posted_at AT TIME ZONE 'Indian/Maldives', 'HH24:MI:SS') AS entered_time,
            u.name AS entered_by, e.posted_by, e.source::text AS source, e.source_id, e.narrative, o.entry_no::text AS reverses,
            a.code, a.name AS account, l.debit_laari, l.credit_laari, l.memo, cp.name AS party
       FROM journal_lines l
       JOIN journal_entries e ON e.id = l.entry_id
       JOIN accounts a ON a.id = l.account_id
       JOIN users u ON u.id = e.posted_by
       LEFT JOIN journal_entries o ON o.id = e.reverses_id
       LEFT JOIN counterparties cp ON cp.id = l.counterparty_id
      WHERE l.company_id = $1 AND e.entry_date BETWEEN $2 AND $3
      ORDER BY e.entry_no, l.position`,
    [companyId, from, to]
  );
  const out = rows.map((r) => {
    const debit = BigInt(r.debit_laari);
    const credit = BigInt(r.credit_laari);
    return [
      r.entry_no, r.position + 1, r.effective, r.entered_date, r.entered_time, r.entered_by, r.posted_by, r.source,
      MANUAL.has(r.source) && !r.source_id ? "Y" : "N", r.narrative, r.code, r.account,
      plain(debit > 0n ? debit : -credit), debit > 0n ? "D" : "C", currency, r.memo, r.party, r.reverses,
    ];
  });
  return csv(
    ["Journal_ID", "JE_Line_Number", "Effective_Date", "Entered_Date", "Entered_Time", "Entered_By", "Entered_By_ID", "Source", "Manual_Entry", "JE_Header_Description", "GL_Account_Number", "GL_Account_Name", "Amount", "Amount_Credit_Debit_Indicator", "Amount_Currency", "JE_Line_Description", "Business_Unit_Party", "Reverses_Journal_ID"],
    out
  );
}

async function accounts(client, { companyId }) {
  const { rows } = await client.query("SELECT code, name, type::text AS type, archived_at FROM accounts WHERE company_id = $1 ORDER BY code", [companyId]);
  return csv(["GL_Account_Number", "GL_Account_Name", "Account_Type", "Archived"], rows.map((r) => [r.code, r.name, r.type, r.archived_at ? "Y" : "N"]));
}

/** What customers owed, and what was owed to suppliers, at the end of the day `to`, by how late. */
async function ageing(client, { companyId, to }) {
  const { rows: ar } = await client.query(
    `SELECT c.name AS party, i.invoice_no AS no, i.issue_date::text AS day, COALESCE(i.due_date, i.issue_date)::text AS due, i.gross_laari AS gross,
            COALESCE((SELECT SUM(a.amount_laari) FROM receipt_allocations a JOIN receipts r ON r.id = a.receipt_id AND r.voided_at IS NULL WHERE a.invoice_id = i.id AND r.received_on <= $2), 0) AS paid,
            COALESCE((SELECT SUM(n.gross_laari) FROM credit_notes n WHERE n.invoice_id = i.id AND n.issue_date <= $2), 0) AS credited
       FROM sales_invoices i LEFT JOIN counterparties c ON c.id = i.counterparty_id
      WHERE i.company_id = $1 AND i.entry_id IS NOT NULL AND i.voided_at IS NULL AND i.issue_date <= $2`,
    [companyId, to]
  );
  const { rows: ap } = await client.query(
    `SELECT c.name AS party, b.bill_no AS no, COALESCE(b.issue_date, b.received_at::date)::text AS day, COALESCE(b.due_date, b.issue_date, b.received_at::date)::text AS due, b.gross_laari AS gross,
            COALESCE((SELECT SUM(p.amount_laari) FROM payment_items p JOIN payment_runs r ON r.id = p.run_id AND r.reversed_at IS NULL WHERE p.bill_id = b.id AND r.paid_on <= $2), 0) AS paid,
            0 AS credited
       FROM bills b LEFT JOIN counterparties c ON c.id = b.counterparty_id
      WHERE b.company_id = $1 AND b.entry_id IS NOT NULL AND b.voided_at IS NULL AND COALESCE(b.issue_date, b.received_at::date) <= $2`,
    [companyId, to]
  );
  const shape = (rows) => {
    const open = rows
      .map((r) => ({ ...r, open: BigInt(r.gross) - BigInt(r.paid) - BigInt(r.credited) }))
      .filter((r) => r.open > 0n)
      .sort((a, b) => (a.party || "").localeCompare(b.party || "") || a.day.localeCompare(b.day));
    const total = open.reduce((s, r) => s + r.open, 0n);
    const lines = open.map((r) => {
      const late = daysBetween(r.due, to);
      return [r.party, r.no, r.day, r.due, plain(r.gross), plain(BigInt(r.paid) + BigInt(r.credited)), plain(r.open), Math.max(0, late), bucket(late)];
    });
    lines.push(["Total", "", "", "", "", "", plain(total), "", ""]);
    return { file: csv(["Party", "Document", "Date", "Due", "Amount", "Settled_By_Period_End", "Open_At_Period_End", "Days_Past_Due", "Ageing_Band"], lines), total };
  };
  return { receivables: shape(ar), payables: shape(ap) };
}

async function fixedAssets(client, { companyId, to }) {
  const { rows } = await client.query(
    `SELECT a.name, a.category, a.acquired_on::text AS acquired, a.cost_laari, a.residual_laari, a.method, a.life_months, a.rate_bp, a.disposed_on::text AS disposed,
            COALESCE((SELECT SUM(d.amount_laari) FROM asset_depreciation d WHERE d.asset_id = a.id AND d.month <= $2), 0) AS worn
       FROM fixed_assets a WHERE a.company_id = $1 AND a.acquired_on <= $2 ORDER BY a.acquired_on, a.name`,
    [companyId, to]
  );
  return csv(
    ["Asset", "Category", "Acquired", "Cost", "Residual_Value", "Method", "Life_Months", "Rate_Percent", "Accumulated_Depreciation_At_Period_End", "Book_Value_At_Period_End", "Disposed_On"],
    rows.map((r) => {
      const gone = r.disposed && r.disposed <= to;
      const book = gone ? 0n : BigInt(r.cost_laari) - BigInt(r.worn);
      return [r.name, r.category, r.acquired, plain(r.cost_laari), plain(r.residual_laari), r.method, r.life_months, r.rate_bp ? r.rate_bp / 100 : "", plain(r.worn), plain(book), r.disposed || ""];
    })
  );
}

async function stockByPlace(client, { companyId, from, to }) {
  const snap = await stock.snapshot(client, { companyId, on: to, from });
  const rows = [];
  for (const p of snap.places) for (const i of p.items) rows.push([p.name, i.name, i.quantity, i.unit, i.value.replace(/,/g, "")]);
  rows.push(["Total", "", "", "", snap.total.replace(/,/g, "")]);
  rows.push(["Stock account in the books", "", "", "", snap.books.replace(/,/g, "")]);
  return { file: csv(["Place", "Item", "Quantity", "Unit", "Value_At_Weighted_Average_Cost"], rows), agrees: snap.agrees };
}

async function bankRecs(client, { companyId, from, to }) {
  const { rows } = await client.query(
    `SELECT a.code, a.name, r.through::text AS through, r.statement_on::text AS statement_on, r.bank_laari, r.books_laari, r.open_lines, r.open_laari, u.name AS by
       FROM bank_reconciliations r JOIN accounts a ON a.id = r.account_id LEFT JOIN users u ON u.id = r.by_user
      WHERE r.company_id = $1 AND r.through BETWEEN $2 AND $3 ORDER BY r.through, a.code`,
    [companyId, from, to]
  );
  return csv(
    ["Account_Code", "Account", "Month_Closed_Through", "Statement_Date", "Bank_Balance", "Books_Balance", "Unexplained_Lines", "Unexplained_Amount", "Difference", "Closed_By"],
    rows.map((r) => [r.code, r.name, r.through, r.statement_on, plain(r.bank_laari), plain(r.books_laari), r.open_lines, plain(r.open_laari), plain(BigInt(r.bank_laari) - BigInt(r.books_laari)), r.by])
  );
}

async function gstReturns(client, { companyId, from, to }) {
  const { rows } = await client.query(
    `SELECT g.period_key, g.period_from::text AS pfrom, g.period_to::text AS pto, g.output_laari, g.input_laari, g.reference, g.filed_at, u.name AS by
       FROM gst_filings g LEFT JOIN users u ON u.id = g.filed_by
      WHERE g.company_id = $1 AND g.period_to >= $2 AND g.period_from <= $3 ORDER BY g.period_from`,
    [companyId, from, to]
  );
  return csv(
    ["Return", "From", "To", "Output_Tax", "Input_Tax", "Net_Payable", "Reference", "Filed_At", "Filed_By"],
    rows.map((r) => [r.period_key, r.pfrom, r.pto, plain(r.output_laari), plain(r.input_laari), plain(BigInt(r.output_laari) - BigInt(r.input_laari)), r.reference, new Date(r.filed_at).toISOString(), r.by])
  );
}

async function sampleRegister(client, { companyId, periodId }) {
  const p = await audit.period(client, { companyId, periodId });
  const { rows } = await client.query("SELECT id, seed, population_hash FROM audit_samples WHERE period_id = $1 AND company_id = $2", [periodId, companyId]);
  const extra = new Map(rows.map((r) => [r.id, r]));
  const lines = [];
  for (const s of p.samples) {
    const full = await audit.sample(client, { companyId, sampleId: s.id });
    for (const i of full.items) {
      lines.push([s.id, full.said, audit.NAMES[s.kind], s.population, s.populationValue ? s.populationValue.replace(/,/g, "") : "", extra.get(s.id).seed || "", extra.get(s.id).population_hash || "",
        i.no, i.on, i.party, i.amount.replace(/,/g, ""), i.why, i.changed || "", i.seen ? "Y" : "N", i.seen ? i.seen.by : "", i.seen ? new Date(i.seen.at).toISOString() : "", i.note]);
    }
  }
  return { file: csv(["Sample_ID", "Rule", "Kind", "Population_Count", "Population_Value", "Seed", "Population_Fingerprint", "Document", "Date", "Party", "Amount", "Why_Drawn", "Changed_Since", "Seen", "Seen_By", "Seen_At", "Note"], lines), samples: p.samples };
}

async function riskList(client, { companyId, from, to }) {
  const r = await risk.screen(client, { companyId, from, to });
  return csv(
    ["Journal_ID", "Effective_Date", "Entered_Date", "Entered_Time", "Entered_By", "Source", "Description", "Amount", "Score", "Signs"],
    r.entries.map((e) => [e.no, e.on, e.postedOn, e.postedAt, e.postedBy, e.source, e.narrative, e.amount.replace(/,/g, ""), e.score, e.flags.map((x) => x.said).join(" | ")])
  );
}

/** The papers behind the sampled items, as they were filed, up to the cap. */
async function papers(client, { companyId, periodId }) {
  const { rows } = await client.query(
    `SELECT DISTINCT a.id, a.filename, a.byte_size, b.bytes, i.doc_no, s.kind
       FROM audit_sample_items i JOIN audit_samples s ON s.id = i.sample_id
       JOIN attachments a ON a.company_id = i.company_id AND a.hidden_at IS NULL AND a.employee_id IS NULL AND a.comment_id IS NULL
            AND (a.bill_id = i.doc_id OR a.sales_invoice_id = i.doc_id OR a.credit_note_id = i.doc_id OR a.claim_id = i.doc_id OR a.entry_id = i.doc_id)
       JOIN attachment_blobs b ON b.company_id = a.company_id AND b.sha256 = a.sha256
      WHERE s.period_id = $1 AND i.company_id = $2`,
    [periodId, companyId]
  );
  const files = [];
  const left = [];
  let used = 0;
  const safe = (t) => String(t || "").replace(/[^\w.\- ]/g, "_").slice(0, 80);
  for (const r of rows) {
    if (used + Number(r.byte_size) > PAPERS_CAP) {
      left.push(`${r.kind} ${r.doc_no}: ${r.filename}`);
      continue;
    }
    used += Number(r.byte_size);
    files.push({ name: `papers/${safe(r.kind)} ${safe(r.doc_no)} - ${safe(r.filename)}`, data: r.bytes });
  }
  return { files, left };
}

/**
 * Makes the pack for a period and records it. Returns the zip and its name.
 */
async function build(client, { companyId, userId, periodId }) {
  const p = await audit.period(client, { companyId, periodId });
  const { from, to } = p;
  const { rows: co } = await client.query("SELECT name, trim(base_currency) AS currency, tin FROM companies WHERE id = $1", [companyId]);
  const { rows: who } = await client.query("SELECT name FROM users WHERE id = $1", [userId]);
  const { rows: head } = await client.query("SELECT entry_no::text AS no, encode(hash, 'hex') AS hash FROM journal_entries WHERE company_id = $1 ORDER BY entry_no DESC LIMIT 1", [companyId]);
  const seal = await audit.checkSeal(client, { companyId, userId, periodId });

  const tb = await trialBalance(client, { companyId, from, to });
  const age = await ageing(client, { companyId, to });
  const stk = await stockByPlace(client, { companyId, from, to });
  const reg = await sampleRegister(client, { companyId, periodId });
  const paper = await papers(client, { companyId, periodId });
  const files = [
    { name: "01 Trial balance.csv", data: tb.file },
    { name: "02 General ledger (AICPA GL detail).csv", data: await generalLedger(client, { companyId, from, to, currency: co[0].currency }) },
    { name: "03 Chart of accounts.csv", data: await accounts(client, { companyId }) },
    { name: "04 Receivables ageing.csv", data: age.receivables.file },
    { name: "05 Payables ageing.csv", data: age.payables.file },
    { name: "06 Fixed asset register.csv", data: await fixedAssets(client, { companyId, to }) },
    { name: "07 Stock by place.csv", data: stk.file },
    { name: "08 Bank reconciliations.csv", data: await bankRecs(client, { companyId, from, to }) },
    { name: "09 GST returns filed.csv", data: await gstReturns(client, { companyId, from, to }) },
    { name: "10 Sample register.csv", data: reg.file },
    { name: "11 Journal risk.csv", data: await riskList(client, { companyId, from, to }) },
    ...paper.files,
  ];
  const sealText = [
    `Seal check, ${new Date().toISOString()}`,
    seal.ok ? `Intact: all ${seal.entries} entries dated in the period are as they were posted, and the chain of ${seal.checked} entries is unbroken.` : `Broken: ${seal.problems.length} problems.`,
    ...seal.problems.map((x) => `Entry ${x.entryNo}${x.inPeriod ? "" : " (outside the period)"}: ${x.problem}`),
    head[0] ? `Chain head: entry ${head[0].no}, SHA-256 ${head[0].hash}` : "No entries.",
  ].join("\r\n");
  files.push({ name: "12 Seal.txt", data: sealText + "\r\n" });
  const made = new Date();
  const readme = [
    `Audit pack: ${co[0].name}${co[0].tin ? ` (TIN ${co[0].tin})` : ""}`,
    `Period: ${p.name}, ${from} to ${to}. Amounts in ${co[0].currency}; balances as at ${to}.`,
    `Made ${made.toISOString()} by ${who[0]?.name || "someone"} in Sentryfi.`,
    "",
    "01 Trial balance: opening, the period's debits and credits, closing, per account." + (tb.balanced ? "" : " THE CLOSING COLUMNS DO NOT BALANCE."),
    "02 General ledger: every line in the period, in the AICPA Audit Data Standards GL detail layout. Effective_Date is the date an entry is for; Entered_Date and Entered_Time are when it was posted (Maldives time), Entered_By who posted it. Manual_Entry = Y where it came from no document.",
    "03 Chart of accounts.",
    `04 / 05 Receivables and payables open at ${to}, by days past due.`,
    `06 Fixed assets at ${to}, with depreciation charged through then.`,
    `07 Stock by place at ${to}, at weighted average cost.` + (stk.agrees ? " It agrees with the Stock account." : " IT DOES NOT AGREE WITH THE STOCK ACCOUNT."),
    "08 Bank reconciliations kept when each month in the period was closed.",
    "09 GST returns filed for the period.",
    "10 Every sample drawn, with its rule, seed and population fingerprint, and each item: why drawn, whether seen, by whom, the note.",
    "11 The journal risk screen (ISA 240): entries showing signs of override, most telling first.",
    "12 The seal check over the whole journal, and the chain's last hash.",
    paper.files.length ? `papers/: the ${paper.files.length} documents attached to sampled items, as filed.` : "papers/: no sampled item has a document attached.",
    ...(paper.left.length ? [`Not included (over ${PAPERS_CAP / 1048576} MB in all), open them in Sentryfi: ${paper.left.join("; ")}`] : []),
    "",
    "MANIFEST.sha256 lists every file's SHA-256. Check it with: sha256sum -c MANIFEST.sha256",
  ].join("\r\n");
  files.unshift({ name: "00 Read me.txt", data: readme + "\r\n" });
  const manifest = files.map((x) => `${crypto.createHash("sha256").update(Buffer.isBuffer(x.data) ? x.data : Buffer.from(x.data, "utf8")).digest("hex")}  ${x.name}`).join("\n") + "\n";
  files.push({ name: "MANIFEST.sha256", data: manifest });
  const body = zip(files, made);
  const sha = crypto.createHash("sha256").update(body).digest("hex");
  await client.query(
    "INSERT INTO audit_packs (company_id, period_id, sha256, byte_size, files, made_by) VALUES ($1,$2,$3,$4,$5,$6)",
    [companyId, periodId, sha, body.length, files.length, userId]
  );
  const name = `Audit pack ${co[0].name} ${from} to ${to}.zip`.replace(/[^\w.\- ]/g, "_");
  return { body, name, sha, files: files.map((x) => x.name) };
}

async function packs(client, { companyId, periodId }) {
  const { rows } = await client.query(
    "SELECT k.sha256, k.byte_size, k.files, k.made_at, u.name AS by FROM audit_packs k LEFT JOIN users u ON u.id = k.made_by WHERE k.company_id = $1 AND k.period_id = $2 ORDER BY k.made_at DESC",
    [companyId, periodId]
  );
  return rows.map((r) => ({ sha256: r.sha256, size: Number(r.byte_size), files: r.files, at: r.made_at, by: r.by }));
}

module.exports = { build, packs, cell, ageing, trialBalance };

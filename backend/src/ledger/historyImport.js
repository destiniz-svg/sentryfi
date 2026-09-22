const { tokenise } = require("./statement");
const { postEntry } = require("./post");
const { toLaari, formatLaari } = require("./money");

/**
 * Bringing history in from another system, as a CSV.
 *
 * The rule that does not bend: an import posts through the same door as a
 * person, postEntry, and never into the tables. Each transaction in the file
 * becomes one balanced entry with the same numbering, seal and trail as any
 * other. One that does not balance is not posted: it is listed, and waits.
 *
 * Two steps, and the second is a person's:
 *   preview  reads the file and says what it would do: how many transactions,
 *            which do not balance, which were brought in before, and which of
 *            their accounts are not known here yet (with a suggestion).
 *   commit   does it, with the account mapping the person agreed. The mapping
 *            is remembered for the next file.
 *
 * The columns are found by their headings, not their position, so the same
 * code reads Zoho Books' journal export, its General Ledger report, and most
 * other ledgers' exports. The system's own transaction id is kept, so the same
 * year imported twice changes nothing.
 */

// Headings seen in exports, lower-cased and stripped of punctuation.
const ALIASES = {
  date: ["date", "journal date", "transaction date", "entry date", "posting date"],
  id: ["entity id", "journal number", "journal", "journal no", "transaction", "transaction number", "transaction no", "transaction id", "entry number", "entry no", "voucher", "voucher no"],
  type: ["entity type", "transaction type", "journal type", "type", "source"],
  account: ["account", "account name", "ledger", "ledger account"],
  code: ["account code", "code", "account no", "account number"],
  debit: ["debit", "debit bcy", "debit fcy", "dr", "debit amount", "base currency debit"],
  credit: ["credit", "credit bcy", "credit fcy", "cr", "credit amount", "base currency credit"],
  memo: ["description", "notes", "narration", "memo", "transaction details", "details", "particulars", "contact name"],
  reference: ["number", "reference number", "reference", "reference no", "ref"],
};

const norm = (s) => String(s || "").toLowerCase().replace(/[#().,:_-]+/g, " ").replace(/\s+/g, " ").trim();

function findColumns(header) {
  const at = {};
  const names = header.map(norm);
  for (const [key, list] of Object.entries(ALIASES)) {
    const i = names.findIndex((n) => list.includes(n));
    if (i >= 0) at[key] = i;
  }
  const missing = ["date", "account", "debit", "credit"].filter((k) => at[k] === undefined);
  // A summary has one line per account and no dates: totals, not transactions.
  if (missing.includes("date") && names.some((n) => /^(debit|credit) total$|^balance$|^net (debit|credit)$|^closing balance$/.test(n))) {
    throw new Error(
      "This is a summary: one line per account, with totals and no transactions. " +
        "Export the transactions instead: in Zoho Books, Reports, Journal Report (or Account Transactions), " +
        "with the date range set to the whole period, then Export as CSV."
    );
  }
  if (missing.length) {
    throw new Error(
      `The file needs columns for ${missing.join(", ")}. Its headings are: ${header.filter(Boolean).join(", ")}.`
    );
  }
  return at;
}

/** Laari from "1,234.50", "(1,234.50)", "-12", "MVR 5". Blank is zero; nonsense is null. */
function money(s) {
  let t = String(s ?? "").replace(/[,\s]|MVR|USD|Rf/gi, "");
  if (!t || t === "-") return 0n;
  let negative = false;
  if (/^\(.*\)$/.test(t)) {
    negative = true;
    t = t.slice(1, -1);
  }
  if (t.startsWith("-")) {
    negative = !negative;
    t = t.slice(1);
  }
  // Zoho writes three places ("7.110"). A laari is two; anything past that is
  // rounded half up, which for Zoho's own exports is always a trailing zero.
  const m = /^(\d+)(?:\.(\d+))?$/.exec(t);
  if (!m) return null;
  const frac = (m[2] || "").padEnd(3, "0");
  const v = BigInt(m[1]) * 100n + BigInt(frac.slice(0, 2)) + (Number(frac[2]) >= 5 ? 1n : 0n);
  return negative ? -v : v;
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const iso = (y, m, d) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
};

/**
 * A date in any of the shapes ledgers export. Day-first for 03/04/2026, which
 * is how the Maldives writes it, unless the file itself proves otherwise.
 */
function makeDateReader(samples) {
  const slashed = samples.map((s) => /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(String(s).trim())).filter(Boolean);
  const monthFirst = slashed.some((m) => +m[2] > 12) && !slashed.some((m) => +m[1] > 12);
  return (raw) => {
    const s = String(raw || "").trim();
    let m = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/.exec(s);
    if (m) return iso(+m[1], +m[2], +m[3]);
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
    if (m) return monthFirst ? iso(+m[3], +m[1], +m[2]) : iso(+m[3], +m[2], +m[1]);
    m = /^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -,]*(\d{4})$/.exec(s);
    if (m && MONTHS[m[2].toLowerCase()]) return iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
    return null;
  };
}

/** Totals and the balanced flag, once a transaction has all its lines. */
function finish(t) {
  const debit = t.lines.reduce((s, l) => s + l.debit, 0n);
  const credit = t.lines.reduce((s, l) => s + l.credit, 0n);
  return { ...t, debit, credit, balanced: debit === credit && t.lines.length >= 2 };
}

/** Rows into transactions. Nothing here touches the database. */
function read(text) {
  const rows = tokenise(String(text || "").replace(/^﻿/, "")).filter((r) => r.some((c) => String(c).trim()));
  if (rows.length < 2) throw new Error("That file has no rows under its headings.");
  const headerAt = rows.findIndex((r) => {
    try {
      findColumns(r);
      return true;
    } catch {
      return false;
    }
  });
  if (headerAt < 0) findColumns(rows[0]); // throws the message naming what is missing
  const at = findColumns(rows[headerAt]);
  const body = rows.slice(headerAt + 1);
  const dateOf = makeDateReader(body.map((r) => r[at.date]));

  const skipped = [];
  const byKey = new Map();
  body.forEach((r, i) => {
    const rowNo = headerAt + i + 2;
    const cell = (k) => (at[k] === undefined ? "" : String(r[at[k]] ?? "").trim());
    const account = cell("account");
    // Report footers and blank separators carry no account.
    if (!account || /^total/i.test(account)) return;
    const date = dateOf(cell("date"));
    const debit = money(cell("debit"));
    const credit = money(cell("credit"));
    if (!date) return skipped.push({ rowNo, why: `"${cell("date")}" is not a date` });
    if (debit === null || credit === null) return skipped.push({ rowNo, why: "an amount is not a number" });
    // A negative on one side is the other side.
    let dr = debit - (credit < 0n ? credit : 0n);
    let cr = credit - (debit < 0n ? debit : 0n);
    dr = dr < 0n ? 0n : dr;
    cr = cr < 0n ? 0n : cr;
    if (dr === 0n && cr === 0n) return;

    // Grouped by the system's own id; shown by the number a person knows it by.
    const theirKey = cell("id") || cell("reference");
    // A long all-digit id is the system's internal one; the reference is what people use.
    const theirId = /^\d{12,}$/.test(cell("id")) ? cell("reference") || cell("id") : cell("id") || cell("reference");
    const key = theirKey ? `${cell("type")}|${theirKey}|${date}` : `row|${rowNo}`;
    if (!byKey.has(key)) byKey.set(key, { key, date, type: cell("type"), theirId, memo: "", lines: [] });
    const t = byKey.get(key);
    if (!t.memo && cell("memo")) t.memo = cell("memo");
    t.lines.push({ account, code: cell("code"), debit: dr, credit: cr, memo: cell("memo") || null });
  });

  const transactions = [...byKey.values()].map(finish);
  return { columns: Object.keys(at), transactions, skipped };
}

const TYPE_BY_CODE = { 1: "asset", 2: "liability", 3: "equity", 4: "income", 5: "expense", 6: "expense", 7: "expense", 8: "expense", 9: "expense" };

/** A guess at what one of their accounts is here, from its code and name. */
function guessType(name, code) {
  if (/^\d/.test(code || "") && TYPE_BY_CODE[code[0]]) return TYPE_BY_CODE[code[0]];
  const n = name.toLowerCase();
  // A current account with another company ("KENGO PVT LTD C/A") is money between the two,
  // held as an asset until it is known which way it runs.
  if (/receivable|bank|cash|petty|deposit|prepaid|inventory|stock|equipment|vehicle|furniture|building|land|machinery|input (tax|gst)|gst (paid|receivable|claim)|\bc\/a\b|current a\/?c\b|current account/.test(n)) return "asset";
  if (/payable|loan|accrued|output (tax|gst)|gst (payable|owed)|tax payable|advance from|director.*(loan|current)/.test(n)) return "liability";
  if (/capital|equity|retained|drawings|share|reserve/.test(n)) return "equity";
  if (/income|revenue|sales|rental income|interest received|discount received/.test(n)) return "income";
  return "expense";
}

/** Their account names, each with what it is here or a suggestion. */
async function mapAccounts(client, { companyId, system, transactions }) {
  const theirs = new Map();
  for (const t of transactions) for (const l of t.lines) if (!theirs.has(l.account)) theirs.set(l.account, l.code);

  const { rows: ours } = await client.query(
    "SELECT id, code, name, type::text AS type FROM accounts WHERE company_id = $1 AND archived_at IS NULL ORDER BY code",
    [companyId]
  );
  const { rows: remembered } = await client.query(
    "SELECT their_name, account_id FROM import_account_map WHERE company_id = $1 AND system = $2",
    [companyId, system]
  );
  const known = new Map(remembered.map((r) => [r.their_name, r.account_id]));

  return [...theirs.entries()].map(([name, code]) => {
    if (known.has(name)) return { theirs: name, code, accountId: known.get(name), how: "remembered" };
    const same =
      ours.find((a) => a.name.toLowerCase() === name.toLowerCase()) ||
      (code ? ours.find((a) => a.code === code) : null);
    if (same) return { theirs: name, code, accountId: same.id, how: "same name" };
    return { theirs: name, code, accountId: null, how: "new", suggestType: guessType(name, code) };
  });
}

async function alreadyHad(client, { companyId, system, transactions }) {
  const ids = transactions.map((t) => t.key);
  const { rows } = await client.query(
    "SELECT external_id FROM imported_records WHERE company_id = $1 AND system = $2 AND external_id = ANY($3::text[])",
    [companyId, system, ids]
  );
  return new Set(rows.map((r) => r.external_id));
}

async function preview(client, { companyId, system, text, transactions: given }) {
  const { columns, transactions, skipped } = given ? { columns: [], transactions: given, skipped: [] } : read(text);
  const had = await alreadyHad(client, { companyId, system, transactions });
  const fresh = transactions.filter((t) => !had.has(t.key));
  const dates = transactions.map((t) => t.date).sort();
  return {
    columns,
    count: transactions.length,
    alreadyHad: transactions.length - fresh.length,
    toPost: fresh.filter((t) => t.balanced).length,
    unbalanced: fresh
      .filter((t) => !t.balanced)
      .slice(0, 50)
      .map((t) => ({ date: t.date, id: t.theirId, debit: formatLaari(t.debit), credit: formatLaari(t.credit), lines: t.lines.length })),
    unbalancedCount: fresh.filter((t) => !t.balanced).length,
    skipped,
    from: dates[0] || null,
    to: dates[dates.length - 1] || null,
    accounts: await mapAccounts(client, { companyId, system, transactions: fresh }),
  };
}

/** The next free code in an account type's thousand, for an account made on import. */
async function nextCode(client, { companyId, type }) {
  const first = { asset: 1, liability: 2, equity: 3, income: 4, expense: 5 }[type];
  const { rows } = await client.query(
    `SELECT code FROM accounts WHERE company_id = $1 AND code ~ '^[0-9]{4}$' AND left(code, 1) = $2`,
    [companyId, String(first)]
  );
  const taken = new Set(rows.map((r) => r.code));
  for (let n = first * 1000 + 900; n < first * 1000 + 1000; n += 1) if (!taken.has(String(n))) return String(n);
  for (let n = first * 1000 + 1; n < first * 1000 + 900; n += 1) if (!taken.has(String(n))) return String(n);
  throw new Error(`There is no free ${type} code left in the chart.`);
}

/**
 * Posts every balanced transaction not brought in before, with the mapping a
 * person agreed: { [theirName]: accountId } or { [theirName]: { create: type } }.
 */
async function commit(client, { companyId, userId, system, text, transactions: given, mapping = {}, limit = null }) {
  const transactions = given || read(text).transactions;
  const had = await alreadyHad(client, { companyId, system, transactions });
  const fresh = transactions.filter((t) => !had.has(t.key) && t.balanced);
  const proposed = await mapAccounts(client, { companyId, system, transactions: fresh });

  const accountOf = new Map();
  for (const p of proposed) {
    const said = mapping[p.theirs];
    if (said && typeof said === "object" && said.create) {
      if (!["asset", "liability", "equity", "income", "expense"].includes(said.create)) throw new Error(`What kind of account is ${p.theirs}?`);
      const code = await nextCode(client, { companyId, type: said.create });
      const { rows } = await client.query(
        "INSERT INTO accounts (company_id, code, name, type) VALUES ($1,$2,$3,$4) RETURNING id",
        [companyId, code, p.theirs, said.create]
      );
      accountOf.set(p.theirs, rows[0].id);
    } else if (said) {
      const { rows } = await client.query("SELECT id FROM accounts WHERE id = $1 AND company_id = $2", [said, companyId]);
      if (!rows.length) throw new Error(`The account chosen for ${p.theirs} is not in these books.`);
      accountOf.set(p.theirs, said);
    } else if (p.accountId) {
      accountOf.set(p.theirs, p.accountId);
    } else {
      throw new Error(`Say what ${p.theirs} is before anything is brought in.`);
    }
    await client.query(
      `INSERT INTO import_account_map (company_id, system, their_name, account_id) VALUES ($1,$2,$3,$4)
       ON CONFLICT (company_id, system, their_name) DO NOTHING`,
      [companyId, system, p.theirs, accountOf.get(p.theirs)]
    );
  }

  // Oldest first, so entry numbers run in date order within an import.
  fresh.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  // A large history goes in a chunk at a time, oldest first, so no one request
  // runs long enough to time out. Each chunk is its own transaction; running it
  // again after a failure only adds what is not in yet.
  const batch = limit ? fresh.slice(0, limit) : fresh;
  let posted = 0;
  for (const t of batch) {
    const entry = await postEntry(client, {
      companyId,
      userId,
      date: t.date,
      source: "import",
      narrative: `From ${system}: ${[t.type, t.theirId].filter(Boolean).join(" ") || "transaction"}${t.memo ? ` - ${t.memo}` : ""}`.slice(0, 500),
      lines: t.lines.map((l) => ({
        accountId: accountOf.get(l.account),
        debit: l.debit > 0n ? l.debit : undefined,
        credit: l.credit > 0n ? l.credit : undefined,
        memo: l.memo,
      })),
    });
    await client.query(
      "INSERT INTO imported_records (company_id, system, external_id, entry_id, imported_by) VALUES ($1,$2,$3,$4,$5)",
      [companyId, system, t.key, entry.id, userId]
    );
    posted += 1;
  }
  return { posted, remaining: fresh.length - batch.length, alreadyHad: had.size, unbalanced: transactions.filter((t) => !had.has(t.key) && !t.balanced).length };
}

module.exports = { read, money, guessType, preview, commit, finish };

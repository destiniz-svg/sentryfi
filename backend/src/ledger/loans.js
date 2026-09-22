const crypto = require("crypto");
const { postEntry } = require("./post");
const { toLaari, formatLaari } = require("./money");

/**
 * Money borrowed, and money a director owes the business.
 *
 * A loan has its own account, so what is still owed is read from the journal
 * like a bank balance. Every repayment is one entry split two ways: what
 * reduced the debt (the balance sheet) and what it cost (the profit and loss).
 * Posting a repayment as one line of expense is the commonest bookkeeping
 * mistake with loans, and this never lets it happen.
 *
 * The split: for a reducing-balance loan, interest runs day by day on what is
 * still owed since the last payment, which is what banks charge. For a flat
 * rate, the interest is fixed per instalment when the loan is made. Either
 * way the lender's statement wins: a person can say how much of a payment was
 * interest, and that is what is posted.
 *
 * See docs/domain/money-borrowed-and-paid.md.
 */

const KINDS = {
  bank_term: { name: "Bank loan" },
  hire_purchase: { name: "Hire purchase", assetBacked: true },
  finance_lease: { name: "Finance lease", assetBacked: true },
  trust_receipt: { name: "Trust receipt (import loan)" },
  director_in: { name: "Money a director lent the business" },
  director_out: { name: "Money a director owes the business", lent: true },
  murabaha: { name: "Murabaha", assetBacked: true, islamic: "profit" },
  ijara: { name: "Ijara", assetBacked: true, islamic: "rent" },
  musharaka: { name: "Diminishing musharaka", assetBacked: true, islamic: "rent" },
  other: { name: "Other borrowing" },
};

const COST = ["5830", "Interest and finance costs", "expense"];
const ISLAMIC_COST = ["5831", "Profit and rent on Islamic financing", "expense"];
const EARNED = ["4910", "Interest earned", "income"];
const FEES = ["5832", "Loan fees", "expense"];

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

async function ensureAccount(client, companyId, [code, name, type]) {
  await client.query(
    `INSERT INTO accounts (company_id, code, name, type) VALUES ($1,$2,$3,$4::account_t) ON CONFLICT (company_id, code) DO NOTHING`,
    [companyId, code, name, type]
  );
  const { rows } = await client.query("SELECT id, name FROM accounts WHERE company_id = $1 AND code = $2", [companyId, code]);
  return rows[0];
}

/** A loan's own account: 2411, 2412, ... for borrowing; 1611, ... for money lent. */
async function openLoanAccount(client, { companyId, name, lent }) {
  const prefix = lent ? "16" : "24";
  const { rows: used } = await client.query("SELECT code FROM accounts WHERE company_id = $1 AND code LIKE $2", [companyId, `${prefix}%`]);
  const taken = new Set(used.map((r) => r.code));
  for (let n = 11; n <= 99; n++) {
    const code = `${prefix}${n}`;
    if (taken.has(code)) continue;
    const { rows } = await client.query(
      `INSERT INTO accounts (company_id, code, name, type) VALUES ($1,$2,$3,$4::account_t) RETURNING id, code, name`,
      [companyId, code, lent ? `Owed to us: ${name}` : `Loan: ${name}`, lent ? "asset" : "liability"]
    );
    return rows[0];
  }
  throw new Error("There is no room for another loan account in the chart of accounts.");
}

const addMonths = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))).toISOString().slice(0, 10);
};

/** Rounded division, half away from zero. BigInt. */
const div = (a, b) => (a >= 0n ? (2n * a + b) / (2n * b) : -((2n * -a + b) / (2n * b)));

/**
 * The lender's schedule, instalment by instalment. Pure; laari, BigInt.
 * loan: { principal_laari, rate_bp, rate_basis, method, term_months, first_due }
 */
function schedule(loan) {
  const P = BigInt(loan.principal_laari);
  const n = Number(loan.term_months || 0);
  const bp = BigInt(loan.rate_bp || 0);
  if (loan.method === "none" || !n) return [];
  const rows = [];
  let bal = P;
  const due = (k) => addMonths(loan.first_due, k - 1);

  if (loan.rate_basis === "flat") {
    // Interest on the whole sum for the whole term, shared equally.
    const totalInterest = div(P * bp * BigInt(n), 120000n);
    const each = totalInterest / BigInt(n);
    const part = P / BigInt(n);
    for (let k = 1; k <= n; k++) {
      const last = k === n;
      const interest = last ? totalInterest - each * BigInt(n - 1) : each;
      const principal = last ? bal : part;
      rows.push({ n: k, due: due(k), opening: bal, interest, principal, payment: interest + principal, closing: bal - principal });
      bal -= principal;
    }
    return rows;
  }

  if (loan.method === "equal_principal") {
    const part = P / BigInt(n);
    for (let k = 1; k <= n; k++) {
      const interest = div(bal * bp, 120000n);
      const principal = k === n ? bal : part;
      rows.push({ n: k, due: due(k), opening: bal, interest, principal, payment: interest + principal, closing: bal - principal });
      bal -= principal;
    }
    return rows;
  }

  // Equal instalments (annuity), the usual bank loan.
  const r = Number(bp) / 120000;
  const payment = r === 0 ? div(P, BigInt(n)) : BigInt(Math.round((Number(P) * r) / (1 - Math.pow(1 + r, -n))));
  for (let k = 1; k <= n; k++) {
    const interest = div(bal * bp, 120000n);
    const principal = k === n ? bal : payment - interest;
    rows.push({ n: k, due: due(k), opening: bal, interest, principal, payment: interest + principal, closing: bal - principal });
    bal -= principal;
  }
  return rows;
}

/**
 * What a flat rate really costs, as a yearly rate on what is actually still
 * owed: the rate at which the same payments would clear the same loan.
 * "6% flat" is about 11%. Percent, one decimal.
 */
function effectiveRate(loan) {
  const rows = schedule(loan);
  if (!rows.length) return null;
  const P = Number(loan.principal_laari);
  const pay = rows.map((r) => Number(r.payment));
  const pv = (r) => pay.reduce((s, p, i) => s + p / Math.pow(1 + r, i + 1), 0);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > P) lo = mid;
    else hi = mid;
  }
  return Math.round(lo * 12 * 1000) / 10;
}

async function create(client, { companyId, userId, name, kind, principal, ratePct, rateBasis, method, termMonths, startsOn, firstDue, fee, intoAccountId }) {
  const k = KINDS[kind];
  if (!k) throw new Error("What kind of borrowing is it?");
  const clean = String(name || "").trim();
  if (clean.length < 2) throw new Error("Name it the way the lender does, so the statement matches.");
  if (!isoDate.test(String(startsOn || ""))) throw new Error("When was the money received?");
  const P = toLaari(principal);
  if (P <= 0n) throw new Error("How much was borrowed?");
  const feeL = fee ? toLaari(fee) : 0n;
  if (feeL >= P) throw new Error("The fee cannot be as much as the loan.");
  const m = ["annuity", "equal_principal", "none"].includes(method) ? method : "annuity";
  const basis = rateBasis === "flat" ? "flat" : "reducing";
  const term = m === "none" ? null : Number(termMonths);
  if (m !== "none" && !(term > 0 && term <= 600)) throw new Error("Over how many months is it repaid?");
  const rateBp = Math.round(Number(ratePct || 0) * 100);
  if (!(rateBp >= 0 && rateBp <= 100000)) throw new Error("That rate does not look right.");
  const due1 = firstDue && isoDate.test(firstDue) ? firstDue : addMonths(startsOn, 1);
  if (!intoAccountId && !k.assetBacked) throw new Error(k.lent ? "Where was the money paid from?" : "Where did the money go?");

  const account = await openLoanAccount(client, { companyId, name: clean, lent: k.lent });
  const id = crypto.randomUUID();
  let entry = null;
  if (intoAccountId) {
    const lines = [];
    if (k.lent) {
      lines.push({ accountId: account.id, debit: P, memo: clean }, { accountId: intoAccountId, credit: P, memo: clean });
    } else {
      lines.push({ accountId: intoAccountId, debit: P - feeL, memo: clean });
      if (feeL > 0n) lines.push({ accountId: (await ensureAccount(client, companyId, FEES)).id, debit: feeL, memo: `${clean}: fee` });
      lines.push({ accountId: account.id, credit: P, memo: clean });
    }
    entry = await postEntry(client, {
      companyId,
      userId,
      date: startsOn,
      source: "loan",
      sourceId: id,
      narrative: k.lent ? `Lent: ${clean}` : `Borrowed: ${clean}`,
      lines,
    });
  }
  await client.query(
    `INSERT INTO loans (id, company_id, name, kind, account_id, principal_laari, rate_bp, rate_basis, method, term_months,
                        starts_on, first_due, fee_laari, entry_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [id, companyId, clean, kind, account.id, P.toString(), rateBp, basis, m, term, startsOn, due1, feeL.toString(), entry?.id || null, userId]
  );
  return { id, account, entryNo: entry?.entryNo || null };
}

async function loadLoan(client, { companyId, loanId }) {
  const { rows } = await client.query(
    `SELECT l.*, l.starts_on::text AS starts_on, l.first_due::text AS first_due,
            COALESCE((SELECT SUM(CASE WHEN a.type = 'liability' THEN jl.credit_laari - jl.debit_laari ELSE jl.debit_laari - jl.credit_laari END)
                        FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id WHERE jl.account_id = l.account_id), 0)::text AS owed
       FROM loans l WHERE l.company_id = $1 AND l.id = $2`,
    [companyId, loanId]
  );
  return rows[0];
}

async function repayments(client, { companyId, loanId }) {
  const { rows } = await client.query(
    `SELECT e.id, e.entry_no, e.entry_date::text AS on_date,
            COALESCE(SUM(CASE WHEN jl.account_id = l.account_id THEN jl.debit_laari + jl.credit_laari ELSE 0 END), 0)::text AS principal,
            COALESCE(SUM(CASE WHEN a.code IN ('5830','5831','4910') THEN jl.debit_laari + jl.credit_laari ELSE 0 END), 0)::text AS interest
       FROM journal_entries e
       JOIN loans l ON l.id = e.source_id
       JOIN journal_lines jl ON jl.entry_id = e.id
       JOIN accounts a ON a.id = jl.account_id
      WHERE e.company_id = $1 AND e.source = 'loan_repayment' AND e.source_id = $2
      GROUP BY e.id ORDER BY e.entry_date, e.entry_no`,
    [companyId, loanId]
  );
  return rows;
}

/** What of a payment would be interest if the person does not say. Laari. */
function interestDue(loan, { owed, paidSoFar, lastPaid, on }) {
  if (!loan.rate_bp) return 0n;
  if (loan.rate_basis === "flat") {
    const row = schedule(loan)[paidSoFar];
    return row ? row.interest : 0n;
  }
  const from = lastPaid || loan.starts_on;
  const days = Math.max(0, Math.round((Date.parse(on) - Date.parse(from)) / 86_400_000));
  return div(owed * BigInt(loan.rate_bp) * BigInt(days), 3_650_000n);
}

async function repay(client, { companyId, userId, loanId, on, amount, fromAccountId, interest }) {
  if (!isoDate.test(String(on || ""))) throw new Error("When was it paid?");
  const loan = await loadLoan(client, { companyId, loanId });
  if (!loan) throw new Error("That loan is not in these books.");
  if (!fromAccountId) throw new Error(KINDS[loan.kind]?.lent ? "Where did the money go?" : "Where was it paid from?");
  const total = toLaari(amount);
  if (total <= 0n) throw new Error("How much was paid?");
  const owed = BigInt(loan.owed);
  const past = await repayments(client, { companyId, loanId });
  const lastPaid = past.length ? past[past.length - 1].on_date : null;

  let cost = interest !== undefined && interest !== null && String(interest).trim() !== "" ? toLaari(interest) : interestDue(loan, { owed, paidSoFar: past.length, lastPaid, on });
  if (cost > total) cost = total;
  if (cost < 0n) throw new Error("Interest cannot be negative.");
  const principal = total - cost;
  if (principal > owed) {
    throw new Error(`That is ${formatLaari(principal - owed)} more than is still owed (${formatLaari(owed)}). Is some of it interest or a charge?`);
  }

  const k = KINDS[loan.kind] || KINDS.other;
  const costAccount = await ensureAccount(client, companyId, k.lent ? EARNED : k.islamic ? ISLAMIC_COST : COST);
  const lines = [];
  if (k.lent) {
    lines.push({ accountId: fromAccountId, debit: total, memo: loan.name });
    if (principal > 0n) lines.push({ accountId: loan.account_id, credit: principal, memo: loan.name });
    if (cost > 0n) lines.push({ accountId: costAccount.id, credit: cost, memo: `${loan.name}: interest` });
  } else {
    if (principal > 0n) lines.push({ accountId: loan.account_id, debit: principal, memo: loan.name });
    if (cost > 0n) lines.push({ accountId: costAccount.id, debit: cost, memo: `${loan.name}: ${k.islamic || "interest"}` });
    lines.push({ accountId: fromAccountId, credit: total, memo: loan.name });
  }
  const entry = await postEntry(client, {
    companyId,
    userId,
    date: on,
    source: "loan_repayment",
    sourceId: loanId,
    narrative: `${k.lent ? "Repaid to us" : "Repayment"}: ${loan.name}`,
    lines,
  });
  return { entryNo: entry.entryNo, principal, cost, costName: k.lent ? "interest" : k.islamic || "interest", owedAfter: owed - principal };
}

async function list(client, { companyId }) {
  const { rows } = await client.query("SELECT id FROM loans WHERE company_id = $1 ORDER BY created_at", [companyId]);
  const today = new Date().toISOString().slice(0, 10);
  const out = [];
  for (const { id } of rows) {
    const l = await loadLoan(client, { companyId, loanId: id });
    const past = await repayments(client, { companyId, loanId: id });
    const plan = schedule(l);
    const next = plan[past.length] || null;
    const k = KINDS[l.kind] || KINDS.other;
    const owed = BigInt(l.owed);
    out.push({
      id,
      name: l.name,
      kind: l.kind,
      kindName: k.name,
      lent: Boolean(k.lent),
      assetBacked: Boolean(k.assetBacked),
      costName: k.lent ? "interest" : k.islamic || "interest",
      principal: formatLaari(BigInt(l.principal_laari)),
      owed: formatLaari(owed),
      settled: owed === 0n && past.length > 0,
      ratePct: l.rate_bp / 100,
      rateBasis: l.rate_basis,
      effectivePct: l.rate_basis === "flat" ? effectiveRate(l) : null,
      method: l.method,
      termMonths: l.term_months,
      startsOn: l.starts_on,
      paidInterest: formatLaari(past.reduce((s, p) => s + BigInt(p.interest), 0n)),
      payments: past.length,
      next: next && owed > 0n ? { due: next.due, payment: formatLaari(next.payment), interest: formatLaari(next.interest), principal: formatLaari(next.principal), late: next.due < today } : null,
      schedule: plan.map((r) => ({ n: r.n, due: r.due, payment: formatLaari(r.payment), interest: formatLaari(r.interest), principal: formatLaari(r.principal), closing: formatLaari(r.closing) })),
    });
  }
  return out;
}

module.exports = { KINDS, schedule, effectiveRate, interestDue, create, repay, list };

/**
 * Projects, construction first. See config/projects-schema.js for the shape.
 *
 * A progress claim is cumulative: the value of all work done to date. When
 * the customer's engineer certifies it, the certificate is the certified
 * value to date less what was certified before. Retention is kept back from
 * each certificate (a share of the certified value to date, up to a cap on
 * the contract), so what is invoiced now is the certificate less this
 * certificate's retention. The retention is still revenue, earned by the work,
 * but the customer holds it (1310) until it is released and invoiced.
 *
 * Every figure the project page shows is a query: spent and revenue are the
 * project's lines in the ledger, retention held is 1310's balance for it, and
 * committed is what was ordered less what has been billed against it.
 */
const { postEntry, assumeIdentity } = require("./post");
const { toLaari, formatLaari } = require("./money");
const sales = require("./sales");
const stock = require("./stock");

const RETENTION = ["1310", "Retention held by customers", "asset"];
const INCOME = "4100";
const bp = (v) => {
  const n = Math.round(Number(v || 0) * 100);
  if (!(n >= 0 && n <= 5000)) throw new Error("A retention percentage is between 0 and 50.");
  return n;
};

async function project(client, { companyId, projectId }) {
  const { rows } = await client.query("SELECT * FROM projects WHERE id = $1 AND company_id = $2", [projectId, companyId]);
  if (!rows[0]) throw new Error("That project is not in these books.");
  return rows[0];
}

/** The contract: customer, value, retention, dates. */
async function configure(client, { companyId, userId, projectId, counterpartyId, contract, retentionPct, retentionCapPct, startsOn, endsOn }) {
  await assumeIdentity(client, { companyId, userId });
  await project(client, { companyId, projectId });
  if (counterpartyId) {
    const { rows } = await client.query("SELECT 1 FROM counterparties WHERE id = $1 AND company_id = $2", [counterpartyId, companyId]);
    if (!rows.length) throw new Error("That customer is not in these books.");
  }
  await client.query(
    `UPDATE projects SET counterparty_id = $3, contract_laari = $4, retention_bp = $5, retention_cap_bp = $6, starts_on = $7, ends_on = $8
      WHERE id = $1 AND company_id = $2`,
    [
      projectId, companyId, counterpartyId || null, contract ? toLaari(contract).toString() : null,
      bp(retentionPct), retentionCapPct === null || retentionCapPct === undefined || retentionCapPct === "" ? null : bp(retentionCapPct),
      startsOn || null, endsOn || null,
    ]
  );
}

/** The budget, by kind of cost (an expense account). Replaces what was there. */
async function setBudget(client, { companyId, userId, projectId, lines }) {
  await assumeIdentity(client, { companyId, userId });
  await project(client, { companyId, projectId });
  const ids = lines.map((l) => l.accountId);
  if (ids.length) {
    const { rows } = await client.query("SELECT id FROM accounts WHERE company_id = $1 AND id = ANY($2::uuid[]) AND type = 'expense'", [companyId, ids]);
    if (rows.length !== new Set(ids).size) throw new Error("A budget line is one of this company's kinds of cost.");
  }
  await client.query("DELETE FROM project_budgets WHERE project_id = $1 AND company_id = $2", [projectId, companyId]);
  for (const l of lines) {
    const amount = toLaari(l.amount);
    if (amount < 0n) throw new Error("A budget is not below zero.");
    await client.query("INSERT INTO project_budgets (company_id, project_id, account_id, amount_laari) VALUES ($1,$2,$3,$4)", [companyId, projectId, l.accountId, amount.toString()]);
  }
  const total = lines.reduce((a, l) => a + toLaari(l.amount), 0n);
  await client.query("UPDATE projects SET budget_laari = $3 WHERE id = $1 AND company_id = $2", [projectId, companyId, total.toString()]);
}

/** A subcontract or order placed: money the project is committed to spend. */
async function commit(client, { companyId, userId, projectId, counterpartyId, description, accountId, amount }) {
  await assumeIdentity(client, { companyId, userId });
  await project(client, { companyId, projectId });
  const { rows: acc } = await client.query("SELECT 1 FROM accounts WHERE id = $1 AND company_id = $2 AND type = 'expense'", [accountId, companyId]);
  if (!acc.length) throw new Error("Which kind of cost is it?");
  if (counterpartyId) {
    const { rows } = await client.query("SELECT 1 FROM counterparties WHERE id = $1 AND company_id = $2", [counterpartyId, companyId]);
    if (!rows.length) throw new Error("That supplier is not in these books.");
  }
  if (!String(description || "").trim()) throw new Error("What was ordered?");
  const value = toLaari(amount);
  if (value <= 0n) throw new Error("For how much?");
  const { rows } = await client.query(
    `INSERT INTO project_commitments (company_id, project_id, counterparty_id, description, account_id, amount_laari, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [companyId, projectId, counterpartyId || null, String(description).trim(), accountId, value.toString(), userId]
  );
  return rows[0].id;
}

/** A bill against a commitment: it stops being committed and is spent. A bill not yet in the books is also put on the project. */
async function billAgainst(client, { companyId, userId, commitmentId, billId }) {
  await assumeIdentity(client, { companyId, userId });
  const { rows } = await client.query("SELECT project_id FROM project_commitments WHERE id = $1 AND company_id = $2", [commitmentId, companyId]);
  if (!rows[0]) throw new Error("That commitment is not in these books.");
  const { rowCount } = await client.query(
    `UPDATE bills SET commitment_id = $3, project_id = CASE WHEN status = 'posted' THEN project_id ELSE COALESCE(project_id, $4) END, updated_at = now()
      WHERE id = $1 AND company_id = $2`,
    [billId, companyId, commitmentId, rows[0].project_id]
  );
  if (!rowCount) throw new Error("That bill is not in these books.");
}

async function claims(client, { companyId, projectId }) {
  const { rows } = await client.query("SELECT * FROM project_claims WHERE project_id = $1 AND company_id = $2 ORDER BY number", [projectId, companyId]);
  return rows;
}

/** A progress claim: the value of all work done to date, as at a date. */
async function claim(client, { companyId, userId, projectId, periodTo, claimedToDate }) {
  await assumeIdentity(client, { companyId, userId });
  const p = await project(client, { companyId, projectId });
  if (!p.counterparty_id) throw new Error("Say who the customer is before claiming.");
  const before = await claims(client, { companyId, projectId });
  const last = before[before.length - 1];
  if (last && last.certified_to_date_laari === null) throw new Error(`Claim ${last.number} has not been certified yet. Certify it first.`);
  const value = toLaari(claimedToDate);
  if (last && value < BigInt(last.claimed_to_date_laari)) throw new Error("A claim is of all work done to date, so it is not less than the last one.");
  if (p.contract_laari !== null && value > BigInt(p.contract_laari)) throw new Error("That is more than the contract. Record the variation on the contract first.");
  const { rows } = await client.query(
    `INSERT INTO project_claims (company_id, project_id, number, period_to, claimed_to_date_laari, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, number`,
    [companyId, projectId, (last?.number || 0) + 1, periodTo, value.toString(), userId]
  );
  return rows[0];
}

/** Retention held to date on a certified value: its share, up to the cap on the contract. */
function retentionOn(p, certifiedToDate) {
  const share = (certifiedToDate * BigInt(p.retention_bp)) / 10000n;
  if (p.retention_cap_bp === null || p.contract_laari === null) return share;
  const cap = (BigInt(p.contract_laari) * BigInt(p.retention_cap_bp)) / 10000n;
  return share < cap ? share : cap;
}

/**
 * The engineer's certificate against a claim. Invoices the certificate less
 * this certificate's retention, and books that retention as held by the
 * customer.
 */
async function certify(client, { companyId, userId, claimId, certifiedToDate, on }) {
  await assumeIdentity(client, { companyId, userId });
  const { rows } = await client.query("SELECT * FROM project_claims WHERE id = $1 AND company_id = $2 FOR UPDATE", [claimId, companyId]);
  const c = rows[0];
  if (!c) throw new Error("That claim is not in these books.");
  if (c.certified_to_date_laari !== null) throw new Error(`Claim ${c.number} is certified already.`);
  const p = await project(client, { companyId, projectId: c.project_id });
  const earlier = (await claims(client, { companyId, projectId: c.project_id })).filter((x) => x.number < c.number);
  const prevCertified = earlier.reduce((m, x) => (x.certified_to_date_laari !== null && BigInt(x.certified_to_date_laari) > m ? BigInt(x.certified_to_date_laari) : m), 0n);
  const prevRetention = earlier.reduce((a, x) => a + BigInt(x.retention_laari || 0), 0n);
  const certified = toLaari(certifiedToDate);
  if (certified < prevCertified) throw new Error(`Less than was certified before (MVR ${formatLaari(prevCertified)}). A reduction is a credit note, not a certificate.`);
  if (certified > BigInt(c.claimed_to_date_laari)) throw new Error("More than was claimed. Certify at most what was claimed.");
  const certificate = certified - prevCertified;
  const retention = retentionOn(p, certified) - prevRetention;
  const due = certificate - retention;

  let invoiceId = null;
  if (due > 0n) {
    const { rows: co } = await client.query("SELECT gst_registered FROM companies WHERE id = $1", [companyId]);
    const { invoice } = await sales.raise(client, {
      companyId, userId, counterpartyId: p.counterparty_id, issueDate: on, projectId: p.id,
      subject: `${p.name}: progress claim ${c.number}, certified`,
      gstTreatment: co[0]?.gst_registered ? "exclusive" : "none_unregistered",
      lines: [
        {
          description: `Progress claim ${c.number}: work certified to date MVR ${formatLaari(certified)}, less certified before MVR ${formatLaari(prevCertified)}` +
            (retention > 0n ? `, less retention MVR ${formatLaari(retention)}` : ""),
          amount: formatLaari(due).replace(/,/g, ""),
        },
      ],
    });
    await sales.post(client, { companyId, userId, invoiceId: invoice.id });
    invoiceId = invoice.id;
  }
  let retentionEntry = null;
  if (retention > 0n) {
    const held = await stock.account(client, companyId, RETENTION);
    const { rows: inc } = await client.query("SELECT id FROM accounts WHERE company_id = $1 AND code = $2", [companyId, INCOME]);
    if (!inc[0]) throw new Error("This company has no income account for work invoiced.");
    const memo = `${p.name}: retention on claim ${c.number}`;
    const e = await postEntry(client, {
      companyId, userId, date: on, source: "adjustment", narrative: memo,
      lines: [
        { accountId: held, debit: retention, projectId: p.id, counterpartyId: p.counterparty_id, memo },
        { accountId: inc[0].id, credit: retention, projectId: p.id, counterpartyId: p.counterparty_id, memo },
      ],
    });
    retentionEntry = e.id;
  }
  await client.query(
    `UPDATE project_claims SET certified_to_date_laari = $2, certified_on = $3, certificate_laari = $4, retention_laari = $5, invoice_id = $6, retention_entry_id = $7 WHERE id = $1`,
    [claimId, certified.toString(), on, certificate.toString(), retention.toString(), invoiceId, retentionEntry]
  );
  return { certificate, retention, due, invoiceId };
}

/** What retention the customer still holds on a project. */
async function retentionHeld(client, { companyId, projectId }) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(l.debit_laari - l.credit_laari), 0) AS b FROM journal_lines l JOIN accounts a ON a.id = l.account_id
      WHERE a.company_id = $1 AND a.code = $2 AND l.project_id = $3`,
    [companyId, RETENTION[0], projectId]
  );
  return BigInt(rows[0].b);
}

/** Retention released (at completion, or at the end of defects): invoiced now, out of what the customer held. */
async function releaseRetention(client, { companyId, userId, projectId, amount, on }) {
  await assumeIdentity(client, { companyId, userId });
  const p = await project(client, { companyId, projectId });
  const value = toLaari(amount);
  const held = await retentionHeld(client, { companyId, projectId });
  if (value <= 0n) throw new Error("How much is released?");
  if (value > held) throw new Error(`Only MVR ${formatLaari(held)} of retention is held on this project.`);
  const acc = await stock.account(client, companyId, RETENTION);
  const { rows: co } = await client.query("SELECT gst_registered FROM companies WHERE id = $1", [companyId]);
  const { invoice } = await sales.raise(client, {
    companyId, userId, counterpartyId: p.counterparty_id, issueDate: on, projectId: p.id,
    subject: `${p.name}: retention released`,
    gstTreatment: co[0]?.gst_registered ? "exclusive" : "none_unregistered",
    lines: [{ description: `Retention released on ${p.name}`, amount: formatLaari(value).replace(/,/g, ""), accountId: acc }],
  });
  await sales.post(client, { companyId, userId, invoiceId: invoice.id });
  return { invoiceId: invoice.id };
}

/**
 * Everything the project page shows, every figure from the ledger: the
 * budget, spent and committed by kind of cost; the forecast; the claims; and
 * what has been invoiced, received and retained.
 */
async function summary(client, { companyId, projectId }) {
  const p = await project(client, { companyId, projectId });
  const { rows: spentRows } = await client.query(
    `SELECT a.id, a.code, a.name, SUM(l.debit_laari - l.credit_laari) AS spent FROM journal_lines l JOIN accounts a ON a.id = l.account_id
      WHERE a.company_id = $1 AND l.project_id = $2 AND a.type = 'expense' GROUP BY a.id`,
    [companyId, projectId]
  );
  const { rows: revenueRows } = await client.query(
    `SELECT COALESCE(SUM(l.credit_laari - l.debit_laari), 0) AS r FROM journal_lines l JOIN accounts a ON a.id = l.account_id
      WHERE a.company_id = $1 AND l.project_id = $2 AND a.type = 'income'`,
    [companyId, projectId]
  );
  const { rows: budgetRows } = await client.query(
    `SELECT b.account_id AS id, a.code, a.name, b.amount_laari FROM project_budgets b JOIN accounts a ON a.id = b.account_id WHERE b.project_id = $1 AND b.company_id = $2`,
    [projectId, companyId]
  );
  const { rows: commitments } = await client.query(
    `SELECT c.*, a.code, a.name AS account_name, cp.name AS supplier,
            COALESCE((SELECT SUM(b.net_laari) FROM bills b WHERE b.commitment_id = c.id AND b.status = 'posted'), 0) AS billed
       FROM project_commitments c JOIN accounts a ON a.id = c.account_id LEFT JOIN counterparties cp ON cp.id = c.counterparty_id
      WHERE c.project_id = $1 AND c.company_id = $2 ORDER BY c.created_at`,
    [projectId, companyId]
  );
  const { rows: invoiced } = await client.query(
    `SELECT COALESCE(SUM(s.gross_laari), 0) AS gross,
            COALESCE(SUM((SELECT COALESCE(SUM(a.amount_laari), 0) FROM receipt_allocations a JOIN receipts r ON r.id = a.receipt_id AND r.voided_at IS NULL WHERE a.invoice_id = s.id)), 0) AS paid
       FROM sales_invoices s WHERE s.company_id = $1 AND s.project_id = $2 AND s.status = 'posted' AND s.voided_at IS NULL`,
    [companyId, projectId]
  );
  const cl = await claims(client, { companyId, projectId });

  const byAccount = new Map();
  const row = (id, code, name) => {
    if (!byAccount.has(id)) byAccount.set(id, { accountId: id, code, name, budget: 0n, spent: 0n, committed: 0n });
    return byAccount.get(id);
  };
  for (const r of budgetRows) row(r.id, r.code, r.name).budget = BigInt(r.amount_laari);
  for (const r of spentRows) row(r.id, r.code, r.name).spent = BigInt(r.spent);
  const commitmentsOut = commitments.map((c) => {
    const left = c.closed_at ? 0n : BigInt(c.amount_laari) - BigInt(c.billed);
    const open = left > 0n ? left : 0n;
    row(c.account_id, c.code, c.account_name).committed += open;
    return { id: c.id, description: c.description, supplier: c.supplier, account: c.account_name, amount: formatLaari(BigInt(c.amount_laari)), billed: formatLaari(BigInt(c.billed)), open: formatLaari(open), closed: Boolean(c.closed_at) };
  });

  const lines = [...byAccount.values()].sort((a, b) => a.code.localeCompare(b.code));
  const sum = (k) => lines.reduce((a, l) => a + l[k], 0n);
  // What each kind of cost will come to: its budget, unless what is spent and
  // committed already goes past it.
  const forecastOf = (l) => (l.spent + l.committed > l.budget ? l.spent + l.committed : l.budget);
  const spent = sum("spent");
  const committed = sum("committed");
  const budget = sum("budget");
  const forecast = lines.reduce((a, l) => a + forecastOf(l), 0n);
  const contract = p.contract_laari === null ? null : BigInt(p.contract_laari);
  const certifiedClaims = cl.filter((c) => c.certified_to_date_laari !== null);
  const certifiedToDate = certifiedClaims.length ? BigInt(certifiedClaims[certifiedClaims.length - 1].certified_to_date_laari) : 0n;
  const claimedToDate = cl.length ? BigInt(cl[cl.length - 1].claimed_to_date_laari) : 0n;
  const held = await retentionHeld(client, { companyId, projectId });
  const f = formatLaari;
  return {
    id: p.id,
    name: p.name,
    customerId: p.counterparty_id,
    contract: contract === null ? null : f(contract),
    retentionPct: p.retention_bp / 100,
    retentionCapPct: p.retention_cap_bp === null ? null : p.retention_cap_bp / 100,
    startsOn: p.starts_on,
    endsOn: p.ends_on,
    budget: f(budget),
    spent: f(spent),
    committed: f(committed),
    forecastCost: f(forecast),
    costToComplete: f(forecast - spent),
    forecastMargin: contract === null ? null : f(contract - forecast),
    percentComplete: forecast > 0n ? Number((spent * 1000n) / forecast) / 10 : null,
    overBudget: lines.filter((l) => l.budget > 0n && l.spent + l.committed > l.budget).map((l) => l.name),
    revenue: f(BigInt(revenueRows[0].r)),
    claimed: f(claimedToDate),
    certified: f(certifiedToDate),
    retentionHeld: f(held),
    invoiced: f(BigInt(invoiced[0].gross)),
    received: f(BigInt(invoiced[0].paid)),
    lines: lines.map((l) => ({ accountId: l.accountId, name: l.name, budget: f(l.budget), spent: f(l.spent), committed: f(l.committed), forecast: f(forecastOf(l)), over: l.budget > 0n && l.spent + l.committed > l.budget })),
    commitments: commitmentsOut,
    claims: cl.map((c) => ({
      id: c.id, number: c.number, periodTo: c.period_to, claimed: f(BigInt(c.claimed_to_date_laari)),
      certified: c.certified_to_date_laari === null ? null : f(BigInt(c.certified_to_date_laari)), certifiedOn: c.certified_on,
      certificate: c.certificate_laari === null ? null : f(BigInt(c.certificate_laari)),
      retention: c.retention_laari === null ? null : f(BigInt(c.retention_laari)),
      invoiced: c.certificate_laari === null ? null : f(BigInt(c.certificate_laari) - BigInt(c.retention_laari || 0)),
      invoiceId: c.invoice_id,
    })),
  };
}

/** The ledger lines behind a figure: what was spent (on one kind of cost, or all), the revenue, or the retention. */
async function entries(client, { companyId, projectId, figure, accountId }) {
  const where = {
    spent: "a.type = 'expense'" + (accountId ? " AND a.id = $3" : ""),
    revenue: "a.type = 'income'",
    retention: `a.code = '${RETENTION[0]}'`,
  }[figure];
  if (!where) throw new Error("Which figure?");
  const { rows } = await client.query(
    `SELECT e.entry_no, e.entry_date, e.narrative, a.name AS account, l.memo, l.debit_laari, l.credit_laari
       FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
      WHERE a.company_id = $1 AND l.project_id = $2 AND ${where}
      ORDER BY e.entry_date DESC, e.entry_no DESC LIMIT 300`,
    accountId && figure === "spent" ? [companyId, projectId, accountId] : [companyId, projectId]
  );
  return rows.map((r) => ({
    entryNo: String(r.entry_no), on: r.entry_date, narrative: r.narrative, account: r.account, memo: r.memo,
    amount: formatLaari(BigInt(r.debit_laari) - BigInt(r.credit_laari)),
  }));
}

async function list(client, { companyId }) {
  const { rows } = await client.query("SELECT id FROM projects WHERE company_id = $1 AND archived_at IS NULL ORDER BY lower(name)", [companyId]);
  const out = [];
  for (const r of rows) out.push(await summary(client, { companyId, projectId: r.id }));
  return out;
}

module.exports = { RETENTION, configure, setBudget, commit, billAgainst, claim, certify, retentionOn, retentionHeld, releaseRetention, summary, entries, list };

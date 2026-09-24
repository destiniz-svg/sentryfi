/**
 * Payroll: people, each month's run, and what it owes.
 *
 * A run is made for a month with everyone employed in it. What happened in the
 * month (overtime, unpaid days, a bonus, service charge, an advance repaid) is
 * entered per person; every figure is worked out by payrollRules.js with how
 * it was reached, and worked out again from the person's current details for
 * as long as the run is a draft. Approving it freezes every line and posts one
 * entry, in totals, at the month's end:
 *
 *   wages (by project), service charge, employer pension and gratuity   debit
 *   net pay to pay (2410), tax withheld (2260), pension to pay (2420),
 *   advances repaid (1330), other deductions (2430), gratuity owed (2440) credit
 *
 * Then each of the wages, the tax and the pension is paid on its own day from
 * a bank or cash account, which clears what the run owes. A run with nothing
 * paid out can be reopened with a reason: its entry is reversed, never erased.
 */
const { postEntry, reverseEntry, assumeIdentity } = require("./post");
const { toLaari, formatLaari } = require("./money");
const { account } = require("./stock");
const R = require("./payrollRules");

const ACCOUNTS = {
  wages: ["5210", "Salaries and wages", "expense"],
  serviceCharge: ["5220", "Service charge paid to staff", "expense"],
  pension: ["5230", "Employer pension contributions", "expense"],
  gratuity: ["5240", "End-of-service gratuity", "expense"],
  advances: ["1330", "Staff advances", "asset"],
  net: ["2410", "Wages to pay", "liability"],
  tax: ["2260", "Employee tax withheld to pay", "liability"],
  pensionOwed: ["2420", "Pension to pay", "liability"],
  deductions: ["2430", "Deductions kept from pay", "liability"],
  gratuityOwed: ["2440", "End-of-service gratuity owed", "liability"],
};

const L = (v) => (v === null || v === undefined || v === "" ? 0n : toLaari(String(v).replace(/,/g, "")));
const F = (l) => formatLaari(BigInt(l));
const iso = (d) => (d ? (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)) : null);

/** BigInts to text, all the way down, for keeping and sending. */
function plain(v) {
  if (typeof v === "bigint") return F(v);
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}

// ------------------------------------------------------------------ settings

async function company(client, { companyId }) {
  const { rows } = await client.query("SELECT tax_pack, industry, base_currency FROM companies WHERE id = $1", [companyId]);
  const { rows: s } = await client.query("SELECT * FROM payroll_settings WHERE company_id = $1", [companyId]);
  const c = rows[0] || {};
  return {
    pack: c.tax_pack || "MV",
    currency: c.base_currency || "MVR",
    tourism: c.industry === "tourism",
    size: s[0]?.business_size || "small",
    payDay: s[0]?.pay_day || null,
    wpsEmployerId: s[0]?.wps_employer_id || null,
    wpsRoutingCode: s[0]?.wps_routing_code || null,
  };
}

async function saveSettings(client, { companyId, size, payDay, wpsEmployerId, wpsRoutingCode }) {
  await client.query(
    `INSERT INTO payroll_settings (company_id, business_size, pay_day, wps_employer_id, wps_routing_code)
     VALUES ($1, COALESCE($2,'small'), $3, $4, $5)
     ON CONFLICT (company_id) DO UPDATE SET business_size = COALESCE($2, payroll_settings.business_size), pay_day = $3,
       wps_employer_id = $4, wps_routing_code = $5, updated_at = now()`,
    [companyId, size || null, payDay || null, wpsEmployerId || null, wpsRoutingCode || null]
  );
  return company(client, { companyId });
}

// ------------------------------------------------------------------ people

async function advanceBalances(client, { companyId }) {
  const { rows } = await client.query(
    `SELECT a.employee_id, SUM(a.amount_laari) AS lent, MAX(a.instalment_laari) AS instalment,
            COALESCE((SELECT SUM(l.advance_laari) FROM pay_run_lines l JOIN pay_runs r ON r.id = l.run_id
                       WHERE l.employee_id = a.employee_id AND r.status = 'approved'), 0) AS repaid
       FROM staff_advances a WHERE a.company_id = $1 GROUP BY a.employee_id`,
    [companyId]
  );
  return new Map(rows.map((r) => [r.employee_id, { owed: BigInt(r.lent) - BigInt(r.repaid), instalment: BigInt(r.instalment) }]));
}

function employeeOf(row, items) {
  const mine = items.filter((i) => i.employee_id === row.id);
  return {
    id: row.id,
    name: row.name,
    nationality: row.nationality,
    dob: iso(row.dob),
    joinedOn: iso(row.joined_on),
    leftOn: iso(row.left_on),
    basic: BigInt(row.basic_laari),
    allowances: mine.filter((i) => i.kind === "allowance").map((i) => ({ name: i.name, amount: BigInt(i.amount_laari), pensionable: i.pensionable })),
    deductions: mine.filter((i) => i.kind === "deduction").map((i) => ({ name: i.name, amount: BigInt(i.amount_laari) })),
    pension: { member: row.pension_member, scheme: row.pension_scheme },
  };
}

async function loadPeople(client, { companyId, ids = null }) {
  const { rows } = await client.query(
    `SELECT * FROM employees WHERE company_id = $1 ${ids ? "AND id = ANY($2::uuid[])" : ""} ORDER BY lower(name)`,
    ids ? [companyId, ids] : [companyId]
  );
  const { rows: items } = await client.query("SELECT * FROM employee_pay_items WHERE company_id = $1 ORDER BY position", [companyId]);
  return { rows, items };
}

/** Everyone on the payroll, with what they are paid, what they owe back, and their leave. */
async function people(client, { companyId }) {
  const c = await company(client, { companyId });
  const { rows, items } = await loadPeople(client, { companyId });
  const owed = await advanceBalances(client, { companyId });
  const today = new Date().toISOString().slice(0, 10);
  const { rows: taken } = await client.query(
    `SELECT l.employee_id, SUM(COALESCE((l.inputs->>'leaveTaken')::numeric, 0)) AS days
       FROM pay_run_lines l JOIN pay_runs r ON r.id = l.run_id WHERE r.company_id = $1 AND r.status = 'approved' GROUP BY l.employee_id`,
    [companyId]
  );
  const takenBy = new Map(taken.map((t) => [t.employee_id, Number(t.days)]));
  return rows.map((r) => {
    const mine = items.filter((i) => i.employee_id === r.id);
    return {
      id: r.id,
      employeeNo: r.employee_no,
      name: r.name,
      jobTitle: r.job_title,
      nationality: r.nationality,
      idNumber: r.id_number,
      tin: r.tin,
      dob: iso(r.dob),
      email: r.email,
      phone: r.phone,
      joinedOn: iso(r.joined_on),
      leftOn: iso(r.left_on),
      basic: F(r.basic_laari),
      pensionMember: r.pension_member,
      pensionScheme: r.pension_scheme,
      serviceCharge: r.service_charge,
      bankName: r.bank_name,
      bankAccount: r.bank_account,
      bankAccountName: r.bank_account_name,
      wpsPersonId: r.wps_person_id,
      wpsRoutingCode: r.wps_routing_code,
      projectId: r.project_id,
      userId: r.user_id,
      archived: Boolean(r.archived_at),
      items: mine.map((i) => ({ id: i.id, kind: i.kind, name: i.name, amount: F(i.amount_laari), pensionable: i.pensionable })),
      advanceOwed: owed.has(r.id) ? F(owed.get(r.id).owed) : "0.00",
      leave: R.leaveBalance({ pack: c.pack, joinedOn: r.joined_on, on: r.left_on && iso(r.left_on) < today ? r.left_on : today, taken: takenBy.get(r.id) || 0 }),
    };
  });
}

const TEXT = ["employee_no", "name", "job_title", "id_number", "tin", "email", "phone", "bank_name", "bank_account", "bank_account_name", "wps_person_id", "wps_routing_code"];

/** Adding or changing a person, with their allowances and agreed deductions. */
async function savePerson(client, { companyId, userId, id, p }) {
  await assumeIdentity(client, { companyId, userId });
  const clean = (v) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim());
  if (!clean(p.name)) throw new Error("Give their name.");
  if (!p.joinedOn) throw new Error("When did they start?");
  if (p.leftOn && p.leftOn < p.joinedOn) throw new Error("They cannot leave before they started.");
  const basic = L(p.basic);
  if (basic < 0n) throw new Error("A basic salary is zero or more.");
  if (p.projectId) {
    const { rows } = await client.query("SELECT 1 FROM projects WHERE id = $1 AND company_id = $2", [p.projectId, companyId]);
    if (!rows.length) throw new Error("That project is not in these books.");
  }
  if (p.userId) {
    const { rows } = await client.query("SELECT 1 FROM memberships WHERE user_id = $1 AND company_id = $2", [p.userId, companyId]);
    if (!rows.length) throw new Error("That person does not sign in to this company.");
  }
  const values = {
    employee_no: clean(p.employeeNo), name: clean(p.name), job_title: clean(p.jobTitle), id_number: clean(p.idNumber), tin: clean(p.tin),
    email: clean(p.email), phone: clean(p.phone), bank_name: clean(p.bankName), bank_account: clean(p.bankAccount), bank_account_name: clean(p.bankAccountName),
    wps_person_id: clean(p.wpsPersonId), wps_routing_code: clean(p.wpsRoutingCode),
  };
  const nat = (clean(p.nationality) || "MV").toUpperCase();
  if (!/^[A-Z]{2}$/.test(nat)) throw new Error("Nationality is a two-letter country code, like MV or BD.");
  const common = [
    ...TEXT.map((k) => values[k]), nat, p.dob || null, p.joinedOn, p.leftOn || null, basic.toString(),
    p.pensionMember === undefined ? null : p.pensionMember, clean(p.pensionScheme), Boolean(p.serviceCharge), p.projectId || null, p.userId || null,
  ];
  let personId = id;
  if (id) {
    const { rows } = await client.query(
      `UPDATE employees SET ${TEXT.map((k, i) => `${k} = $${i + 3}`).join(", ")},
         nationality = $15, dob = $16, joined_on = $17, left_on = $18, basic_laari = $19, pension_member = $20, pension_scheme = $21,
         service_charge = $22, project_id = $23, user_id = $24,
         archived_at = CASE WHEN $25::boolean IS NULL THEN archived_at WHEN $25 THEN COALESCE(archived_at, now()) ELSE NULL END
       WHERE id = $1 AND company_id = $2 RETURNING id`,
      [id, companyId, ...common, p.archived ?? null]
    );
    if (!rows.length) throw new Error("That person is not on this payroll.");
  } else {
    const { rows } = await client.query(
      `INSERT INTO employees (company_id, ${TEXT.join(", ")}, nationality, dob, joined_on, left_on, basic_laari, pension_member, pension_scheme,
         service_charge, project_id, user_id, created_by)
       VALUES ($1, ${TEXT.map((_, i) => `$${i + 2}`).join(", ")}, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24) RETURNING id`,
      [companyId, ...common, userId]
    );
    personId = rows[0].id;
  }
  if (Array.isArray(p.items)) {
    await client.query("DELETE FROM employee_pay_items WHERE employee_id = $1 AND company_id = $2", [personId, companyId]);
    for (const [i, it] of p.items.entries()) {
      const amount = L(it.amount);
      if (!clean(it.name) || amount <= 0n) continue;
      if (!["allowance", "deduction"].includes(it.kind)) throw new Error("A pay item is an allowance or a deduction.");
      await client.query(
        "INSERT INTO employee_pay_items (company_id, employee_id, kind, name, amount_laari, pensionable, position) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [companyId, personId, it.kind, clean(it.name), amount.toString(), it.kind === "allowance" && Boolean(it.pensionable), i]
      );
    }
  }
  return { id: personId };
}

/** Money lent to someone now, from a bank or cash account, repaid from their pay. */
async function giveAdvance(client, { companyId, userId, employeeId, amount, instalment, givenOn, fromAccountId, note }) {
  await assumeIdentity(client, { companyId, userId });
  const { rows: e } = await client.query("SELECT name FROM employees WHERE id = $1 AND company_id = $2", [employeeId, companyId]);
  if (!e.length) throw new Error("That person is not on this payroll.");
  const lent = L(amount);
  const each = L(instalment || amount);
  if (lent <= 0n) throw new Error("How much is lent?");
  if (each <= 0n || each > lent) throw new Error("Each month's repayment is above zero and no more than the advance.");
  const { rows: from } = await client.query("SELECT id, name FROM accounts WHERE id = $1 AND company_id = $2 AND (code LIKE '11%' OR code LIKE '12%')", [fromAccountId, companyId]);
  if (!from.length) throw new Error("Pay it from a bank or cash account.");
  const adv = await account(client, companyId, ACCOUNTS.advances);
  const memo = `Advance to ${e[0].name}`;
  const entry = await postEntry(client, {
    companyId, userId, date: givenOn, source: "payroll", narrative: memo,
    lines: [{ accountId: adv, debit: lent, memo }, { accountId: from[0].id, credit: lent, memo }],
  });
  await client.query(
    "INSERT INTO staff_advances (company_id, employee_id, amount_laari, instalment_laari, given_on, entry_id, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [companyId, employeeId, lent.toString(), each.toString(), givenOn, entry.id, note || null, userId]
  );
  return { entryNo: String(entry.entryNo), from: from[0].name };
}

// ------------------------------------------------------------------ runs

async function runRow(client, { companyId, runId }) {
  const { rows } = await client.query("SELECT * FROM pay_runs WHERE id = $1 AND company_id = $2", [runId, companyId]);
  if (!rows.length) throw new Error("That pay run is not in these books.");
  return rows[0];
}
const mustDraft = (run) => {
  if (run.status !== "draft") throw new Error("This run is approved. Reopen it, or make an adjustment run, to change it.");
};

/** Someone employed for any day of the month. */
const inMonth = (e, period) => {
  const { start, end } = R.monthOf(period);
  return iso(e.joined_on) <= end && (!e.left_on || iso(e.left_on) >= start) && !e.archived_at;
};

/** A new run for a month: everyone employed in it (a regular run) or no one yet (an adjustment). */
async function createRun(client, { companyId, userId, period, kind = "regular", payDate, note }) {
  await assumeIdentity(client, { companyId, userId });
  const { end } = R.monthOf(period);
  const c = await company(client, { companyId });
  const day = payDate || (c.pack === "AE" ? R.dueFor(period, 1) : end);
  let run;
  try {
    const { rows } = await client.query(
      "INSERT INTO pay_runs (company_id, period, kind, pay_date, note, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [companyId, period, kind, day, note || null, userId]
    );
    run = rows[0];
  } catch (err) {
    if (err.code === "23505") throw new Error(`There is already a pay run for ${period}. Open it, or make an adjustment run.`);
    throw err;
  }
  if (kind === "regular") {
    const { rows } = await client.query("SELECT * FROM employees WHERE company_id = $1", [companyId]);
    const owed = await advanceBalances(client, { companyId });
    for (const e of rows.filter((x) => inMonth(x, period))) {
      const o = owed.get(e.id);
      const advance = o && o.owed > 0n ? (o.instalment < o.owed ? o.instalment : o.owed) : 0n;
      await client.query("INSERT INTO pay_run_lines (company_id, run_id, employee_id, inputs) VALUES ($1,$2,$3,$4)", [
        companyId, run.id, e.id, JSON.stringify(advance > 0n ? { advance: F(advance) } : {}),
      ]);
    }
  }
  return run;
}

/** What was entered for a person this month, as the rules take it. */
function inputsOf(raw = {}) {
  const list = (a) => (Array.isArray(a) ? a.filter((x) => x && L(x.amount) > 0n).map((x) => ({ name: String(x.name || "").trim(), amount: L(x.amount) })) : []);
  return {
    unpaidDays: raw.unpaidDays || "",
    overtime: raw.overtime || {},
    bonus: L(raw.bonus),
    serviceCharge: L(raw.serviceCharge),
    other: list(raw.other),
    advance: L(raw.advance),
    otherDeductions: list(raw.otherDeductions),
    leaveDays: raw.leaveDays || "",
    noticePay: L(raw.noticePay),
  };
}

/**
 * A run with every line worked out. A draft is worked out now, from each
 * person's current details; an approved run is read back as it was frozen.
 */
async function loadRun(client, { companyId, runId }) {
  const run = await runRow(client, { companyId, runId });
  const c = await company(client, { companyId });
  const { rows: lines } = await client.query("SELECT * FROM pay_run_lines WHERE run_id = $1 AND company_id = $2", [runId, companyId]);
  const { rows, items } = await loadPeople(client, { companyId, ids: lines.map((l) => l.employee_id) });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const owed = await advanceBalances(client, { companyId });
  const out = lines.map((l) => {
    const row = byId.get(l.employee_id);
    const person = { id: row.id, name: row.name, jobTitle: row.job_title, nationality: row.nationality, employeeNo: row.employee_no, projectId: row.project_id, bankAccount: row.bank_account, bankName: row.bank_name, serviceCharge: row.service_charge, tin: row.tin, idNumber: row.id_number, wpsPersonId: row.wps_person_id, wpsRoutingCode: row.wps_routing_code, email: row.email, phone: row.phone };
    if (run.status === "approved") return { lineId: l.id, person, inputs: l.inputs, slip: l.slip, frozen: true };
    const slip = R.payslip({ pack: c.pack, period: run.period, employee: employeeOf(row, items), inputs: inputsOf(l.inputs), company: c });
    const o = owed.get(row.id);
    if (L(l.inputs?.advance) > (o ? o.owed : 0n)) slip.warnings.push(`The advance repaid is more than the ${F(o ? o.owed : 0n)} still owed.`);
    if (!row.bank_account) slip.warnings.push("No bank account on file: pay them another way, or add one.");
    return { lineId: l.id, person, inputs: l.inputs, slip, frozen: false };
  });
  out.sort((a, b) => a.person.name.localeCompare(b.person.name));
  return { run, company: c, lines: out };
}

/** Totals over a run's lines (frozen text or live BigInt). */
function totals(lines) {
  const t = { gross: 0n, net: 0n, tax: 0n, employeePension: 0n, employerPension: 0n, gratuity: 0n, advance: 0n, otherDeductions: 0n, serviceCharge: 0n };
  for (const { slip: s } of lines) for (const k of Object.keys(t)) t[k] += typeof s[k] === "bigint" ? s[k] : L(s[k]);
  t.employerCost = t.gross + t.employerPension + t.gratuity;
  return t;
}

/** The run as the screens see it, with last month's figures to compare with. */
async function showRun(client, { companyId, runId }) {
  const { run, company: c, lines } = await loadRun(client, { companyId, runId });
  const t = totals(lines);
  // The previous approved regular run, for what changed.
  const { rows: prev } = await client.query(
    "SELECT id FROM pay_runs WHERE company_id = $1 AND status = 'approved' AND kind = 'regular' AND period < $2 ORDER BY period DESC LIMIT 1",
    [companyId, run.period]
  );
  let before = null;
  let beforeNet = new Map();
  if (prev.length) {
    const p = await loadRun(client, { companyId, runId: prev[0].id });
    before = plain(totals(p.lines));
    beforeNet = new Map(p.lines.map((l) => [l.person.id, L(l.slip.net)]));
  }
  const pack = R.payrollPack(c.pack);
  const { rows: paid } = await client.query(
    `SELECT p.kind, p.amount_laari, p.paid_on::text AS paid_on, p.reference, a.name AS from_name, e.entry_no
       FROM payroll_payments p JOIN accounts a ON a.id = p.from_account_id JOIN journal_entries e ON e.id = p.entry_id
      WHERE p.run_id = $1 AND p.company_id = $2`,
    [runId, companyId]
  );
  const { rows: entry } = run.entry_id ? await client.query("SELECT entry_no FROM journal_entries WHERE id = $1", [run.entry_id]) : { rows: [] };
  const owes = [
    { kind: "wages", label: "Net pay to staff", amount: t.net, due: run.pay_date ? iso(run.pay_date) : null },
    pack.tax && { kind: "tax", label: `${pack.tax.name} (${pack.tax.form})`, amount: t.tax, due: R.dueFor(run.period, pack.tax.dueDay), to: pack.tax.authority, portal: pack.tax.portal },
    pack.pension && { kind: "pension", label: `${pack.pension.name}, both shares`, amount: t.employeePension + t.employerPension, due: R.dueFor(run.period, pack.pension.dueDay), to: pack.pension.authority, portal: pack.pension.portal },
  ].filter((o) => o && o.amount > 0n).map((o) => ({ ...o, paid: paid.find((p) => p.kind === o.kind) || null }));
  // What approving puts in the books, in the same totals approve() posts.
  const name = (k) => ACCOUNTS[k][1];
  const books = [
    [name("wages"), t.gross - t.serviceCharge, 0n], [name("serviceCharge"), t.serviceCharge, 0n], [name("pension"), t.employerPension, 0n], [name("gratuity"), t.gratuity, 0n],
    [name("net"), 0n, t.net], [name("tax"), 0n, t.tax], [name("pensionOwed"), 0n, t.employeePension + t.employerPension], [name("advances"), 0n, t.advance],
    [name("deductions"), 0n, t.otherDeductions], [name("gratuityOwed"), 0n, t.gratuity],
  ].filter(([, d, c]) => d > 0n || c > 0n).map(([account, debit, credit]) => ({ account, debit, credit }));
  return plain({
    books,
    id: run.id, period: run.period, kind: run.kind, status: run.status, payDate: iso(run.pay_date), note: run.note,
    approvedAt: run.approved_at, publishedAt: run.published_at, entryNo: entry[0] ? String(entry[0].entry_no) : null,
    pack: c.pack, currency: c.currency,
    totals: t, before, owes,
    lines: lines.map((l) => ({
      ...l,
      change: beforeNet.has(l.person.id) ? (typeof l.slip.net === "bigint" ? l.slip.net : L(l.slip.net)) - beforeNet.get(l.person.id) : null,
      isNew: prev.length > 0 && !beforeNet.has(l.person.id),
    })),
    blockers: lines.flatMap((l) => (l.slip.blockers || []).map((b) => `${l.person.name}: ${b}`)),
    warnings: lines.reduce((a, l) => a + (l.slip.warnings || []).length, 0),
  });
}

async function runs(client, { companyId }) {
  const { rows } = await client.query("SELECT id FROM pay_runs WHERE company_id = $1 ORDER BY period DESC, created_at DESC LIMIT 36", [companyId]);
  const out = [];
  for (const r of rows) {
    const s = await showRun(client, { companyId, runId: r.id });
    out.push({ id: s.id, period: s.period, kind: s.kind, status: s.status, payDate: s.payDate, people: s.lines.length, gross: s.totals.gross, net: s.totals.net, employerCost: s.totals.employerCost, owes: s.owes, blockers: s.blockers.length, warnings: s.warnings });
  }
  return out;
}

/**
 * What was entered for one person this month. Only the fields sent change, so
 * two cells saved one after the other never undo each other; an empty value
 * clears its field.
 */
async function setInputs(client, { companyId, runId, employeeId, inputs: sent }) {
  const run = await runRow(client, { companyId, runId });
  mustDraft(run);
  const { rows: had } = await client.query("SELECT inputs FROM pay_run_lines WHERE run_id = $1 AND company_id = $2 AND employee_id = $3", [runId, companyId, employeeId]);
  if (!had.length) throw new Error("That person is not on this run.");
  const inputs = { ...had[0].inputs, ...sent, overtime: { ...(had[0].inputs.overtime || {}), ...(sent.overtime || {}) } };
  const clean = {};
  for (const k of ["unpaidDays", "leaveDays", "leaveTaken"]) if (inputs[k] !== undefined && String(inputs[k]).trim() !== "") clean[k] = String(inputs[k]).trim();
  for (const k of ["bonus", "serviceCharge", "advance", "noticePay"]) if (inputs[k] !== undefined && L(inputs[k]) !== 0n) clean[k] = F(L(inputs[k]));
  if (inputs.overtime) {
    const ot = Object.fromEntries(Object.entries(inputs.overtime).filter(([, v]) => String(v ?? "").trim() !== "").map(([k, v]) => [k, String(v).trim()]));
    if (Object.keys(ot).length) clean.overtime = ot;
  }
  for (const k of ["other", "otherDeductions"]) {
    if (Array.isArray(inputs[k])) {
      const list = inputs[k].filter((x) => x && L(x.amount) > 0n).map((x) => ({ name: String(x.name || "").trim().slice(0, 80), amount: F(L(x.amount)) }));
      if (list.length) clean[k] = list;
    }
  }
  // Check it works out before keeping it.
  R.payslip({ pack: "GENERIC", period: run.period, employee: { basic: 0n }, inputs: inputsOf(clean) });
  const { rows } = await client.query("UPDATE pay_run_lines SET inputs = $4 WHERE run_id = $1 AND company_id = $2 AND employee_id = $3 RETURNING id", [runId, companyId, employeeId, JSON.stringify(clean)]);
  if (!rows.length) throw new Error("That person is not on this run.");
  return clean;
}

async function addToRun(client, { companyId, runId, employeeId }) {
  const run = await runRow(client, { companyId, runId });
  mustDraft(run);
  const { rows } = await client.query("SELECT 1 FROM employees WHERE id = $1 AND company_id = $2", [employeeId, companyId]);
  if (!rows.length) throw new Error("That person is not on this payroll.");
  await client.query("INSERT INTO pay_run_lines (company_id, run_id, employee_id) VALUES ($1,$2,$3) ON CONFLICT (run_id, employee_id) DO NOTHING", [companyId, runId, employeeId]);
}
async function removeFromRun(client, { companyId, runId, employeeId }) {
  mustDraft(await runRow(client, { companyId, runId }));
  await client.query("DELETE FROM pay_run_lines WHERE run_id = $1 AND company_id = $2 AND employee_id = $3", [runId, companyId, employeeId]);
}
async function deleteRun(client, { companyId, runId }) {
  mustDraft(await runRow(client, { companyId, runId }));
  await client.query("DELETE FROM pay_runs WHERE id = $1 AND company_id = $2", [runId, companyId]);
}

/** Service charge collected, less the admin fee, shared among those who earn it by the days each was paid for. */
async function shareServiceCharge(client, { companyId, runId, collected, adminFeeBp = 0 }) {
  const { run, company: c, lines } = await loadRun(client, { companyId, runId });
  mustDraft(run);
  const pack = R.payrollPack(c.pack);
  if (!pack.serviceCharge) throw new Error("Service charge is shared this way under Maldivian law only.");
  if (adminFeeBp < 0 || adminFeeBp > pack.serviceCharge.adminFeeMaxBp) throw new Error(`The admin fee kept can be at most ${pack.serviceCharge.adminFeeMaxBp / 100}% of what was collected.`);
  const who = lines.filter((l) => l.person.serviceCharge);
  if (!who.length) throw new Error("Nobody on this run is marked as sharing in service charge.");
  const r = R.shareServiceCharge({ collected: L(collected), adminFeeBp, people: who.map((l) => ({ id: l.person.id, days: String(l.slip.paidDays) })) });
  for (const s of r.shares) {
    const line = who.find((l) => l.person.id === s.id);
    await setInputs(client, { companyId, runId, employeeId: s.id, inputs: { ...line.inputs, serviceCharge: F(s.amount) } });
  }
  return plain({ pool: r.pool, fee: r.fee, people: r.shares.length });
}

/** Approving: nothing blocking, every line frozen, one entry in totals at the month's end. */
async function approve(client, { companyId, userId, runId }) {
  await assumeIdentity(client, { companyId, userId });
  const { run, lines } = await loadRun(client, { companyId, runId });
  mustDraft(run);
  if (!lines.length) throw new Error("There is nobody on this run.");
  const blockers = lines.flatMap((l) => l.slip.blockers.map((b) => `${l.person.name}: ${b}`));
  if (blockers.length) throw new Error(blockers[0]);
  const t = totals(lines);
  const acc = {};
  for (const [k, spec] of Object.entries(ACCOUNTS)) acc[k] = await account(client, companyId, spec);
  const month = R.monthOf(run.period);
  const memo = `Payroll ${run.period}${run.kind === "adjustment" ? " (adjustment)" : ""}, ${lines.length} ${lines.length === 1 ? "person" : "people"}`;

  // Wages by project, so a project's cost carries its people; service charge on its own line.
  const byProject = new Map();
  for (const l of lines) {
    const k = l.person.projectId || "";
    byProject.set(k, (byProject.get(k) || 0n) + l.slip.gross - l.slip.serviceCharge);
  }
  const entryLines = [];
  for (const [projectId, amount] of byProject) if (amount > 0n) entryLines.push({ accountId: acc.wages, debit: amount, projectId: projectId || null, memo });
  const dr = (k, amount) => amount > 0n && entryLines.push({ accountId: acc[k], debit: amount, memo });
  const cr = (k, amount) => amount > 0n && entryLines.push({ accountId: acc[k], credit: amount, memo });
  dr("serviceCharge", t.serviceCharge);
  dr("pension", t.employerPension);
  dr("gratuity", t.gratuity);
  cr("net", t.net);
  cr("tax", t.tax);
  cr("pensionOwed", t.employeePension + t.employerPension);
  cr("advances", t.advance);
  cr("deductions", t.otherDeductions);
  cr("gratuityOwed", t.gratuity);
  // A run of nothing but zero lines (everyone on unpaid leave) posts nothing.
  let entry = null;
  if (entryLines.length >= 2) {
    entry = await postEntry(client, { companyId, userId, date: month.end, source: "payroll", sourceId: run.id, narrative: memo, lines: entryLines });
  }
  for (const l of lines) {
    const s = l.slip;
    await client.query(
      `UPDATE pay_run_lines SET slip = $3, gross_laari = $4, net_laari = $5, tax_laari = $6, pension_employee_laari = $7, pension_employer_laari = $8,
         gratuity_laari = $9, advance_laari = $10, other_deductions_laari = $11, service_charge_laari = $12
       WHERE id = $1 AND company_id = $2`,
      [l.lineId, companyId, JSON.stringify(plain(s)), ...[s.gross, s.net, s.tax, s.employeePension, s.employerPension, s.gratuity, s.advance, s.otherDeductions, s.serviceCharge].map(String)]
    );
  }
  await client.query("UPDATE pay_runs SET status = 'approved', entry_id = $3, approved_by = $4, approved_at = now() WHERE id = $1 AND company_id = $2", [
    runId, companyId, entry ? entry.id : null, userId,
  ]);
  return { entryNo: entry ? String(entry.entryNo) : null, totals: plain(t) };
}

/** Taking an approval back, before anything is paid: the entry is reversed, the run is a draft again. */
async function reopen(client, { companyId, userId, runId, reason }) {
  await assumeIdentity(client, { companyId, userId });
  const run = await runRow(client, { companyId, runId });
  if (run.status !== "approved") throw new Error("This run is not approved.");
  if (!reason || !String(reason).trim()) throw new Error("Say why it is being reopened.");
  const { rows } = await client.query("SELECT 1 FROM payroll_payments WHERE run_id = $1 AND company_id = $2", [runId, companyId]);
  if (rows.length) throw new Error("Something from this run has been paid. Put it right with an adjustment run instead.");
  if (run.entry_id) await reverseEntry(client, { companyId, userId, entryId: run.entry_id, reason: `Payroll ${run.period} reopened: ${String(reason).trim()}` });
  await client.query("UPDATE pay_runs SET status = 'draft', entry_id = NULL, approved_by = NULL, approved_at = NULL, published_at = NULL WHERE id = $1 AND company_id = $2", [runId, companyId]);
}

/** Payslips visible to the people paid (those who sign in to Sentryfi). */
async function publish(client, { companyId, runId }) {
  const run = await runRow(client, { companyId, runId });
  if (run.status !== "approved") throw new Error("Approve the run before anyone sees a payslip.");
  await client.query("UPDATE pay_runs SET published_at = COALESCE(published_at, now()) WHERE id = $1 AND company_id = $2", [runId, companyId]);
}

/** Paying what a run owes: the wages, the tax, or the pension, in full, from one account. */
async function pay(client, { companyId, userId, runId, kind, fromAccountId, paidOn, reference }) {
  await assumeIdentity(client, { companyId, userId });
  const s = await showRun(client, { companyId, runId });
  if (s.status !== "approved") throw new Error("Approve the run before paying it.");
  const owe = s.owes.find((o) => o.kind === kind);
  if (!owe) throw new Error("This run owes nothing of that kind.");
  if (owe.paid) throw new Error(`That was paid on ${owe.paid.paid_on}.`);
  const { rows: from } = await client.query("SELECT id, name FROM accounts WHERE id = $1 AND company_id = $2 AND (code LIKE '11%' OR code LIKE '12%')", [fromAccountId, companyId]);
  if (!from.length) throw new Error("Pay it from a bank or cash account.");
  const amount = L(owe.amount);
  const liability = await account(client, companyId, ACCOUNTS[{ wages: "net", tax: "tax", pension: "pensionOwed" }[kind]]);
  const memo = `${owe.label}, ${s.period}`;
  const entry = await postEntry(client, {
    companyId, userId, date: paidOn, source: "payroll", sourceId: runId, narrative: memo,
    lines: [{ accountId: liability, debit: amount, memo }, { accountId: from[0].id, credit: amount, memo }],
  });
  await client.query(
    "INSERT INTO payroll_payments (company_id, run_id, kind, amount_laari, paid_on, from_account_id, reference, entry_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [companyId, runId, kind, amount.toString(), paidOn, from[0].id, reference ? String(reference).trim() : null, entry.id, userId]
  );
  return { entryNo: String(entry.entryNo), amount: F(amount), from: from[0].name };
}

// ------------------------------------------------------------------ files

const csv = (rows) => rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
const bare = (v) => String(v).replace(/,/g, "");

/** The files a run gives: the bank transfers (or the UAE WPS salary file), the tax schedule, the pension schedule. */
async function file(client, { companyId, runId, which }) {
  const s = await showRun(client, { companyId, runId });
  const c = await company(client, { companyId });
  if (which === "bank") {
    if (c.pack === "AE") {
      // UAE WPS Salary Information File: one EDR per person, one SCR control record.
      if (!c.wpsEmployerId || !c.wpsRoutingCode) throw new Error("Add the company's MOHRE establishment id and bank routing code in payroll settings first.");
      const month = R.monthOf(s.period);
      const missing = s.lines.filter((l) => !l.person.wpsPersonId || !l.person.wpsRoutingCode || !l.person.bankAccount);
      if (missing.length) throw new Error(`${missing[0].person.name} has no MOHRE person id, routing code or account.`);
      const edr = s.lines.map((l) => {
        // Fixed is the basic and allowances actually paid; variable is the rest. Together they are what reaches the account.
        const net = L(l.slip.net);
        const set = l.slip.earnings.filter((e) => e.key === "basic" || e.key === "allowance").reduce((a, e) => a + L(e.amount), 0n);
        const fixed = set < net ? set : net;
        return ["EDR", l.person.wpsPersonId, l.person.wpsRoutingCode, l.person.bankAccount, month.start, month.end, month.days,
          bare(F(fixed)), bare(F(net - fixed)), l.inputs?.unpaidDays || 0].join(",");
      });
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const stamp = `${String(now.getFullYear()).slice(2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const scr = ["SCR", c.wpsEmployerId, c.wpsRoutingCode, now.toISOString().slice(0, 10), `${pad(now.getHours())}${pad(now.getMinutes())}`,
        `${pad(month.m)}${month.y}`, edr.length, bare(s.totals.net), "AED", ""].join(",");
      return { name: `${c.wpsEmployerId}${stamp}.SIF`, type: "text/plain", body: [...edr, scr].join("\r\n") };
    }
    return {
      name: `salaries-${s.period}.csv`, type: "text/csv",
      body: csv([["Name", "Bank", "Account number", "Account name", `Amount (${s.currency})`, "Reference"],
        ...s.lines.filter((l) => L(l.slip.net) > 0n).map((l) => [l.person.name, l.person.bankName || "", l.person.bankAccount || "", l.person.name, bare(l.slip.net), `Salary ${s.period}`])]),
    };
  }
  if (which === "tax") {
    // The employee information the MIRA 601 asks for, one row a person; columns to match MIRA's sheet once confirmed.
    return {
      name: `mira-601-${s.period}.csv`, type: "text/csv",
      body: csv([["Employee", "ID card or passport", "TIN", "Nationality", "Gross pay", "Employee pension", "Taxable pay", "Tax withheld"],
        ...s.lines.map((l) => [l.person.name, l.person.idNumber || "", l.person.tin || "", l.person.nationality, bare(l.slip.gross), bare(l.slip.employeePension), bare(l.slip.taxable), bare(l.slip.tax)])]),
    };
  }
  if (which === "pension") {
    return {
      name: `pension-${s.period}.csv`, type: "text/csv",
      body: csv([["Employee", "ID card number", "Pensionable wage", "Employee share", "Employer share", "Total"],
        ...s.lines.filter((l) => L(l.slip.employeePension) > 0n).map((l) => {
          const base = l.slip.deductions.find((d) => d.key === "pension")?.note?.replace(/^on /, "") || "";
          return [l.person.name, l.person.idNumber || "", bare(base), bare(l.slip.employeePension), bare(l.slip.employerPension), bare(F(L(l.slip.employeePension) + L(l.slip.employerPension)))];
        })]),
    };
  }
  throw new Error("That file is the bank file, the tax schedule or the pension schedule.");
}

// ------------------------------------------------------------------ payslips

/** One payslip, with the year so far. */
async function payslip(client, { companyId, runId, employeeId }) {
  const s = await showRun(client, { companyId, runId });
  const line = s.lines.find((l) => l.person.id === employeeId);
  if (!line) throw new Error("That person is not on this run.");
  const { rows: ytd } = await client.query(
    `SELECT COALESCE(SUM(l.gross_laari),0) AS gross, COALESCE(SUM(l.tax_laari),0) AS tax, COALESCE(SUM(l.pension_employee_laari),0) AS pension, COALESCE(SUM(l.net_laari),0) AS net
       FROM pay_run_lines l JOIN pay_runs r ON r.id = l.run_id
      WHERE r.company_id = $1 AND l.employee_id = $2 AND r.status = 'approved' AND left(r.period, 4) = $3 AND r.period <= $4`,
    [companyId, employeeId, s.period.slice(0, 4), s.period]
  );
  const { rows: co } = await client.query("SELECT name, tin FROM companies WHERE id = $1", [companyId]);
  const people = await client.query("SELECT joined_on, id_number, tin, email, phone FROM employees WHERE id = $1", [employeeId]);
  const owed = (await advanceBalances(client, { companyId })).get(employeeId);
  return {
    company: { name: co[0].name, tin: co[0].tin || null },
    period: s.period, payDate: s.payDate, status: s.status, currency: s.currency, pack: s.pack,
    lineId: line.lineId,
    person: { ...line.person, joinedOn: iso(people.rows[0].joined_on), idNumber: people.rows[0].id_number, tin: people.rows[0].tin, email: people.rows[0].email, phone: people.rows[0].phone },
    slip: line.slip,
    ytd: plain({ gross: BigInt(ytd[0].gross), tax: BigInt(ytd[0].tax), pension: BigInt(ytd[0].pension), net: BigInt(ytd[0].net) }),
    advanceOwed: owed ? F(owed.owed) : null,
  };
}

/** A person's own published payslips, found through their sign-in. */
async function mine(client, { companyId, userId }) {
  const { rows } = await client.query(
    `SELECT r.id AS run_id, r.period, r.pay_date::text AS pay_date, l.net_laari, l.gross_laari, e.id AS employee_id
       FROM employees e JOIN pay_run_lines l ON l.employee_id = e.id JOIN pay_runs r ON r.id = l.run_id
      WHERE e.company_id = $1 AND e.user_id = $2 AND r.status = 'approved' AND r.published_at IS NOT NULL
      ORDER BY r.period DESC, r.created_at DESC`,
    [companyId, userId]
  );
  return rows.map((r) => ({ runId: r.run_id, employeeId: r.employee_id, period: r.period, payDate: r.pay_date, net: F(r.net_laari), gross: F(r.gross_laari) }));
}

/** Money accounts pay can go out of. */
async function payFrom(client, { companyId }) {
  const { rows } = await client.query(
    "SELECT id, code, name FROM accounts WHERE company_id = $1 AND archived_at IS NULL AND (code LIKE '11%' OR code LIKE '12%') AND type = 'asset' ORDER BY code",
    [companyId]
  );
  return rows;
}

module.exports = {
  ACCOUNTS, company, saveSettings, people, savePerson, giveAdvance,
  createRun, loadRun, showRun, runs, setInputs, addToRun, removeFromRun, deleteRun, shareServiceCharge, approve, reopen, publish, pay,
  file, payslip, mine, payFrom, plain,
};

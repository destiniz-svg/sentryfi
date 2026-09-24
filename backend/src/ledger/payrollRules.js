/**
 * Payroll's rules, by country, and the arithmetic of one person's month.
 *
 * Like the tax engine (tax.js), a country is data: its rates, each with the
 * date it took effect, its caps, and its deadlines. Nothing else in the app
 * should write "7%" or "5.5%". Everything here is pure: given an employee, the
 * month and what happened in it, it returns every figure on the payslip with
 * how it was reached, and what a person should look at before paying.
 *
 * Money is whole laari (or fils) as BigInt, rounded half up once per figure.
 *
 * Sources and what is still to confirm are in docs/domain/payroll.md. Every
 * rate below is to be confirmed by the company's accountant before a first run
 * is filed, as PRODUCT.md asks of every tax rule.
 */

// ------------------------------------------------------------------ the countries

/**
 * Maldives. Income Tax Act 25/2019 s.54 (employee withholding, from 1 April
 * 2020, monthly bands, the employee's own pension taken off first); Pension Act
 * 8/2009 s.14 (7% and 7% of the basic wage, Maldivians 16 to 65, by the 15th);
 * Employment Act 2/2008 (overtime s.37, deductions s.55, service charge s.52,
 * final pay within 7 days s.57, annual leave s.39); Minimum wage from 1 January
 * 2022 (Maldivians only, by size of business, tourism at the medium rate).
 */
const MV = {
  code: "MV",
  currency: "MVR",
  national: "MV",
  // An hour's pay: the monthly wage over 208 hours, the basis of the published
  // hourly minimum wage (4,500 / 208 = 21.63).
  hoursPerMonth: [208, 1],
  overtime: {
    normal: { label: "Overtime", bp: 12500 },
    holiday: { label: "Overtime on a Friday or public holiday", bp: 15000 },
  },
  // A day's pay for leave paid out or unpaid days: the monthly wage over 30.
  dayDivisor: 30,
  tax: {
    name: "Employee withholding tax",
    short: "EWT",
    form: "MIRA 601",
    authority: "MIRA",
    portal: "MIRAconnect",
    dueDay: 15,
    history: [
      {
        from: "2020-04-01",
        // Monthly bands, each taxed at its own rate (upper bound in laari, rate in bp).
        bands: [
          [6000000n, 0],
          [10000000n, 550],
          [15000000n, 800],
          [20000000n, 1200],
          [null, 1500],
        ],
        pensionFirst: true,
      },
    ],
  },
  pension: {
    name: "Retirement pension",
    short: "Pension",
    scheme: "MRPS",
    authority: "the Pension Office",
    portal: "Koshaaru",
    dueDay: 15,
    // Who is in it unless said otherwise: nationals of working age.
    ageFrom: 16,
    ageTo: 65,
    base: "basic",
    schemes: {
      mrps: { label: "Maldives Retirement Pension Scheme", history: [{ from: "2011-05-01", employeeBp: 700, employerBp: 700 }] },
    },
    defaultScheme: "mrps",
  },
  minimumWage: {
    nationalsOnly: true,
    history: [{ from: "2022-01-01", tiers: { small: 450000n, medium: 700000n, large: 800000n } }],
    tourismTier: "medium",
  },
  // Loans, advances, housing and goods: with written consent, and at most a third of the wage (s.55).
  deductionCap: { loansBp: 3333, totalBp: null },
  finalPayDays: 7,
  wagesDue: { rule: "monthly", day: null },
  serviceCharge: { adminFeeMaxBp: 100 },
  annualLeave: { days: 30, afterMonths: 12 },
  gratuity: null,
  bankFile: "csv",
};

/**
 * United Arab Emirates, mainland. Federal Decree-Law 33/2021 and its Executive
 * Regulations; Wage Protection System under Ministerial Resolution 340/2026
 * (wages due by the 1st of the next month, from 1 June 2026); end-of-service
 * gratuity (Art. 51: 21 days' basic a year for the first five years, 30 after,
 * at most two years' wage); GPSSA pension for Emiratis (Decree-Law 57/2023);
 * deductions at most half the wage, loans at most a fifth. No income tax.
 */
const AE = {
  code: "AE",
  currency: "AED",
  national: "AE",
  // An hour: the daily wage (monthly x 12 / 365) over 8 hours.
  hoursPerMonth: [2920, 12],
  overtime: {
    normal: { label: "Overtime", bp: 12500 },
    night: { label: "Overtime between 10pm and 4am", bp: 15000 },
    holiday: { label: "Work on a rest day or public holiday", bp: 15000 },
  },
  dayDivisor: 30,
  tax: null,
  pension: {
    name: "GPSSA pension",
    short: "Pension",
    scheme: "GPSSA",
    authority: "GPSSA",
    portal: "GPSSA",
    dueDay: 15,
    ageFrom: 0,
    ageTo: 200,
    // Basic, housing, cost of living and social allowances: allowances marked pensionable.
    base: "pensionable",
    capLaari: 7000000n, // AED 70,000
    schemes: {
      gpssa_new: { label: "GPSSA, registered from 31 October 2023", history: [{ from: "2023-10-31", employeeBp: 1100, employerBp: 1500, governmentBp: 250, governmentBelow: 2000000n }] },
      gpssa_old: { label: "GPSSA, registered before 31 October 2023", history: [{ from: "2000-01-01", employeeBp: 500, employerBp: 1500, governmentBp: 250, governmentBelow: null }] },
    },
    defaultScheme: "gpssa_new",
  },
  minimumWage: { nationalsOnly: true, history: [{ from: "2026-01-01", tiers: { all: 600000n } }], tourismTier: "all" },
  deductionCap: { loansBp: 2000, totalBp: 5000 },
  finalPayDays: 14,
  wagesDue: { rule: "next-month", day: 1 },
  serviceCharge: null,
  annualLeave: { days: 30, afterMonths: 12 },
  // Accrued each month for everyone not in a state pension.
  gratuity: { firstYears: 5, daysBefore: 21, daysAfter: 30, capMonths: 24 },
  bankFile: "wps",
};

/** Anywhere else: gross to net with the company's own deductions, and no statutory ones. */
const GENERIC = {
  code: "GENERIC",
  currency: null,
  national: null,
  hoursPerMonth: [208, 1],
  overtime: { normal: { label: "Overtime", bp: 15000 } },
  dayDivisor: 30,
  tax: null,
  pension: null,
  minimumWage: null,
  deductionCap: { loansBp: null, totalBp: null },
  finalPayDays: null,
  wagesDue: { rule: "monthly", day: null },
  serviceCharge: null,
  annualLeave: null,
  gratuity: null,
  bankFile: "csv",
};

const PAYROLL = { MV, AE, GENERIC };
const payrollPack = (code) => PAYROLL[code] || GENERIC;

// ------------------------------------------------------------------ arithmetic

/** a x n / d, rounded half up, for a, n >= 0 and d > 0. */
function mulDiv(a, n, d) {
  const num = BigInt(a) * BigInt(n);
  const den = BigInt(d);
  return (num * 2n + den) / (den * 2n);
}
const bpOf = (a, bp) => mulDiv(a, bp, 10000);
const inForce = (history, on) => [...history].filter((h) => h.from <= on).pop() || null;

/** Hours or days to two places, as hundredths. "7.5" is 750n. */
function hundredths(v) {
  const s = String(v ?? "").trim();
  if (s === "") return 0n;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error(`"${s}" is not a number of hours or days.`);
  const [w, f = ""] = s.split(".");
  return BigInt(w) * 100n + BigInt(f.padEnd(2, "0"));
}

const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
function daysBetween(a, b) {
  return Math.round((Date.parse(`${iso(b)}T00:00:00Z`) - Date.parse(`${iso(a)}T00:00:00Z`)) / 86400000);
}
function monthOf(period) {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error("A pay period is a month, YYYY-MM.");
  const [y, m] = period.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${period}-01`, end: `${period}-${String(days).padStart(2, "0")}`, days, y, m };
}
/** Whole years between two dates. */
function ageOn(dob, on) {
  if (!dob) return null;
  const [y1, m1, d1] = iso(dob).split("-").map(Number);
  const [y2, m2, d2] = iso(on).split("-").map(Number);
  return y2 - y1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0);
}
/** The date a statutory payment for a month is due: a day of the next month. */
function dueFor(period, day) {
  const { y, m } = monthOf(period);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Tax on a month's taxable pay, band by band. */
function bandTax(taxable, bands) {
  let tax = 0n;
  let lower = 0n;
  const lines = [];
  for (const [upper, bp] of bands) {
    if (taxable <= lower) break;
    const top = upper === null || taxable < upper ? taxable : upper;
    const slice = top - lower;
    const t = bpOf(slice, bp);
    if (bp > 0 && slice > 0n) lines.push({ slice, bp, tax: t });
    tax += t;
    if (upper === null) break;
    lower = upper;
  }
  return { tax, lines };
}

// ------------------------------------------------------------------ one person's month

/**
 * Everything on one payslip.
 *
 * employee: { basic, allowances: [{ name, amount, pensionable }], deductions: [{ name, amount }],
 *             joinedOn, leftOn, nationality, dob, pension: { scheme|null, member: bool|null } }
 * inputs:   { unpaidDays, overtime: { normal, holiday, night } (hours), bonus, serviceCharge,
 *             other: [{ name, amount }], advance, otherDeductions: [{ name, amount }],
 *             leaveDays (paid out), noticePay }
 * company:  { pack: "MV", size: "small"|"medium"|"large", tourism: bool }
 *
 * Amounts in and out are laari (BigInt). Returns { earnings, deductions,
 * employer, gross, net, taxable, ... , warnings, blockers }.
 */
function payslip({ pack: code, period, employee: e, inputs: x = {}, company = {} }) {
  const P = payrollPack(code);
  const month = monthOf(period);
  const L = (v) => BigInt(v ?? 0);
  const warnings = [];
  const blockers = [];

  // Days employed in the month, then less unpaid days.
  const from = e.joinedOn && iso(e.joinedOn) > month.start ? iso(e.joinedOn) : month.start;
  const to = e.leftOn && iso(e.leftOn) < month.end ? iso(e.leftOn) : month.end;
  const employedDays = Math.max(0, daysBetween(from, to) + 1);
  const unpaid = hundredths(x.unpaidDays);
  const paidHundredths = BigInt(employedDays) * 100n - unpaid;
  if (paidHundredths < 0n) blockers.push(`More unpaid days (${x.unpaidDays}) than days employed this month (${employedDays}).`);
  const paid = paidHundredths < 0n ? 0n : paidHundredths;
  const whole = BigInt(month.days) * 100n;
  const share = (amount) => (paid === whole ? L(amount) : mulDiv(L(amount), paid, whole));
  const dayNote = paid === whole ? null : `${Number(paid) / 100} of ${month.days} days`;

  const earnings = [];
  const add = (key, label, amount, note, extra = {}) => {
    if (L(amount) !== 0n) earnings.push({ key, label, amount: L(amount), note: note || null, ...extra });
  };
  const basicPaid = share(e.basic);
  add("basic", "Basic salary", basicPaid, dayNote);
  for (const a of e.allowances || []) add("allowance", a.name, share(a.amount), dayNote, { pensionable: Boolean(a.pensionable) });

  // Overtime at the hourly rate the pack sets.
  const [hn, hd] = P.hoursPerMonth;
  for (const [kind, rule] of Object.entries(P.overtime)) {
    const hours = hundredths(x.overtime?.[kind]);
    if (hours === 0n) continue;
    const amount = mulDiv(L(e.basic) * BigInt(hd) * hours * BigInt(rule.bp), 1, BigInt(hn) * 100n * 10000n);
    add(`overtime_${kind}`, rule.label, amount, `${Number(hours) / 100} h at ${rule.bp / 100}% of the hourly rate`);
  }
  add("service_charge", "Service charge", L(x.serviceCharge));
  add("bonus", "Bonus", L(x.bonus));
  for (const o of x.other || []) add("other", o.name || "Other pay", L(o.amount));
  const leaveDays = hundredths(x.leaveDays);
  if (leaveDays > 0n) add("leave_pay", "Annual leave paid out", mulDiv(L(e.basic), leaveDays, BigInt(P.dayDivisor) * 100n), `${Number(leaveDays) / 100} days`);
  add("notice_pay", "Pay in place of notice", L(x.noticePay));

  const gross = earnings.reduce((a, r) => a + r.amount, 0n);

  // Pension: who is in it, and on what.
  const deductions = [];
  const employer = [];
  const on = month.end;
  let employeePension = 0n;
  if (P.pension) {
    const national = e.nationality === P.national;
    const age = ageOn(e.dob, on);
    const inAge = age === null || (age >= P.pension.ageFrom && age <= P.pension.ageTo);
    const member = e.pension?.member ?? (national && inAge);
    const schemeKey = e.pension?.scheme || P.pension.defaultScheme;
    const scheme = P.pension.schemes[schemeKey];
    if (member && scheme) {
      const r = inForce(scheme.history, on);
      let base = P.pension.base === "basic" ? basicPaid : basicPaid + earnings.filter((a) => a.key === "allowance" && a.pensionable).reduce((s, a) => s + a.amount, 0n);
      if (P.pension.capLaari && base > P.pension.capLaari) base = P.pension.capLaari;
      employeePension = bpOf(base, r.employeeBp);
      // A government share, where the law pays part of the employer's.
      const govt = r.governmentBp && (r.governmentBelow === null || base < r.governmentBelow) ? r.governmentBp : 0;
      const employerBp = r.employerBp - govt;
      deductions.push({ key: "pension", label: `${P.pension.name} (${r.employeeBp / 100}%)`, amount: employeePension, note: `on ${fmt(base)}` });
      employer.push({ key: "pension", label: `${P.pension.name} (${employerBp / 100}%)`, amount: bpOf(base, employerBp), note: govt ? `the government pays ${govt / 100}%` : null });
      if (national && !inAge) warnings.push(`${e.name || "This person"} is ${age}, outside the pension ages; check they should still be in it.`);
    } else if (national && inAge && e.pension?.member === false) {
      warnings.push(`${e.name || "This person"} is a national of working age but not in the pension scheme.`);
    }
  }

  // Income tax, on pay after the employee's own pension where the law says so.
  let taxable = gross;
  let tax = 0n;
  let bands = [];
  if (P.tax) {
    const t = inForce(P.tax.history, on);
    if (t) {
      taxable = t.pensionFirst ? gross - employeePension : gross;
      if (taxable < 0n) taxable = 0n;
      ({ tax, lines: bands } = bandTax(taxable, t.bands));
      if (tax > 0n) deductions.push({ key: "tax", label: P.tax.name, amount: tax, note: bands.map((b) => `${b.bp / 100}% of ${fmt(b.slice)}`).join(" + ") });
    }
  }

  // The employee's own deductions: advances and loans, then anything else agreed.
  const advance = L(x.advance);
  if (advance > 0n) deductions.push({ key: "advance", label: "Advance repaid", amount: advance });
  for (const d of e.deductions || []) if (L(d.amount) > 0n) deductions.push({ key: "recurring", label: d.name, amount: L(d.amount) });
  for (const d of x.otherDeductions || []) if (L(d.amount) > 0n) deductions.push({ key: "other", label: d.name || "Other deduction", amount: L(d.amount) });

  const taken = deductions.reduce((a, r) => a + r.amount, 0n);
  const net = gross - taken;

  // Gratuity accrued this month, for those the law gives one to.
  if (P.gratuity && !(e.pension?.member ?? e.nationality === P.national)) {
    const years = e.joinedOn ? daysBetween(e.joinedOn, on) / 365 : 0;
    const days = years < P.gratuity.firstYears ? P.gratuity.daysBefore : P.gratuity.daysAfter;
    const monthly = mulDiv(share(e.basic) * BigInt(days), 1, BigInt(P.dayDivisor) * 12n);
    employer.push({ key: "gratuity", label: "End-of-service gratuity set aside", amount: monthly, note: `${days} days' basic a year` });
  }

  // What to look at before paying.
  if (net < 0n) blockers.push(`Deductions come to more than the pay: net would be ${fmt(net)}.`);
  const own = advance + (e.deductions || []).reduce((a, d) => a + L(d.amount), 0n);
  if (P.deductionCap.loansBp && own > bpOf(gross, P.deductionCap.loansBp)) {
    warnings.push(`Loans and agreed deductions are ${fmt(own)}, more than the ${P.deductionCap.loansBp === 3333 ? "third" : `${P.deductionCap.loansBp / 100}%`} of pay the law allows.`);
  }
  if (P.deductionCap.totalBp && taken > bpOf(gross, P.deductionCap.totalBp)) warnings.push(`Deductions are more than ${P.deductionCap.totalBp / 100}% of pay.`);
  if (P.minimumWage && (!P.minimumWage.nationalsOnly || e.nationality === P.national)) {
    const mw = inForce(P.minimumWage.history, on);
    const tier = company.tourism ? P.minimumWage.tourismTier : company.size || Object.keys(mw?.tiers || {})[0];
    const floor = mw?.tiers[tier] ?? mw?.tiers.all;
    if (floor && L(e.basic) < floor) warnings.push(`A basic of ${fmt(L(e.basic))} is under the minimum wage of ${fmt(floor)} for this business.`);
  }
  if (e.leftOn && iso(e.leftOn) >= month.start && iso(e.leftOn) <= month.end && P.finalPayDays) {
    warnings.push(`Leaves on ${iso(e.leftOn)}: the final pay, with any leave owed, is due within ${P.finalPayDays} days.`);
  }

  const sum = (list) => list.reduce((a, r) => a + r.amount, 0n);
  return {
    period, employedDays, paidDays: Number(paid) / 100, daysInMonth: month.days,
    earnings, deductions, employer,
    gross, taxable, tax, employeePension,
    employerPension: sum(employer.filter((r) => r.key === "pension")),
    gratuity: sum(employer.filter((r) => r.key === "gratuity")),
    advance, net,
    otherDeductions: sum(deductions.filter((r) => r.key === "recurring" || r.key === "other")),
    serviceCharge: L(x.serviceCharge),
    warnings, blockers,
  };
}

function fmt(l) {
  const neg = l < 0n;
  const a = neg ? -l : l;
  const whole = (a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${whole}.${(a % 100n).toString().padStart(2, "0")}`;
}

/**
 * Service charge shared out: what was collected, less the admin fee the
 * employer may keep, split equally among those who worked for it, by the days
 * each worked. The last person takes what rounding leaves, so it adds up.
 */
function shareServiceCharge({ collected, adminFeeBp = 0, people }) {
  const pool = BigInt(collected) - bpOf(BigInt(collected), adminFeeBp);
  const days = people.map((p) => hundredths(p.days ?? "30"));
  const total = days.reduce((a, d) => a + d, 0n);
  if (total === 0n) return { pool, shares: [] };
  let left = pool;
  const shares = people.map((p, i) => {
    const s = i === people.length - 1 ? left : mulDiv(pool, days[i], total);
    left -= s;
    return { id: p.id, amount: s };
  });
  return { pool, fee: BigInt(collected) - pool, shares };
}

/** Annual leave earned to a date, less what was taken. */
function leaveBalance({ pack: code, joinedOn, on, taken = 0 }) {
  const P = payrollPack(code);
  if (!P.annualLeave || !joinedOn) return null;
  const days = daysBetween(joinedOn, on);
  const months = days / 30.44;
  // Earned a year at a time once the first year is served; before that, nothing is owed yet.
  const earned = months < P.annualLeave.afterMonths ? 0 : Math.floor((days / 365) * P.annualLeave.days * 100) / 100;
  return { earned, taken, left: Math.round((earned - taken) * 100) / 100 };
}

module.exports = { PAYROLL, payrollPack, payslip, shareServiceCharge, leaveBalance, bandTax, dueFor, monthOf, fmt, mulDiv, hundredths, inForce };

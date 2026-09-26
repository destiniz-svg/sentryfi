/**
 * The journal risk screen (ISA 240): every entry in a period read for the
 * signs auditors look for when management might override the controls.
 *
 * Each test is one plain question about an entry, answered from what the
 * books already keep: when it was posted and by whom, what it came from,
 * its amount and its accounts. Nothing is decided here; the screen says
 * which entries to look at, and why, and the auditor draws a sample from it.
 */

const { formatLaari } = require("./money");

// Maldivian working time: the weekend is Friday and Saturday.
const WEEKEND = new Set([5, 6]);
const OPEN_HOUR = 7;
const CLOSE_HOUR = 20;
const DAYS_AFTER = 30;
const LAST_DAYS = 3;
const ROUND = 100000n; // MVR 1,000.00
// Seldom: in a period of at least this many entries, a person or account behind this few.
const ENOUGH = 20;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The tests, most telling first. `short` finishes the sentence "entries that …". */
const TESTS = {
  late: { name: "Posted after the period ended", short: "were posted after the period ended", weight: 3 },
  reversed: { name: "Reversed just after the period", short: `were reversed within ${DAYS_AFTER} days after it`, weight: 3 },
  backdated: { name: "Dated long before it was posted", short: `were dated over ${DAYS_AFTER} days before being posted`, weight: 2 },
  manual: { name: "Not from any document", short: "came from no document", weight: 2 },
  rare_user: { name: "Posted by someone who seldom posts", short: "were posted by someone who seldom posts", weight: 2 },
  offhours: { name: "Posted out of hours", short: "were posted out of hours or at the weekend", weight: 1 },
  round: { name: "A round amount", short: "are round amounts", weight: 1 },
  undescribed: { name: "No real description", short: "have no real description", weight: 1 },
  rare_account: { name: "A seldom-used account", short: "use a seldom-used account", weight: 1 },
  year_end: { name: `In the last ${LAST_DAYS} days`, short: `are dated in the last ${LAST_DAYS} days`, weight: 1 },
};

const MANUAL = new Set(["adjustment", "import", "opening_balance", "intercompany", "company"]);

const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const between = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 864e5);
const said = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Screens the period's entries. With `only`, returns just that entry, still
 * judged against the whole period (who seldom posts is a fact of the period).
 */
async function screen(client, { companyId, from, to, only }) {
  const { rows } = await client.query(
    `SELECT e.id, e.entry_no::text AS no, e.entry_date::text AS day, e.source::text AS source, e.source_id, e.narrative,
            (e.posted_at AT TIME ZONE 'Indian/Maldives')::date::text AS posted_day,
            EXTRACT(DOW FROM e.posted_at AT TIME ZONE 'Indian/Maldives')::int AS posted_dow,
            to_char(e.posted_at AT TIME ZONE 'Indian/Maldives', 'HH24:MI') AS posted_time,
            EXTRACT(HOUR FROM e.posted_at AT TIME ZONE 'Indian/Maldives')::int AS posted_hour,
            e.posted_by, u.name AS posted_name,
            (SELECT COALESCE(SUM(l.debit_laari), 0) FROM journal_lines l WHERE l.entry_id = e.id)::text AS amount,
            (SELECT array_agg(DISTINCT l.account_id) FROM journal_lines l WHERE l.entry_id = e.id) AS accounts,
            (SELECT json_build_object('no', r.entry_no::text, 'day', r.entry_date::text) FROM journal_entries r
              WHERE r.reverses_id = e.id AND r.company_id = e.company_id ORDER BY r.entry_date LIMIT 1) AS reversal
       FROM journal_entries e JOIN users u ON u.id = e.posted_by
      WHERE e.company_id = $1 AND e.entry_date BETWEEN $2 AND $3
      ORDER BY e.entry_no`,
    [companyId, from, to]
  );
  const { rows: names } = await client.query(
    "SELECT id, code || ' ' || name AS name FROM accounts WHERE company_id = $1",
    [companyId]
  );
  const accountName = new Map(names.map((a) => [a.id, a.name]));

  // What is usual in this period: who posts, and which accounts are used.
  const byUser = new Map();
  const byAccount = new Map();
  for (const r of rows) {
    byUser.set(r.posted_by, (byUser.get(r.posted_by) || 0) + 1);
    for (const a of r.accounts || []) byAccount.set(a, (byAccount.get(a) || 0) + 1);
  }
  const enough = rows.length >= ENOUGH;
  const seldomUser = Math.max(2, Math.floor(rows.length * 0.02));

  const counts = Object.fromEntries(Object.keys(TESTS).map((k) => [k, 0]));
  const entries = [];
  for (const r of rows) {
    const flags = [];
    const flag = (test, text) => flags.push({ test, said: text });
    const amount = BigInt(r.amount);
    if (r.posted_day > to && r.day <= to) flag("late", `Posted ${said(r.posted_day)}, ${between(to, r.posted_day)} days after the period ended`);
    if (r.reversal && r.reversal.day > to && r.reversal.day <= addDays(to, DAYS_AFTER)) flag("reversed", `Reversed by entry ${r.reversal.no} on ${said(r.reversal.day)}`);
    if (between(r.day, r.posted_day) > DAYS_AFTER) flag("backdated", `Dated ${said(r.day)} but posted ${said(r.posted_day)}`);
    if (MANUAL.has(r.source) && !r.source_id) flag("manual", "Made by hand, not from a bill, invoice or other document");
    if (enough && byUser.get(r.posted_by) <= seldomUser) flag("rare_user", `Posted by ${r.posted_name}, who posted ${byUser.get(r.posted_by)} of ${rows.length} entries`);
    if (WEEKEND.has(r.posted_dow) || r.posted_hour < OPEN_HOUR || r.posted_hour >= CLOSE_HOUR) flag("offhours", `Posted ${DAY_NAMES[r.posted_dow]} at ${r.posted_time}`);
    if (amount >= ROUND && amount % ROUND === 0n) flag("round", `Exactly MVR ${formatLaari(amount)}`);
    if (String(r.narrative || "").trim().length < 5) flag("undescribed", r.narrative ? `Described only as "${r.narrative.trim()}"` : "No description");
    if (enough) {
      const rare = (r.accounts || []).filter((a) => byAccount.get(a) <= 2);
      if (rare.length) flag("rare_account", `Uses ${rare.map((a) => accountName.get(a) || "an account").join(", ")}, seldom used this period`);
    }
    if (r.day > addDays(to, -LAST_DAYS)) flag("year_end", `Dated ${said(r.day)}, in the last ${LAST_DAYS} days`);
    for (const x of flags) counts[x.test] += 1;
    if (only && r.id !== only) continue;
    if (!flags.length && !only) continue;
    entries.push({
      id: r.id, no: r.no, on: r.day, narrative: r.narrative, amount: formatLaari(amount), source: r.source,
      postedBy: r.posted_name, postedOn: r.posted_day, postedAt: r.posted_time,
      flags, score: flags.reduce((s, x) => s + TESTS[x.test].weight, 0),
    });
  }
  entries.sort((a, b) => b.score - a.score || Number(b.no) - Number(a.no));
  return {
    total: rows.length,
    flagged: only ? undefined : entries.length,
    tests: Object.entries(TESTS).map(([key, t]) => ({ key, name: t.name, weight: t.weight, count: counts[key] })),
    entries,
  };
}

module.exports = { screen, TESTS };

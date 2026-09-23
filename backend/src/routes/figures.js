const express = require("express");

const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const { formatLaari } = require("../ledger/money");
const { cashTrend } = require("../ledger/trend");

const router = express.Router();
router.use(requireAuth, requireCompany);

/**
 * Where things stand, from the books.
 *
 * The screen this replaces read the purchased product's own invoice and
 * expense tables, so posting a bill to the ledger changed nothing on it —
 * which is exactly what the owner saw. Two record stores that know nothing
 * about each other is the thing the product record forbids, and this closes
 * one of them.
 *
 * Every figure here is derived from journal lines. Nothing stores a balance,
 * so nothing can disagree with the ledger: if a figure is wrong, the entries
 * behind it are wrong, and they are the same entries an accountant would ask
 * to see.
 */

const money = (v) => formatLaari(BigInt(v || 0));

router.get(
  "/",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const data = await asCompany(req, async (client) => {
      // What has been spent in each of the last twelve months, from expense
      // accounts: a debit increases a cost, a credit reduces it (a reversal).
      // Every month is there, empty ones as zero; months before the books'
      // first entry are marked, so they are drawn as "not kept yet", not as
      // months when nothing was spent.
      const { rows: spend } = await client.query(
        `WITH months AS (
           SELECT generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '11 months', date_trunc('month', CURRENT_DATE), INTERVAL '1 month') AS m
         ), began AS (
           SELECT date_trunc('month', MIN(entry_date)) AS m FROM journal_entries WHERE company_id = $1
         ), spent AS (
           SELECT date_trunc('month', e.entry_date) AS m, SUM(l.debit_laari - l.credit_laari) AS amount
             FROM journal_lines l
             JOIN journal_entries e ON e.id = l.entry_id
             JOIN accounts a       ON a.id = l.account_id
            WHERE l.company_id = $1 AND a.type = 'expense'
              AND e.entry_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '11 months'
            GROUP BY 1
         )
         SELECT to_char(months.m, 'YYYY-MM') AS ym, to_char(months.m, 'Mon') AS label,
                COALESCE(spent.amount, 0)::text AS amount,
                (began.m IS NULL OR months.m < began.m) AS before_books
           FROM months CROSS JOIN began LEFT JOIN spent ON spent.m = months.m
          ORDER BY months.m`,
        [req.companyId]
      );

      // Where it went this month, by account.
      const { rows: byAccount } = await client.query(
        `SELECT a.name,
                COALESCE(SUM(l.debit_laari - l.credit_laari), 0)::text AS amount
           FROM journal_lines l
           JOIN journal_entries e ON e.id = l.entry_id
           JOIN accounts a       ON a.id = l.account_id
          WHERE l.company_id = $1 AND a.type = 'expense'
            AND date_trunc('month', e.entry_date) = date_trunc('month', CURRENT_DATE)
          GROUP BY a.name
         HAVING COALESCE(SUM(l.debit_laari - l.credit_laari), 0) <> 0
          ORDER BY 2 DESC
          LIMIT 6`,
        [req.companyId]
      );

      // A balance per account type, which is what the headline figures are.
      // Liabilities and income sit on the credit side, so they are read the
      // other way round; anything else would show what you owe as a negative.
      const { rows: balances } = await client.query(
        `SELECT a.type::text AS type,
                COALESCE(SUM(
                  CASE WHEN a.type IN ('liability','income','equity')
                       THEN l.credit_laari - l.debit_laari
                       ELSE l.debit_laari - l.credit_laari END
                ), 0)::text AS amount
           FROM journal_lines l
           JOIN accounts a ON a.id = l.account_id
          WHERE l.company_id = $1
          GROUP BY a.type`,
        [req.companyId]
      );
      const byType = Object.fromEntries(balances.map((b) => [b.type, b.amount]));

      // Cash and bank specifically, rather than every asset — and every tin.
      // Each cash box is its own account beneath 1200 (1211, 1212, ...), so an
      // exact match on 1200 left every tin's money out of this figure.
      const { rows: cash } = await client.query(
        `SELECT COALESCE(SUM(l.debit_laari - l.credit_laari), 0)::text AS amount
           FROM journal_lines l
           JOIN accounts a ON a.id = l.account_id
          WHERE l.company_id = $1 AND a.type = 'asset'
            AND (a.code LIKE '11%' OR a.code LIKE '12%')`,
        [req.companyId]
      );

      // Cash and bank per place, and how the total moved over thirty days:
      // the balance before the window, then each day's movement within it.
      const CASH = `l.company_id = $1 AND a.type = 'asset' AND (a.code LIKE '11%' OR a.code LIKE '12%')`;
      const { rows: places } = await client.query(
        `SELECT a.name, COALESCE(SUM(l.debit_laari - l.credit_laari), 0)::text AS amount
           FROM journal_lines l JOIN accounts a ON a.id = l.account_id
          WHERE ${CASH}
          GROUP BY a.name
         HAVING COALESCE(SUM(l.debit_laari - l.credit_laari), 0) <> 0
          ORDER BY 2 DESC`,
        [req.companyId]
      );
      const { rows: before } = await client.query(
        `SELECT COALESCE(SUM(l.debit_laari - l.credit_laari), 0)::text AS amount
           FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
          WHERE ${CASH} AND e.entry_date < CURRENT_DATE - 30`,
        [req.companyId]
      );
      const { rows: moves } = await client.query(
        `SELECT to_char(e.entry_date, 'YYYY-MM-DD') AS day, SUM(l.debit_laari - l.credit_laari)::text AS amount
           FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
          WHERE ${CASH} AND e.entry_date >= CURRENT_DATE - 30
          GROUP BY 1`,
        [req.companyId]
      );

      // The two headline balances that are one account each, read from that
      // account rather than from a whole type. "Owed to suppliers" used to be
      // every liability — which, once invoices post, would have counted the
      // GST owed to the tax authority as money owed to suppliers.
      const { rows: headline } = await client.query(
        `SELECT a.code,
                COALESCE(SUM(
                  CASE WHEN a.type IN ('liability','income','equity')
                       THEN l.credit_laari - l.debit_laari
                       ELSE l.debit_laari - l.credit_laari END
                ), 0)::text AS amount
           FROM journal_lines l
           JOIN accounts a ON a.id = l.account_id
          WHERE l.company_id = $1 AND a.code IN ('2100','1300','2200')
          GROUP BY a.code`,
        [req.companyId]
      );
      const byCode = Object.fromEntries(headline.map((h) => [h.code, h.amount]));

      // The last few things that happened, in plain words.
      const { rows: recent } = await client.query(
        `SELECT e.entry_no::text, e.entry_date, e.narrative, e.source::text,
                COALESCE(SUM(l.debit_laari), 0)::text AS amount
           FROM journal_entries e
           JOIN journal_lines l ON l.entry_id = e.id
          WHERE e.company_id = $1
          GROUP BY e.id
          ORDER BY e.entry_no DESC
          LIMIT 8`,
        [req.companyId]
      );

      const { rows: counted } = await client.query(
        "SELECT count(*)::int AS n FROM journal_entries WHERE company_id = $1",
        [req.companyId]
      );

      return { spend, byAccount, byType, byCode, cash: cash[0]?.amount, recent, entries: counted[0].n, places, before: before[0].amount, moves };
    });

    const ym = new Date().toISOString().slice(0, 7);
    const thisMonth = data.spend.find((r) => r.ym === ym);

    // A bill dated last month is spend in last month, and a headline of zero
    // the moment after posting one reads as a broken screen rather than as an
    // accurate one. So when this month is empty but the books are not, say
    // where the money actually is.
    const elsewhere = data.spend
      .filter((r) => r.ym !== ym && BigInt(r.amount) !== 0n)
      .sort((a, b) => (a.ym < b.ym ? 1 : -1))[0];

    const trend = cashTrend(data.before, data.moves, new Date());
    // Runway: what cash covers at the pace of the last three months' spending.
    // Said only when there is spending to measure it by.
    const recentSpend = data.spend.filter((r) => !r.before_books).slice(-3).map((r) => BigInt(r.amount));
    const monthly = recentSpend.length ? recentSpend.reduce((a, b) => a + b, 0n) / BigInt(recentSpend.length) : 0n;
    const runwayMonths = monthly > 0n && BigInt(data.cash || 0) > 0n ? Number((BigInt(data.cash) * 10n) / monthly) / 10 : null;

    res.json({
      cashTrend: trend.map((v) => Number(v)),
      cashChange30: money(trend.length ? (trend[trend.length - 1] - trend[0]).toString() : "0"),
      cashPlaces: data.places.map((p) => ({ name: p.name, amount: money(p.amount) })),
      runwayMonths,
      currency: req.company?.baseCurrency || "MVR",
      entries: data.entries,
      spentThisMonth: money(thisMonth?.amount),
      // Named so the screen can explain a zero rather than just showing one.
      spentElsewhere: elsewhere
        ? { label: elsewhere.label, amount: money(elsewhere.amount) }
        : null,
      spentAllTime: money(data.byType.expense),
      owedToSuppliers: money(data.byCode["2100"]),
      // What customers owe, and what the tax authority is owed on what was sold.
      owedToUs: money(data.byCode["1300"]),
      gstOwed: money(data.byCode["2200"]),
      earned: money(data.byType.income),
      inBankAndCash: money(data.cash),
      // Nothing has been imported yet, so a cash figure of zero means "not
      // started" rather than "empty". Saying which is the difference between
      // a figure and a lie.
      cashIsReal: BigInt(data.cash || 0) !== 0n,
      spendByMonth: data.spend.map((r) => ({
        label: r.label,
        ym: r.ym,
        amount: money(r.amount),
        raw: Number(r.amount),
        beforeBooks: r.before_books,
      })),
      spendByAccount: data.byAccount.map((r) => ({
        name: r.name,
        amount: money(r.amount),
        raw: Number(r.amount),
        beforeBooks: r.before_books,
      })),
      recent: data.recent.map((r) => ({
        entryNo: r.entry_no,
        date: r.entry_date,
        narrative: r.narrative,
        source: r.source,
        amount: money(r.amount),
      })),
    });
  })
);

module.exports = router;

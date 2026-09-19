const express = require("express");

const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const { formatLaari } = require("../ledger/money");

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
      // What has been spent, by month, from expense accounts. A debit
      // increases a cost; a credit reduces it, which is how a reversal shows.
      const { rows: spend } = await client.query(
        `SELECT to_char(date_trunc('month', e.entry_date), 'YYYY-MM') AS ym,
                to_char(date_trunc('month', e.entry_date), 'Mon')     AS label,
                COALESCE(SUM(l.debit_laari - l.credit_laari), 0)::text AS amount
           FROM journal_lines l
           JOIN journal_entries e ON e.id = l.entry_id
           JOIN accounts a       ON a.id = l.account_id
          WHERE l.company_id = $1 AND a.type = 'expense'
            AND e.entry_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
          GROUP BY 1, 2, date_trunc('month', e.entry_date)
          ORDER BY date_trunc('month', e.entry_date)`,
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

      // Cash and bank specifically, rather than every asset.
      const { rows: cash } = await client.query(
        `SELECT COALESCE(SUM(l.debit_laari - l.credit_laari), 0)::text AS amount
           FROM journal_lines l
           JOIN accounts a ON a.id = l.account_id
          WHERE l.company_id = $1 AND a.type = 'asset'
            AND a.code IN ('1100','1200')`,
        [req.companyId]
      );

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

      return { spend, byAccount, byType, cash: cash[0]?.amount, recent, entries: counted[0].n };
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

    res.json({
      currency: req.company?.baseCurrency || "MVR",
      entries: data.entries,
      spentThisMonth: money(thisMonth?.amount),
      // Named so the screen can explain a zero rather than just showing one.
      spentElsewhere: elsewhere
        ? { label: elsewhere.label, amount: money(elsewhere.amount) }
        : null,
      spentAllTime: money(data.byType.expense),
      owedToSuppliers: money(data.byType.liability),
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
      })),
      spendByAccount: data.byAccount.map((r) => ({
        name: r.name,
        amount: money(r.amount),
        raw: Number(r.amount),
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

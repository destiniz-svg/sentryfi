const express = require("express");

const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { query, queryOne } = require("../config/db");
const { serializeInvoice } = require("../utils/invoice");

const router = express.Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const uid = req.user.id;

    const totals = await queryOne(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END), 0) AS total_revenue,
         COALESCE(SUM(CASE WHEN status <> 'paid' THEN total ELSE 0 END), 0) AS outstanding,
         COALESCE(SUM(CASE WHEN status = 'paid'
                        AND date_trunc('month', COALESCE(paid_at, issue_date))
                          = date_trunc('month', CURRENT_DATE)
                       THEN total ELSE 0 END), 0) AS paid_this_month,
         COUNT(*) FILTER (WHERE status = 'sent' AND due_date < CURRENT_DATE)::int AS overdue_count,
         COUNT(*)::int AS invoice_count,
         COALESCE(SUM(CASE WHEN status = 'sent' AND due_date < CURRENT_DATE THEN total ELSE 0 END), 0) AS overdue_total
       FROM invoices WHERE user_id = $1 AND voided_at IS NULL`,
      [uid]
    );

    const { rows: series } = await query(
      `WITH months AS (
         SELECT date_trunc('month', CURRENT_DATE) - (n || ' month')::interval AS m
         FROM generate_series(0, 5) n
       )
       SELECT to_char(months.m, 'Mon') AS label,
              to_char(months.m, 'YYYY-MM') AS ym,
              COALESCE(SUM(i.total), 0) AS revenue,
              COUNT(i.id)::int AS count
       FROM months
       LEFT JOIN invoices i
         ON i.user_id = $1
        AND i.voided_at IS NULL
        AND i.status = 'paid'
        AND date_trunc('month', COALESCE(i.paid_at, i.issue_date)) = months.m
       GROUP BY months.m
       ORDER BY months.m ASC`,
      [uid]
    );

    const { rows: recentRows } = await query(
      `SELECT i.*, c.name AS client_name, c.company AS client_company
       FROM invoices i
       LEFT JOIN clients c ON c.id = i.client_id
       WHERE i.user_id = $1
       ORDER BY i.created_at DESC
       LIMIT 5`,
      [uid]
    );

    const spend = await queryOne(
      `SELECT
         COALESCE(SUM(amount),0) AS total,
         COALESCE(SUM(CASE WHEN date_trunc('month', expense_date)
                             = date_trunc('month', CURRENT_DATE)
                        THEN amount ELSE 0 END),0) AS this_month,
         COALESCE(SUM(CASE WHEN date_trunc('month', expense_date)
                             = date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
                        THEN amount ELSE 0 END),0) AS last_month
       FROM expenses WHERE user_id = $1 AND voided_at IS NULL`,
      [uid]
    );

    const { rows: spendSeries } = await query(
      `WITH months AS (
         SELECT date_trunc('month', CURRENT_DATE) - (n || ' month')::interval AS m
         FROM generate_series(0, 5) n
       )
       SELECT to_char(months.m, 'Mon') AS label,
              to_char(months.m, 'YYYY-MM') AS ym,
              COALESCE(SUM(e.amount), 0) AS spend
       FROM months
       LEFT JOIN expenses e
         ON e.user_id = $1
        AND e.voided_at IS NULL
        AND date_trunc('month', e.expense_date) = months.m
       GROUP BY months.m
       ORDER BY months.m`,
      [uid]
    );

    const { rows: byCode } = await query(
      `SELECT COALESCE(NULLIF(category, ''), 'Everything else') AS code,
              COALESCE(SUM(amount), 0) AS amount
       FROM expenses
       WHERE user_id = $1
         AND voided_at IS NULL
         AND date_trunc('month', expense_date) = date_trunc('month', CURRENT_DATE)
       GROUP BY 1 ORDER BY 2 DESC LIMIT 6`,
      [uid]
    );

    const clientCount = await queryOne(
      `SELECT COUNT(*)::int AS n FROM clients WHERE user_id = $1`,
      [uid]
    );

    res.json({
      stats: {
        totalRevenue: Number(totals.total_revenue),
        outstanding: Number(totals.outstanding),
        paidThisMonth: Number(totals.paid_this_month),
        overdueCount: totals.overdue_count,
        overdueTotal: Number(totals.overdue_total),
        invoiceCount: totals.invoice_count,
        clientCount: clientCount.n,
        spentThisMonth: Number(spend.this_month),
        spentLastMonth: Number(spend.last_month),
        spentAllTime: Number(spend.total),
      },
      spendSeries: spendSeries.map((r) => ({
        label: r.label,
        ym: r.ym,
        spend: Number(r.spend),
      })),
      spendByCode: byCode.map((r) => ({
        code: r.code,
        amount: Number(r.amount),
      })),
      revenueSeries: series.map((r) => ({
        label: r.label,
        ym: r.ym,
        revenue: Number(r.revenue),
        count: r.count,
      })),
      recentInvoices: recentRows.map((r) => serializeInvoice(r)),
    });
  })
);

module.exports = router;

const express = require("express");

const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const { formatLaari } = require("../ledger/money");

const router = express.Router();
router.use(requireAuth, requireCompany);

/**
 * What needs you.
 *
 * The product record calls this the central idea and the app's only
 * notification surface: one place that answers "what am I holding up?",
 * assembled from the books rather than typed by anyone.
 *
 * Three rules shape it.
 *
 * It is ordered by what it costs to ignore, not by what is newest. Paying a
 * supplier twice and claiming the input tax twice is the most expensive
 * ordinary mistake available here, so it leads. A bill nobody has looked at is
 * cheap today and expensive at the end of the month.
 *
 * Every item names the money and says what to do. "3 bills need review" is a
 * number; "MVR 4,250.50 from Lily Enterprises — say how its GST was quoted" is
 * a thing a person can finish.
 *
 * Nothing appears here that the app could have handled itself. The rule is
 * only to ask when genuinely unsure, and this is where the asking surfaces, so
 * a list that grows with routine work would mean the rule was broken
 * somewhere else.
 */

// Ordered by what it costs to get wrong, which is not the order they happen in.
const SEVERITY = { money_at_risk: 0, blocked: 1, waiting: 2, ageing: 3 };

router.get(
  "/",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const items = await asCompany(req, async (client) => {
      const found = [];

      // 1. A supplier billed twice. The most expensive ordinary mistake here:
      //    the bill is paid twice and the tax claimed twice.
      const { rows: duplicates } = await client.query(
        `SELECT b.id, b.bill_no, b.gross_laari, c.name AS supplier,
                (SELECT count(*) FROM bills o
                  WHERE o.company_id = b.company_id
                    AND o.counterparty_id = b.counterparty_id
                    AND lower(btrim(o.bill_no)) = lower(btrim(b.bill_no))
                    AND o.id <> b.id
                    AND o.status <> 'discarded' AND o.voided_at IS NULL)::int AS twins
           FROM bills b
           LEFT JOIN counterparties c ON c.id = b.counterparty_id
          WHERE b.company_id = $1
            AND b.bill_no IS NOT NULL
            AND b.status <> 'discarded' AND b.voided_at IS NULL`,
        [req.companyId]
      );
      for (const row of duplicates.filter((r) => r.twins > 0)) {
        found.push({
          kind: "money_at_risk",
          title: `${row.supplier || "A supplier"} may be billed twice`,
          detail: `Bill ${row.bill_no} · MVR ${formatLaari(BigInt(row.gross_laari))} appears more than once.`,
          does: "Void whichever is wrong",
          href: `/bills`,
        });
      }

      // 2. A bill that cannot be posted until somebody decides how its tax was
      //    quoted. Blocked rather than at risk: nothing is wrong yet, but the
      //    money cannot move.
      const { rows: undecided } = await client.query(
        `SELECT b.id, b.bill_no, b.gross_laari, c.name AS supplier
           FROM bills b
           LEFT JOIN counterparties c ON c.id = b.counterparty_id
          WHERE b.company_id = $1
            AND b.gst_treatment = 'unknown'
            AND b.status <> 'discarded' AND b.voided_at IS NULL
          ORDER BY b.received_at ASC`,
        [req.companyId]
      );
      for (const row of undecided) {
        found.push({
          kind: "blocked",
          title: `MVR ${formatLaari(BigInt(row.gross_laari))} from ${row.supplier || "an unnamed supplier"}`,
          detail:
            "Nobody has said how its GST was quoted, so it cannot go in the books. " +
            "Guessing would be an 8% error either way.",
          does: "Say how the GST was quoted",
          href: `/bills`,
        });
      }

      // 3. Recorded, decided, and still not in the books.
      const { rows: unposted } = await client.query(
        `SELECT b.id, b.bill_no, b.gross_laari, c.name AS supplier,
                (CURRENT_DATE - b.received_at::date)::int AS days
           FROM bills b
           LEFT JOIN counterparties c ON c.id = b.counterparty_id
          WHERE b.company_id = $1
            AND b.status IN ('draft','awaiting_review')
            AND b.gst_treatment <> 'unknown'
            AND b.voided_at IS NULL
          ORDER BY b.received_at ASC`,
        [req.companyId]
      );
      for (const row of unposted) {
        found.push({
          kind: row.days > 7 ? "ageing" : "waiting",
          title: `MVR ${formatLaari(BigInt(row.gross_laari))} from ${row.supplier || "an unnamed supplier"}`,
          detail:
            row.days > 7
              ? `Recorded ${row.days} days ago and still not in the books.`
              : "Recorded and ready to go in the books.",
          does: "Put it in the books",
          href: `/bills`,
        });
      }

      // 4. A bill with nobody on it. It cannot be matched, chased or paid.
      const { rows: nameless } = await client.query(
        `SELECT id, gross_laari FROM bills
          WHERE company_id = $1 AND counterparty_id IS NULL
            AND status <> 'discarded' AND voided_at IS NULL`,
        [req.companyId]
      );
      for (const row of nameless) {
        found.push({
          kind: "blocked",
          title: `MVR ${formatLaari(BigInt(row.gross_laari))} from nobody`,
          detail: "This bill has no supplier on it, so it cannot be matched or paid.",
          does: "Say who it is from",
          href: `/bills`,
        });
      }

      found.sort((a, b) => SEVERITY[a.kind] - SEVERITY[b.kind]);
      return found;
    });

    res.json({
      items,
      // Said plainly rather than as a count, because "0 items" is not the same
      // sentence as "nothing is waiting on you".
      allClear: items.length === 0,
    });
  })
);

module.exports = router;

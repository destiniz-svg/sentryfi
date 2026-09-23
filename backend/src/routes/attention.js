const express = require("express");
const { isPlatformAdmin } = require("../middleware/platform");
const loans = require("../ledger/loans");

const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const { formatLaari } = require("../ledger/money");
const gstReturn = require("../ledger/gstReturn");

/**
 * Everything that needs this person, in this company. `who` carries the
 * company, the person and what they may do (a request, or the same shape made
 * for the notification sweep).
 */
async function collect(client, req) {
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

    // 5. Money customers owe that is late. Read from the invoices and what
    // has been applied to them, the same way the aged list is — never from a
    // "paid" flag, because there is none.
    const { rows: late } = await client.query(
      `SELECT s.invoice_no, c.name AS customer, s.due_date,
              s.gross_laari
                - COALESCE((SELECT SUM(a.amount_laari) FROM receipt_allocations a
                             JOIN receipts r ON r.id = a.receipt_id AND r.voided_at IS NULL
                            WHERE a.invoice_id = s.id), 0)
                - COALESCE((SELECT SUM(n.gross_laari) FROM credit_notes n
                            WHERE n.invoice_id = s.id), 0) AS left_laari,
              (current_date - s.due_date) AS days_over
         FROM sales_invoices s
         LEFT JOIN counterparties c ON c.id = s.counterparty_id
        WHERE s.company_id = $1 AND s.status = 'posted' AND s.voided_at IS NULL
          AND s.due_date < current_date
        ORDER BY s.due_date ASC`,
      [req.companyId]
    );
    for (const row of late.filter((r) => BigInt(r.left_laari) > 0n)) {
      found.push({
        kind: "ageing",
        title: `${row.customer || "A customer"} is ${row.days_over} ${row.days_over === 1 ? "day" : "days"} late`,
        detail: `${row.invoice_no} · MVR ${formatLaari(BigInt(row.left_laari))} still owed.`,
        does: "Chase it, or record the money if it came in",
        href: `/invoices`,
      });
    }

    // 6. Money the bank shows that the books do not explain. One item, not
    //    one per line: the statement is four transactions a day, and a list
    //    that grows with routine work would mean the rule was broken. Leaving
    //    a line for later takes it out, so this can always be cleared.
    const { rows: unexplained } = await client.query(
      `SELECT count(*)::int AS n, COALESCE(SUM(debit_laari + credit_laari), 0) AS total,
              min(posted_on)::text AS oldest, (current_date - min(posted_on))::int AS days
         FROM bank_statement_lines
        WHERE company_id = $1 AND status = 'open' AND debit_laari + credit_laari > 0`,
      [req.companyId]
    );
    if (unexplained[0].n > 0) {
      const u = unexplained[0];
      found.push({
        kind: u.days > 30 ? "ageing" : "waiting",
        title: `${u.n} bank ${u.n === 1 ? "line" : "lines"} the books do not explain`,
        detail: `MVR ${formatLaari(BigInt(u.total))} moved at the bank with nothing in the books behind it. The oldest is from ${u.oldest}.`,
        does: "Say what they were, or leave them for later",
        href: `/bank`,
      });
    }

    // A loan instalment that fell due with no repayment recorded. Either it
    //    was paid and the books do not know, or it was missed and the lender
    //    may be charging penalty interest; both need a person.
    for (const l of await loans.list(client, { companyId: req.companyId })) {
      if (!l.next?.late || l.lent) continue;
      found.push({
        kind: "ageing",
        title: `${l.name}: MVR ${l.next.payment} was due on ${l.next.due}`,
        detail: "If it was paid, record it so what it cost and what is still owed are right. If it was missed, the lender may be adding penalty interest.",
        does: "Record the repayment",
        href: "/loans",
      });
    }

    // Repeat billing that has come due is raised now, whatever the hourly
    //    job managed, so a missed hour never means a missed invoice.
    if (req.can("record")) {
      await client.query("SAVEPOINT recurring");
      try {
        const raised = await require("../ledger/recurring").runDue(client, { companyId: req.companyId, userId: req.user.id });
        await require("./recurring").announce(client, req.companyId, raised);
        await client.query("RELEASE SAVEPOINT recurring");
      } catch (err) {
        await client.query("ROLLBACK TO SAVEPOINT recurring");
        console.error(JSON.stringify({ at: "recurring-on-open", company: req.companyId, error: err.message }));
      }
    }

    // Purchase orders waiting for someone who can approve them: nothing can
    //    be received against them until then, and a supplier is waiting.
    if (req.can("approve")) {
      const { rows: waitingOrders } = await client.query(
        `SELECT count(*)::int AS n, min(o.number) AS first FROM orders o
          WHERE o.company_id = $1 AND o.kind = 'purchase' AND o.needs_approval AND o.approved_at IS NULL AND o.cancelled_at IS NULL`,
        [req.companyId]
      );
      if (waitingOrders[0].n > 0) {
        found.push({
          kind: "waiting",
          title: `${waitingOrders[0].n} purchase ${waitingOrders[0].n === 1 ? "order waits" : "orders wait"} for your approval`,
          detail: `Nothing can be received against ${waitingOrders[0].n === 1 ? `${waitingOrders[0].first}` : "them"} until it is approved.`,
          does: "Look at the orders",
          href: "/orders",
        });
      }
    }

    // A project whose spent and committed cost has gone past its budget:
    //    the margin is going, and the sooner someone knows the more of it
    //    can be saved.
    for (const p of await require("../ledger/projects").list(client, { companyId: req.companyId })) {
      if (!p.overBudget.length) continue;
      found.push({
        kind: "money_at_risk",
        title: `${p.name} is over budget on ${p.overBudget.join(" and ")}`,
        detail: `Spent and committed go past the budget. Forecast margin: ${p.forecastMargin === null ? "no contract value yet" : `MVR ${p.forecastMargin}`}.`,
        does: "Open the project",
        href: `/projects/${p.id}`,
      });
    }

    // 0. The books are backed up and proven to restore, or somebody who can
    //    fix it is told. Silence from a backup job is how nobody notices it
    //    stopped months ago.
    if (isPlatformAdmin(req.user) && process.env.BACKUP_KEY) {
      const { rows: last } = await client.query(
        `SELECT max(started_at) FILTER (WHERE ok) AS good,
                (SELECT problem FROM backup_runs ORDER BY started_at DESC LIMIT 1) AS problem
           FROM backup_runs`
      );
      const good = last[0]?.good ? new Date(last[0].good) : null;
      if (!good || Date.now() - good.getTime() > 36 * 3600_000) {
        found.push({
          kind: "money_at_risk",
          title: good ? "The books have not been backed up for over a day" : "The books have not been backed up yet",
          detail: last[0]?.problem ? `The last try failed: ${last[0].problem}` : "Nothing has been backed up and restored successfully.",
          does: "See backups",
          href: "/settings",
        });
      }
    }

    // 7. The GST return. Only in the last two weeks, and until somebody says
    //    it was filed: a countdown that is always there is one nobody reads.
    //    Late is money at risk, because MIRA fines late returns.
    const r = await gstReturn.build(client, { companyId: req.companyId });
    const left = r.period.daysLeft;
    if (!r.filed && r.pack.filing.dueDay && left !== null && left <= 14) {
      const owe = r.out.tax - r.inp.tax;
      found.push({
        kind: left < 0 ? "money_at_risk" : "waiting",
        title:
          left < 0
            ? `The ${r.period.label} GST return is ${-left} ${left === -1 ? "day" : "days"} late`
            : `The ${r.period.label} GST return is due in ${left} ${left === 1 ? "day" : "days"}`,
        detail:
          `${owe < 0n ? "Refundable" : "Payable"} so far: MVR ${formatLaari(owe < 0n ? -owe : owe)}.` +
          (r.problems.length ? ` ${r.problems.length} ${r.problems.length === 1 ? "thing" : "things"} would make it wrong.` : ""),
        does: "Open the tax return",
        href: `/tax`,
      });
    }

    found.sort((a, b) => SEVERITY[a.kind] - SEVERITY[b.kind]);
    return found;
}

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
    const items = await asCompany(req, (client) => collect(client, req));

    res.json({
      items,
      // Said plainly rather than as a count, because "0 items" is not the same
      // sentence as "nothing is waiting on you".
      allClear: items.length === 0,
    });
  })
);

module.exports = router;
module.exports.collect = collect;

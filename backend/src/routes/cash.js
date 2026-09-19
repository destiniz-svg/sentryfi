const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const { formatLaari } = require("../ledger/money");
const cash = require("../ledger/cash");

/**
 * Cash boxes: what is in them, what left them, and what was counted.
 *
 * Every figure on this route is read from journal lines. Nothing here keeps a
 * balance of its own, so the screen showing a tin and the journal behind it
 * cannot disagree — which matters more for cash than for anything else,
 * because cash is the one place where a third record already exists in
 * somebody's pocket.
 */

const router = express.Router();
router.use(requireAuth, requireCompany);

const money = (laari) => formatLaari(BigInt(laari || 0));

const amount = z.union([z.string().trim().min(1), z.number()]);

const newBox = z.object({
  name: z.string().trim().min(2, "A cash box needs a name.").max(80),
  holderId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
});

const newSpend = z.object({
  amount,
  what: z.string().trim().min(2, "Say what it was spent on.").max(200),
  accountId: z.string().uuid("Which kind of spending is it?"),
  projectId: z.string().uuid().nullish(),
  spentOn: z.string().trim().nullish(),
});

const newCount = z.object({
  counted: amount,
  reason: z.string().trim().max(500).nullish(),
});

const newTopup = z.object({ amount, note: z.string().trim().max(300).nullish() });
const settleTopup = z.object({ given: amount.nullish() });

/** Every open box, with what the books say is in it. */
router.get(
  "/",
  requireCan("read", "spend_cash", "count_cash"),
  asyncHandler(async (req, res) => {
    const boxes = await asCompany(req, async (client) => {
      const { rows } = await client.query(
        `SELECT b.id, b.name, b.account_id, b.opened_at,
                u.name AS holder_name,
                p.name AS project_name,
                COALESCE(SUM(l.debit_laari) - SUM(l.credit_laari), 0) AS balance,
                (SELECT max(c.counted_at) FROM cash_counts c WHERE c.box_id = b.id) AS last_counted,
                (SELECT COALESCE(SUM(t.asked_laari), 0) FROM cash_topups t
                  WHERE t.box_id = b.id AND t.status = 'asked') AS asked_for
           FROM cash_boxes b
           LEFT JOIN users u ON u.id = b.holder_id
           LEFT JOIN projects p ON p.id = b.project_id
           LEFT JOIN journal_lines l
                  ON l.account_id = b.account_id AND l.company_id = b.company_id
          WHERE b.company_id = $1 AND b.closed_at IS NULL
          GROUP BY b.id, u.name, p.name
          ORDER BY b.opened_at`,
        [req.companyId]
      );
      return rows;
    });

    res.json({
      boxes: boxes.map((b) => ({
        id: b.id,
        name: b.name,
        holder: b.holder_name,
        project: b.project_name,
        inBox: money(b.balance),
        // Below zero means more has been spent than was ever put in. It is not
        // an error to hide: it is the finding.
        overdrawn: BigInt(b.balance) < 0n,
        lastCounted: b.last_counted,
        askedFor: BigInt(b.asked_for) > 0n ? money(b.asked_for) : null,
      })),
    });
  })
);

/** What kinds of spending a handful of cash can be. Plain words only. */
router.get(
  "/kinds",
  requireCan("read", "spend_cash"),
  asyncHandler(async (req, res) => {
    const rows = await asCompany(req, async (client) => {
      const { rows: found } = await client.query(
        `SELECT id, code, name FROM accounts
          WHERE company_id = $1 AND type = 'expense' AND archived_at IS NULL
          ORDER BY code`,
        [req.companyId]
      );
      return found;
    });
    res.json({ kinds: rows.map((r) => ({ id: r.id, name: r.name })) });
  })
);

router.post(
  "/",
  requireCan("manage_settings"),
  asyncHandler(async (req, res) => {
    const parsed = newBox.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);

    try {
      const box = await asCompany(req, (client) =>
        cash.openBox(client, {
          companyId: req.companyId,
          userId: req.user.id,
          ...parsed.data,
        })
      );
      res.status(201).json({ box: { id: box.id, name: box.name, inBox: "0.00" } });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

/** Money out of the tin. Posted as it is recorded. */
router.post(
  "/:id/spend",
  requireCan("spend_cash", "record"),
  asyncHandler(async (req, res) => {
    const parsed = newSpend.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);

    try {
      const result = await asCompany(req, (client) =>
        cash.spend(client, {
          companyId: req.companyId,
          userId: req.user.id,
          boxId: req.params.id,
          ...parsed.data,
        })
      );
      res.status(201).json({
        spendId: result.spend.id,
        entryId: result.entry.id,
        entryNo: String(result.entry.entryNo),
        amount: money(result.spend.amount_laari),
        leftInBox: formatLaari(result.leftInBox),
        overdrawn: result.overdrawn,
      });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

/** What is in the tin, against what the books say. */
router.post(
  "/:id/count",
  requireCan("count_cash", "record"),
  asyncHandler(async (req, res) => {
    const parsed = newCount.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);

    try {
      const result = await asCompany(req, (client) =>
        cash.count(client, {
          companyId: req.companyId,
          userId: req.user.id,
          boxId: req.params.id,
          ...parsed.data,
        })
      );

      const short = result.difference < 0n;
      const size = short ? -result.difference : result.difference;
      res.status(201).json({
        countId: result.count.id,
        counted: formatLaari(result.counted),
        expected: formatLaari(result.expected),
        difference: result.difference === 0n ? null : formatLaari(size),
        short,
        entryNo: result.entry ? String(result.entry.entryNo) : null,
        // Said in the words the person counting would use.
        said:
          result.difference === 0n
            ? "The tin and the books agree."
            : short
              ? `${formatLaari(size)} less than the books said. The books now match the tin, and the difference is in the journal.`
              : `${formatLaari(size)} more than the books said. The books now match the tin, and the difference is in the journal.`,
      });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

/** What has left this tin, and what was counted. */
router.get(
  "/:id/history",
  requireCan("read", "spend_cash", "count_cash"),
  asyncHandler(async (req, res) => {
    const data = await asCompany(req, async (client) => {
      const { rows: spends } = await client.query(
        `SELECT s.id, s.amount_laari, s.what, s.spent_on, s.voided_at,
                a.name AS kind, u.name AS who
           FROM cash_spends s
           LEFT JOIN accounts a ON a.id = s.account_id
           LEFT JOIN users u ON u.id = s.spent_by
          WHERE s.company_id = $1 AND s.box_id = $2
          ORDER BY s.spent_on DESC, s.created_at DESC
          LIMIT 50`,
        [req.companyId, req.params.id]
      );
      const { rows: counts } = await client.query(
        `SELECT c.id, c.counted_laari, c.expected_laari, c.reason, c.counted_at, u.name AS who
           FROM cash_counts c LEFT JOIN users u ON u.id = c.counted_by
          WHERE c.company_id = $1 AND c.box_id = $2
          ORDER BY c.counted_at DESC LIMIT 20`,
        [req.companyId, req.params.id]
      );
      return { spends, counts };
    });

    res.json({
      spends: data.spends.map((s) => ({
        id: s.id,
        amount: money(s.amount_laari),
        what: s.what,
        kind: s.kind,
        who: s.who,
        on: s.spent_on,
        voided: Boolean(s.voided_at),
      })),
      counts: data.counts.map((c) => {
        const difference = BigInt(c.counted_laari) - BigInt(c.expected_laari);
        return {
          id: c.id,
          counted: money(c.counted_laari),
          expected: money(c.expected_laari),
          difference: difference === 0n ? null : formatLaari(difference < 0n ? -difference : difference),
          short: difference < 0n,
          reason: c.reason,
          who: c.who,
          at: c.counted_at,
        };
      }),
    });
  })
);

/** Asking for more. */
router.post(
  "/:id/topup",
  requireCan("spend_cash", "record"),
  asyncHandler(async (req, res) => {
    const parsed = newTopup.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);

    try {
      const topup = await asCompany(req, (client) =>
        cash.askTopup(client, {
          companyId: req.companyId,
          userId: req.user.id,
          boxId: req.params.id,
          ...parsed.data,
        })
      );
      res.status(201).json({ id: topup.id, asked: money(topup.asked_laari), status: topup.status });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

/** Giving it. Only somebody who can move money may do this. */
router.post(
  "/topups/:id/give",
  requireCan("approve", "adjust"),
  asyncHandler(async (req, res) => {
    const parsed = settleTopup.safeParse(req.body ?? {});
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);

    try {
      const result = await asCompany(req, (client) =>
        cash.giveTopup(client, {
          companyId: req.companyId,
          userId: req.user.id,
          topupId: req.params.id,
          given: parsed.data.given ?? null,
        })
      );
      res.json({
        ok: true,
        given: money(result.topup.given_laari),
        entryNo: String(result.entry.entryNo),
      });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

module.exports = router;

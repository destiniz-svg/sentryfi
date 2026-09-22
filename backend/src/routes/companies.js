const express = require("express");
const { z } = require("zod");

const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan, CAN } = require("../middleware/company");
const { withTransaction } = require("../config/db");
const { assumeIdentity } = require("../ledger/post");
const { asCompany } = require("../ledger/session");
const people = require("../ledger/people");

const router = express.Router();
router.use(requireAuth);

/**
 * A starting chart of accounts.
 *
 * Small on purpose. A contractor who has never kept books will not read a list
 * of two hundred accounts, and an accountant will want to shape it themselves
 * anyway. These are the ones the first month cannot be recorded without, named
 * the way the owner would name them rather than the way a textbook would.
 *
 * PRODUCT.md records that the chart is signed off by a licensed accountant
 * before real money is entered; this is the scaffold that gets there, not the
 * final answer.
 */
const STARTING_ACCOUNTS = [
  ["1100", "Bank", "asset"],
  ["1200", "Cash boxes", "asset"],
  ["1300", "Money owed to us", "asset"],
  ["1400", "GST we can claim", "asset"],
  ["2100", "Suppliers we owe", "liability"],
  ["2200", "GST we owe", "liability"],
  ["2300", "Money put in by directors", "liability"],
  ["3100", "Owner's stake", "equity"],
  ["4100", "Work invoiced", "income"],
  ["4200", "Equipment rental", "income"],
  ["5100", "Materials", "expense"],
  ["5200", "Labour", "expense"],
  ["5300", "Subcontractors", "expense"],
  ["5400", "Equipment and fuel", "expense"],
  ["5500", "Transport and boat freight", "expense"],
  ["5600", "Site overheads", "expense"],
  ["5900", "Everything else", "expense"],
];

/** The companies this person belongs to, and what they are in each. */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    // memberships is under row-level security and its policy answers to
    // app.user_id, so this has to say who is asking before it can ask. A plain
    // pool query here would return nothing and look like "you have no
    // companies" rather than like a bug.
    const rows = await withTransaction(async (client) => {
      await client.query("SELECT set_config('app.user_id', $1, true)", [req.user.id]);
      const { rows: found } = await client.query(
        `SELECT c.id, c.name, c.base_currency, c.gst_registered, c.tin, c.gst_number,
                array_agg(m.role::text ORDER BY m.role) AS roles
           FROM memberships m
           JOIN companies c ON c.id = m.company_id
          WHERE m.user_id = $1
          GROUP BY c.id
          ORDER BY c.name`,
        [req.user.id]
      );
      return found;
    });
    res.json({ companies: rows });
  })
);

const newCompany = z.object({
  name: z.string().trim().min(2, "A company needs a name.").max(160),
  tin: z.string().trim().max(40).optional(),
  gstNumber: z.string().trim().max(40).optional(),
  gstRegistered: z.boolean().optional(),
  baseCurrency: z.string().trim().length(3).optional(),
});

/**
 * Opens a set of books.
 *
 * Whoever opens them is their administrator: there is no one else yet to grant
 * it. Everything happens in one transaction, because a company that exists
 * with nobody able to reach it, or with no accounts to post to, is worse than
 * one that was never created.
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = newCompany.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const b = parsed.data;

    const company = await withTransaction(async (client) => {
      const { rows: companyRows } = await client.query(
        `INSERT INTO companies (name, tin, gst_number, gst_registered, base_currency)
         VALUES ($1,$2,$3,COALESCE($4,false),COALESCE($5,'MVR'))
         RETURNING id, name, base_currency, gst_registered`,
        [b.name, b.tin || null, b.gstNumber || null, b.gstRegistered ?? null, b.baseCurrency || null]
      );
      const created = companyRows[0];

      // From here on the connection has to be acting as the new company, or
      // the policies will refuse the rows that belong to it.
      await assumeIdentity(client, { companyId: created.id, userId: req.user.id });

      await client.query(
        `INSERT INTO memberships (user_id, company_id, role)
         VALUES ($1, $2, 'administrator')`,
        [req.user.id, created.id]
      );

      for (const [code, name, type] of STARTING_ACCOUNTS) {
        await client.query(
          `INSERT INTO accounts (company_id, code, name, type)
           VALUES ($1,$2,$3,$4::account_t)`,
          [created.id, code, name, type]
        );
      }

      return created;
    });

    res.status(201).json({ company, roles: ["administrator"] });
  })
);

/** Who is in this company, what each may do, open invitations and the last changes. */
router.get(
  "/current/people",
  requireCompany,
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const found = await asCompany(req, (client) => people.list(client, { companyId: req.companyId }));
    res.json({ ...found, you: { id: req.user.id, roles: req.roles } });
  })
);

const newPerson = z.object({
  email: z.string().trim().toLowerCase().email("That is not an email address."),
  role: z.enum(people.ROLES),
});

/** Adds someone, or makes them a link to join with. */
router.post(
  "/current/people",
  requireCompany,
  requireCan("manage_people"),
  asyncHandler(async (req, res) => {
    const parsed = newPerson.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    try {
      const done = await asCompany(req, (client) =>
        people.add(client, { companyId: req.companyId, userId: req.user.id, ...parsed.data })
      );
      res.status(201).json(done);
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

router.delete(
  "/current/people/:userId/roles/:role",
  requireCompany,
  requireCan("manage_people"),
  asyncHandler(async (req, res) => {
    try {
      await asCompany(req, (client) =>
        people.removeRole(client, {
          companyId: req.companyId, userId: req.user.id, memberId: req.params.userId, role: req.params.role,
        })
      );
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
    res.json({ ok: true });
  })
);

router.delete(
  "/current/invites/:id",
  requireCompany,
  requireCan("manage_people"),
  asyncHandler(async (req, res) => {
    try {
      await asCompany(req, (client) =>
        people.withdraw(client, { companyId: req.companyId, userId: req.user.id, inviteId: req.params.id })
      );
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
    res.json({ ok: true });
  })
);

/** What the signed-in person may do here, so the screens can stop guessing. */
router.get(
  "/current",
  requireCompany,
  asyncHandler(async (req, res) => {
    res.json({
      company: req.company,
      roles: req.roles,
      /**
       * Every capability, spelled the way the table spells it.
       *
       * This used to list eight of them by hand in camelCase while the table
       * they come from is snake_case. A screen asking can("manage_settings")
       * got false, silently, and the button it guarded simply never appeared
       * — with nothing anywhere to say why. Two spellings for one idea is a
       * defect waiting to be rediscovered, and a hand-written list goes stale
       * the moment a capability is added, which is exactly what happened when
       * cash arrived with spend_cash and count_cash.
       */
      can: Object.fromEntries(
        [...new Set(Object.values(CAN).flat())].map((action) => [action, req.can(action)])
      ),
    });
  })
);

module.exports = router;

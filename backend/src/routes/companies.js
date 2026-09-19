const express = require("express");
const { z } = require("zod");

const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { withTransaction } = require("../config/db");
const { assumeIdentity } = require("../ledger/post");

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

/** Who else is in this company. */
router.get(
  "/current/people",
  requireCompany,
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const people = await withTransaction(async (client) => {
      await assumeIdentity(client, { companyId: req.companyId, userId: req.user.id });
      const { rows } = await client.query(
        `SELECT m.id, m.role::text AS role, m.spend_limit_laari,
                u.id AS user_id, u.name, u.email
           FROM memberships m
           JOIN users u ON u.id = m.user_id
          WHERE m.company_id = $1
          ORDER BY u.name`,
        [req.companyId]
      );
      return rows;
    });
    res.json({ people, you: { roles: req.roles } });
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
      can: {
        read: req.can("read"),
        record: req.can("record"),
        approve: req.can("approve"),
        adjust: req.can("adjust"),
        close: req.can("close"),
        managePeople: req.can("manage_people"),
        manageSettings: req.can("manage_settings"),
        capture: req.can("capture"),
      },
    });
  })
);

module.exports = router;

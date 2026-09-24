const express = require("express");
const { z } = require("zod");

const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan, CAN } = require("../middleware/company");
const crypto = require("crypto");
const { withTransaction, pool } = require("../config/db");
const { toLaari, formatLaari } = require("../ledger/money");
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
const CORE_ACCOUNTS = [
  ["1100", "Bank", "asset"],
  ["1200", "Cash boxes", "asset"],
  ["1300", "Money owed to us", "asset"],
  ["1400", "{tax} we can claim", "asset"],
  ["2100", "Suppliers we owe", "liability"],
  ["2200", "{tax} we owe", "liability"],
  ["2300", "Money put in by directors", "liability"],
  ["3100", "Owner's stake", "equity"],
  ["5900", "Everything else", "expense"],
];

/**
 * What the business sells and spends on, by the industry it said it is in when
 * it opened its books. Same core for all; only these lines differ, so a hotel
 * is not handed "Site overheads" and a builder is not handed "Rooms".
 */
const INDUSTRY_ACCOUNTS = {
  construction: [
    ["4100", "Work invoiced", "income"],
    ["4200", "Equipment rental", "income"],
    ["5100", "Materials", "expense"],
    ["5200", "Labour", "expense"],
    ["5300", "Subcontractors", "expense"],
    ["5400", "Equipment and fuel", "expense"],
    ["5500", "Transport and boat freight", "expense"],
    ["5600", "Site overheads", "expense"],
  ],
  trading: [
    ["4100", "Sales", "income"],
    ["5050", "Cost of goods sold", "expense"],
    ["5200", "Staff", "expense"],
    ["5500", "Freight, customs and clearing", "expense"],
    ["5600", "Rent and utilities", "expense"],
  ],
  tourism: [
    ["4100", "Rooms", "income"],
    ["4200", "Food and drink", "income"],
    ["4300", "Excursions and transfers", "income"],
    ["5100", "Food and drink supplies", "expense"],
    ["5200", "Staff", "expense"],
    ["5400", "Boats, transfers and fuel", "expense"],
    ["5600", "Rent and utilities", "expense"],
    ["5700", "Agent commissions", "expense"],
  ],
  services: [
    ["4100", "Fees invoiced", "income"],
    ["5200", "Staff", "expense"],
    ["5300", "Contractors", "expense"],
    ["5600", "Rent and utilities", "expense"],
    ["5700", "Software and subscriptions", "expense"],
  ],
  retail: [
    ["4100", "Sales", "income"],
    ["5050", "Cost of goods sold", "expense"],
    ["5200", "Staff", "expense"],
    ["5500", "Delivery", "expense"],
    ["5600", "Rent and utilities", "expense"],
  ],
  other: [
    ["4100", "Sales", "income"],
    ["5100", "Purchases", "expense"],
    ["5200", "Staff", "expense"],
    ["5600", "Rent and utilities", "expense"],
  ],
};

const startingAccounts = (industry) => [...CORE_ACCOUNTS, ...INDUSTRY_ACCOUNTS[industry || "construction"]].sort((a, b) => a[0].localeCompare(b[0]));

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
  // Which country's tax pack the books keep to (ledger/tax.js): the Maldives by default.
  country: z.enum(["MV", "AE", "GENERIC"]).optional(),
  // The rest of what onboarding asks (pages/OpenBooks.jsx).
  registrationNo: z.string().trim().max(60).optional(),
  industry: z.enum(["construction", "trading", "tourism", "services", "retail", "other"]).optional(),
  yearStarts: z.number().int().min(1).max(12).optional(),
  gstSector: z.enum(["general", "tourism", "both"]).optional(),
  gstPeriod: z.enum(["month", "quarter"]).optional(),
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
    const pack = require("../ledger/tax").packCalled(b.country || "MV");

    const company = await withTransaction(async (client) => {
      const { rows: companyRows } = await client.query(
        `INSERT INTO companies (name, tin, gst_number, gst_registered, base_currency, tax_pack,
                                registration_no, industry, year_starts, gst_sector, gst_period, plan, trial_ends_at)
         VALUES ($1,$2,$3,COALESCE($4,false),COALESCE($5,'MVR'),$6,$7,$8,COALESCE($9,1),$10,COALESCE($11,'month'),'trial',
                 now() + make_interval(days => $12))
         RETURNING id, name, base_currency, gst_registered`,
        [
          b.name, b.tin || null, b.gstNumber || null,
          // A tourism business registers whatever it sells.
          b.gstSector ? true : b.gstRegistered ?? null,
          b.baseCurrency ? b.baseCurrency.toUpperCase() : pack.currency || null, pack.code,
          b.registrationNo || null, b.industry || null, b.yearStarts || null, b.gstSector || null, b.gstPeriod || null,
          require("../ledger/platform").TRIAL_DAYS,
        ]
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

      for (const [code, name, type] of startingAccounts(b.industry)) {
        await client.query(
          `INSERT INTO accounts (company_id, code, name, type)
           VALUES ($1,$2,$3,$4::account_t)`,
          [created.id, code, name.replace("{tax}", pack.words.tax), type]
        );
      }

      return created;
    });

    res.status(201).json({ company, roles: ["administrator"] });
  })
);

/** The first things a new company does, ticked off from its own books (ledger/setup.js). */
router.get(
  "/current/setup",
  requireCompany,
  requireCan("read"),
  asyncHandler(async (req, res) => {
    res.json(await asCompany(req, (client) => require("../ledger/setup").steps(client, { companyId: req.companyId })));
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

/** A spending limit on one person: bills over it wait for someone who approves. Empty removes it. */
router.put(
  "/current/people/:userId/limit",
  requireCompany,
  requireCan("manage_people"),
  asyncHandler(async (req, res) => {
    const raw = req.body?.limit;
    const clear = raw === null || raw === undefined || String(raw).trim() === "";
    let laari = null;
    if (!clear) {
      try {
        laari = toLaari(raw);
      } catch {
        throw ApiError.badRequest("That is not an amount.");
      }
      if (laari < 0n) throw ApiError.badRequest("A limit cannot be below nothing.");
    }
    await asCompany(req, async (client) => {
      const { rows } = await client.query("SELECT 1 FROM memberships WHERE company_id = $1 AND user_id = $2", [req.companyId, req.params.userId]);
      if (!rows.length) throw ApiError.notFound("That person is not in this company.");
      if (clear) await client.query("DELETE FROM spending_limits WHERE company_id = $1 AND user_id = $2", [req.companyId, req.params.userId]);
      else
        await client.query(
          `INSERT INTO spending_limits (company_id, user_id, limit_laari, set_by) VALUES ($1,$2,$3,$4)
           ON CONFLICT (company_id, user_id) DO UPDATE SET limit_laari = EXCLUDED.limit_laari, set_by = EXCLUDED.set_by, set_at = now()`,
          [req.companyId, req.params.userId, laari.toString(), req.user.id]
        );
    });
    res.json({ ok: true, limit: clear ? null : formatLaari(laari) });
  })
);

/**
 * A link to set a new password, for someone who has forgotten theirs. Only
 * for a person who belongs to this company and no other: a link is the key to
 * their account, and one company's administrator must never hold the key to
 * someone who also keeps another company's books.
 */
router.post(
  "/current/people/:userId/reset",
  requireCompany,
  requireCan("manage_people"),
  asyncHandler(async (req, res) => {
    const who = req.params.userId;
    if (who === req.user.id) throw ApiError.badRequest("Change your own password in Settings, Password.");
    // Across companies on purpose, before stepping into this company's walls.
    const { rows: where } = await pool.query("SELECT DISTINCT company_id FROM memberships WHERE user_id = $1", [who]);
    if (!where.some((w) => w.company_id === req.companyId)) throw ApiError.notFound("That person is not in this company.");
    if (where.length > 1) {
      throw ApiError.badRequest("They belong to other companies too, so only they can reset it. Ask them to sign in with Face ID or a fingerprint if they set one up.");
    }
    const secret = crypto.randomBytes(24).toString("base64url");
    const hash = crypto.createHash("sha256").update(secret).digest("hex");
    await pool.query("UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [who]);
    await pool.query("INSERT INTO password_resets (user_id, company_id, token_hash, issued_by) VALUES ($1,$2,$3,$4)", [who, req.companyId, hash, req.user.id]);
    res.status(201).json({ token: secret, expiresInHours: 24 });
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

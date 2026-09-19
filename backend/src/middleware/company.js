/**
 * Which company, and what this person may do in it.
 *
 * Roles are held per company rather than per person, so the same individual
 * can be an administrator in one entity and a viewer in another. That is not
 * hypothetical here: the owner is a director of several companies in one group.
 *
 * This runs after requireAuth. It establishes which company the request is
 * acting in, checks the person is actually a member, and puts the role on the
 * request so route guards can read it. The database still enforces isolation —
 * this decides which company to claim, the policies decide whether the claim
 * is honoured.
 *
 * Note on the lookup: memberships is itself under row-level security, and its
 * policy answers to app.user_id. So the lookup has to say who is asking before
 * it can ask, which means a transaction, because SET LOCAL has nowhere else to
 * live. Querying the pool directly here would quietly return no rows and every
 * request would be refused.
 */

const ApiError = require("../utils/ApiError");
const { withTransaction } = require("../config/db");

const COMPANY_HEADER = "x-company-id";

/**
 * What each role may do. Deliberately one table rather than checks scattered
 * through route files, so "who can post an adjustment?" is readable in one
 * place instead of assembled from a dozen.
 */
const CAN = {
  administrator: [
    "read", "record", "approve", "adjust", "close", "manage_people", "manage_settings",
  ],
  accountant: ["read", "record", "adjust", "close"],
  manager: ["read", "record"],
  approver: ["read", "approve"],
  viewer: ["read"],
  auditor: ["read", "read_trail"],
  site_staff: ["capture"],
  cash_holder: ["capture", "spend_cash", "count_cash"],
  procurement: ["capture", "order", "receive"],
};

function rolesCan(roles, action) {
  return roles.some((role) => (CAN[role] || []).includes(action));
}

/**
 * The actual resolution, separated from the middleware so it can be run
 * against a transaction that has not committed — which is how the self-test
 * exercises it without leaving anything behind.
 *
 * Throws ApiError; returns { companyId, company, roles }.
 */
async function resolveCompany(client, { userId, asked }) {
  // Say who is asking, or the policy on memberships hides everything.
  await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);

  const { rows: memberships } = await client.query(
    `SELECT m.company_id, m.role::text AS role,
            c.name, c.base_currency, c.gst_registered
       FROM memberships m
       JOIN companies c ON c.id = m.company_id
      WHERE m.user_id = $1
      ORDER BY c.name`,
    [userId]
  );

  if (!memberships.length) {
    throw ApiError.forbidden(
      "You are not a member of any company yet. An administrator needs to add you to one."
    );
  }

  let chosen;
  if (asked) {
    chosen = memberships.filter((m) => m.company_id === asked);
    if (!chosen.length) {
      // Not "no such company": telling someone outside it that it exists is
      // itself a leak.
      throw ApiError.forbidden("You are not a member of that company.");
    }
  } else {
    const distinct = [...new Set(memberships.map((m) => m.company_id))];
    if (distinct.length > 1) {
      throw ApiError.badRequest(
        "You belong to more than one company. Say which one this is for."
      );
    }
    chosen = memberships;
  }

  return {
    companyId: chosen[0].company_id,
    company: {
      id: chosen[0].company_id,
      name: chosen[0].name,
      baseCurrency: chosen[0].base_currency,
      gstRegistered: chosen[0].gst_registered,
    },
    // A person may hold more than one role in the same company.
    roles: chosen.map((m) => m.role),
  };
}

async function requireCompany(req, res, next) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const asked = req.get(COMPANY_HEADER) || req.query.company || null;

    const resolved = await withTransaction((client) =>
      resolveCompany(client, { userId: req.user.id, asked })
    );

    req.companyId = resolved.companyId;
    req.company = resolved.company;
    req.roles = resolved.roles;
    req.can = (action) => rolesCan(resolved.roles, action);

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Guards a route by what the person may do rather than by what they are
 * called. Routes ask for the capability, so adding a role later means editing
 * the table above and nothing else.
 */
function requireCan(action) {
  return function (req, res, next) {
    if (!req.roles) {
      return next(new Error("requireCan: put requireCompany in front of this route."));
    }
    if (!req.can(action)) {
      return next(
        ApiError.forbidden(
          `Your role in ${req.company?.name || "this company"} does not allow that.`
        )
      );
    }
    next();
  };
}

module.exports = {
  requireCompany,
  requireCan,
  resolveCompany,
  CAN,
  rolesCan,
  COMPANY_HEADER,
};

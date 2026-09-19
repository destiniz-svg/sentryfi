/**
 * Acting as somebody, in some company.
 *
 * The ledger decides which rows exist from two settings on the connection:
 * app.company_id and app.user_id. They are set with SET LOCAL, so they last
 * exactly one transaction and a pooled connection handed to the next request
 * carries nothing over.
 *
 * That makes the transaction the unit of identity, not the request. So every
 * route that touches the books opens one through here rather than calling the
 * pool directly. A query run outside this helper has no company set, and
 * because the policies fail closed it returns nothing at all — which is the
 * right failure, but a confusing one to debug. If a ledger query comes back
 * empty when it should not, this is the first thing to check.
 */

const { withTransaction } = require("../config/db");
const { assumeIdentity } = require("./post");

/**
 * Runs fn inside a transaction that is already acting as the request's company
 * and user. fn receives the client; everything it does is inside the walls.
 */
async function asCompany(req, fn) {
  if (!req.companyId) {
    throw new Error(
      "asCompany: no company on the request. Put requireCompany in front of this route."
    );
  }
  return withTransaction(async (client) => {
    await assumeIdentity(client, { companyId: req.companyId, userId: req.user.id });
    return fn(client);
  });
}

/**
 * The same, for reads that do not need a transaction of their own but still
 * need the identity. It is still a transaction underneath, because SET LOCAL
 * has nowhere else to live.
 */
async function readAsCompany(req, fn) {
  return asCompany(req, fn);
}

module.exports = { asCompany, readAsCompany };

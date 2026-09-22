const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const history = require("../ledger/historyImport");

/**
 * History from another system. The CSV travels as the request body, both to
 * preview and to commit, so nothing half-imported is ever stored between the
 * two: a person looks, then says yes to exactly what they looked at.
 */

const router = express.Router();
router.use(requireAuth, requireCompany);

const SYSTEMS = ["zoho", "quickbooks", "xero", "other"];

function args(req) {
  const system = String(req.query.system || "zoho");
  if (!SYSTEMS.includes(system)) throw ApiError.badRequest("Which system did this come from?");
  const body = req.body || {};
  const text = typeof body === "string" ? body : body.text;
  if (typeof text !== "string" || !text.trim()) throw ApiError.badRequest("That file has nothing in it.");
  const limit = typeof body === "object" && Number.isInteger(body.limit) && body.limit > 0 ? Math.min(body.limit, 2000) : null;
  return { system, text, limit, mapping: typeof body === "object" ? body.mapping || {} : {} };
}

router.post(
  "/preview",
  requireCan("adjust"),
  express.text({ type: () => true, limit: "20mb" }),
  asyncHandler(async (req, res) => {
    const a = args(req);
    try {
      res.json(await asCompany(req, (client) => history.preview(client, { companyId: req.companyId, ...a })));
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

router.post(
  "/commit",
  requireCan("adjust"),
  asyncHandler(async (req, res) => {
    const a = args(req);
    try {
      res.status(201).json(
        await asCompany(req, (client) => history.commit(client, { companyId: req.companyId, userId: req.user.id, ...a }))
      );
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

/** Their chart of accounts: each account's own type, so nothing is guessed. Reads only. */
router.post(
  "/chart",
  requireCan("adjust"),
  express.text({ type: () => true, limit: "5mb" }),
  asyncHandler(async (req, res) => {
    try {
      res.json({ types: history.readChart(typeof req.body === "string" ? req.body : "") });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

/** After an import: which accounts' kind disagrees with their chart. Reads only. */
router.post(
  "/chart/check",
  requireCan("manage_settings"),
  express.text({ type: () => true, limit: "5mb" }),
  asyncHandler(async (req, res) => {
    const system = String(req.query.system || "zoho");
    try {
      const differ = await asCompany(req, (client) =>
        history.chartDifferences(client, { companyId: req.companyId, system, text: typeof req.body === "string" ? req.body : "" })
      );
      res.json({ differ });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

/** Correct those accounts' kind. No entry changes; each change is logged with its reason. */
router.post(
  "/chart/apply",
  requireCan("manage_settings"),
  asyncHandler(async (req, res) => {
    const changes = Array.isArray(req.body?.changes) ? req.body.changes : [];
    if (!changes.length) throw ApiError.badRequest("Nothing to change.");
    try {
      res.json(
        await asCompany(req, (client) =>
          history.reclassify(client, { companyId: req.companyId, userId: req.user.id, changes, reason: req.body.reason })
        )
      );
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

module.exports = router;

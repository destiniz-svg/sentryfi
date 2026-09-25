const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const numbering = require("../ledger/numbering");

/** How each kind of document is numbered (/api/numbering). */
const router = express.Router();
router.use(requireAuth, requireCompany);

router.get(
  "/",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    res.json({ kinds: await asCompany(req, (client) => numbering.list(client, { companyId: req.companyId })) });
  })
);

router.put(
  "/:kind",
  requireCan("manage_settings"),
  asyncHandler(async (req, res) => {
    try {
      const next = await asCompany(req, (client) => numbering.save(client, { companyId: req.companyId, userId: req.user.id, kind: req.params.kind, start: req.body?.start }));
      res.json({ next });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

module.exports = router;

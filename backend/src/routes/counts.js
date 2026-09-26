const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const stock = require("../ledger/stock");
const counts = require("../ledger/counts");
const { formatLaari } = require("../ledger/money");

/**
 * Counting sessions. Those who read the books start them, see them, and
 * approve differences beyond the tolerance. The counter may be anyone in the
 * company, field staff included: they see only their own count, its items and
 * units, never the books' figure or a price.
 */
const router = express.Router();
router.use(requireAuth, requireCompany);

const refused = (fn) =>
  asyncHandler(async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.badRequest(err.message);
    }
  });
const as = (req, fn) => asCompany(req, (client) => fn(client, { companyId: req.companyId, userId: req.user.id }));

// The counts, what is due at each place, and who can count.
router.get(
  "/",
  requireCan("read"),
  refused(async (req, res) =>
    res.json(
      await as(req, async (client, ctx) => {
        const due = await counts.due(client, ctx);
        const byPlace = {};
        for (const d of due.filter((x) => x.overdue)) byPlace[d.place] = (byPlace[d.place] || 0) + 1;
        return {
          tolerance: formatLaari(await counts.tolerance(client, req.companyId)),
          counts: await counts.list(client, ctx),
          due: byPlace,
          places: await stock.places(client, ctx),
          people: (await client.query("SELECT DISTINCT u.id, u.name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.company_id = $1 ORDER BY u.name", [req.companyId])).rows,
        };
      })
    )
  )
);

// How large a difference may be before a second person decides, in rufiyaa.
router.put(
  "/tolerance",
  requireCan("manage_settings"),
  refused(async (req, res) => {
    const amount = z.union([z.string().trim().min(1, "Say an amount."), z.number()]).transform(String).safeParse(req.body?.amount);
    if (!amount.success) throw ApiError.badRequest(amount.error.issues[0].message);
    res.json(await as(req, (client, ctx) => counts.setTolerance(client, { ...ctx, amount: amount.data })));
  })
);

// A counter's own open counts, for their home screen.
router.get(
  "/mine",
  refused(async (req, res) => res.json({ counts: await as(req, (client, ctx) => counts.list(client, { ...ctx, counter: req.user.id })) }))
);

const createBody = z.object({
  kind: z.enum(["full", "cycle", "spot"]),
  placeId: z.string().uuid().nullish(),
  counterId: z.string().uuid("Who is counting?"),
  note: z.string().trim().max(300).nullish(),
});
router.post(
  "/",
  requireCan("record"),
  refused(async (req, res) => {
    const parsed = createBody.safeParse(req.body ?? {});
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    res.status(201).json(await as(req, (client, ctx) => counts.create(client, { ...ctx, ...parsed.data })));
  })
);

router.get(
  "/:id",
  refused(async (req, res) => res.json(await as(req, (client, ctx) => counts.view(client, { ...ctx, countId: req.params.id, reads: req.can("read") }))))
);

const lineBody = z.object({ counted: z.union([z.string().trim(), z.number()]).transform(String), reason: z.string().trim().max(300).nullish() });
router.post(
  "/:id/lines/:itemId",
  refused(async (req, res) => {
    const parsed = lineBody.safeParse(req.body ?? {});
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    res.json(await as(req, (client, ctx) => counts.saveLine(client, { ...ctx, countId: req.params.id, itemId: req.params.itemId, ...parsed.data })));
  })
);
router.get(
  "/:id/items",
  refused(async (req, res) => res.json({ items: await as(req, (client, ctx) => counts.addable(client, { ...ctx, countId: req.params.id, reads: req.can("read") })) }))
);
router.post(
  "/:id/items",
  refused(async (req, res) => {
    const itemId = z.string().uuid("Which item?").safeParse(req.body?.itemId);
    if (!itemId.success) throw ApiError.badRequest(itemId.error.issues[0].message);
    res.status(201).json(await as(req, (client, ctx) => counts.addLine(client, { ...ctx, countId: req.params.id, itemId: itemId.data })));
  })
);
router.post(
  "/:id/submit",
  refused(async (req, res) => res.json(await as(req, (client, ctx) => counts.submit(client, { ...ctx, countId: req.params.id }))))
);
for (const [path, fn] of [["approve", counts.approve], ["reopen", counts.reopen], ["cancel", counts.cancel]]) {
  router.post(
    `/:id/${path}`,
    requireCan("record"),
    refused(async (req, res) => res.json(await as(req, (client, ctx) => fn(client, { ...ctx, countId: req.params.id }))))
  );
}

module.exports = router;

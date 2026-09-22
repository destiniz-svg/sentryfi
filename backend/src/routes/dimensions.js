const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");

/**
 * What a line can be tagged with: projects, branches, departments, machines,
 * and a kind a company names itself. A kind is switched on by giving it its
 * first value. Values are archived, never deleted: a posted line may name one.
 */

const router = express.Router();
router.use(requireAuth, requireCompany);

const KINDS = ["project", "branch", "department", "machine", "other"];
const addBody = z.object({
  kind: z.enum(KINDS),
  name: z.string().trim().min(1, "Give it a name.").max(120),
});

router.get(
  "/",
  requireCan("read", "capture", "spend_cash"),
  asyncHandler(async (req, res) => {
    const out = await asCompany(req, async (client) => {
      const { rows: dims } = await client.query(
        "SELECT id, kind, name, archived_at IS NOT NULL AS archived FROM dimensions WHERE company_id = $1 ORDER BY kind, lower(name)",
        [req.companyId]
      );
      const { rows: projects } = await client.query(
        "SELECT id, 'project' AS kind, name, archived_at IS NOT NULL AS archived FROM projects WHERE company_id = $1 ORDER BY lower(name)",
        [req.companyId]
      );
      return [...projects, ...dims];
    });
    res.json({ kinds: KINDS, values: out });
  })
);

router.post(
  "/",
  requireCan("manage_settings"),
  asyncHandler(async (req, res) => {
    const parsed = addBody.safeParse(req.body ?? {});
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    const { kind, name } = parsed.data;
    try {
      const made = await asCompany(req, async (client) => {
        const table = kind === "project" ? "projects" : "dimensions";
        const { rows: same } = await client.query(
          `SELECT 1 FROM ${table} WHERE company_id = $1 AND lower(name) = lower($2)${kind === "project" ? "" : " AND kind = $3"}`,
          kind === "project" ? [req.companyId, name] : [req.companyId, name, kind]
        );
        if (same.length) throw new Error(`There is already one called "${name}".`);
        const { rows } =
          kind === "project"
            ? await client.query("INSERT INTO projects (company_id, name) VALUES ($1,$2) RETURNING id, name", [req.companyId, name])
            : await client.query("INSERT INTO dimensions (company_id, kind, name) VALUES ($1,$2,$3) RETURNING id, name", [req.companyId, kind, name]);
        return { ...rows[0], kind };
      });
      res.status(201).json(made);
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

router.post(
  "/:id/archive",
  requireCan("manage_settings"),
  asyncHandler(async (req, res) => {
    const done = await asCompany(req, async (client) => {
      for (const table of ["dimensions", "projects"]) {
        const { rowCount } = await client.query(
          `UPDATE ${table} SET archived_at = COALESCE(archived_at, now()) WHERE company_id = $1 AND id = $2`,
          [req.companyId, req.params.id]
        );
        if (rowCount) return true;
      }
      return false;
    });
    if (!done) throw ApiError.notFound("That is not in these books.");
    res.json({ ok: true });
  })
);

module.exports = router;

const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan, resolveCompany, rolesCan } = require("../middleware/company");
const { validate } = require("../middleware/validate");
const { asCompany } = require("../ledger/session");
const { withTransaction } = require("../config/db");
const { assumeIdentity } = require("../ledger/post");
const zoho = require("../ledger/zoho");
const history = require("../ledger/historyImport");

/**
 * Zoho Books, connected directly. Read-only: it proposes transactions to the
 * same preview and commit a CSV goes through, and a person says yes.
 */

const router = express.Router();
const SYSTEM = "zoho-api";
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/**
 * Where Zoho sends the person back. It arrives as a plain browser visit with
 * no company header, so the company comes from the signed state, and the
 * person must still be signed in here and allowed to manage settings there.
 */
router.get(
  "/callback",
  requireAuth,
  asyncHandler(async (req, res) => {
    const back = (q) => res.redirect(`/import?${new URLSearchParams(q)}`);
    try {
      if (req.query.error) return back({ zoho: "refused", why: String(req.query.error) });
      const { companyId, userId } = zoho.readState(req.query.state);
      if (userId !== req.user.id) throw new Error("That sign-in was started by somebody else.");
      const accountsServer = String(req.query["accounts-server"] || "https://accounts.zoho.com");
      const t = await zoho.exchange({ code: String(req.query.code || ""), accountsServer });

      await withTransaction(async (client) => {
        const { roles } = await resolveCompany(client, { userId, asked: companyId });
        if (!rolesCan(roles, "manage_settings")) throw new Error("Only an administrator can connect Zoho.");
        await assumeIdentity(client, { companyId, userId });
        await client.query("DELETE FROM zoho_connections WHERE company_id = $1", [companyId]);
        await client.query(
          `INSERT INTO zoho_connections (company_id, accounts_server, api_domain, refresh_token_enc, connected_by)
           VALUES ($1,$2,$3,$4,$5)`,
          [companyId, accountsServer, t.apiDomain, zoho.seal(t.refreshToken), userId]
        );
      });
      back({ zoho: "connected" });
    } catch (err) {
      back({ zoho: "failed", why: err.message });
    }
  })
);

router.use(requireAuth, requireCompany);

const connection = (client, companyId) =>
  client.query("SELECT * FROM zoho_connections WHERE company_id = $1", [companyId]).then((r) => r.rows[0] || null);

router.get(
  "/",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const conn = await asCompany(req, (client) => connection(client, req.companyId));
    if (!conn) return res.json({ configured: zoho.configured(), connected: false });
    let organizations = [];
    if (!conn.organization_id) {
      try {
        organizations = await zoho.organizations(await zoho.clientFor(conn));
        if (organizations.length === 1) {
          await asCompany(req, (client) =>
            client.query("UPDATE zoho_connections SET organization_id = $2, organization_name = $3 WHERE company_id = $1", [
              req.companyId,
              organizations[0].id,
              organizations[0].name,
            ])
          );
          conn.organization_id = organizations[0].id;
          conn.organization_name = organizations[0].name;
        }
      } catch (err) {
        return res.json({ configured: true, connected: true, error: err.message });
      }
    }
    res.json({
      configured: true,
      connected: true,
      organization: conn.organization_id ? { id: conn.organization_id, name: conn.organization_name } : null,
      organizations: conn.organization_id ? [] : organizations,
      connectedAt: conn.connected_at,
    });
  })
);

/** Starts the sign-in. The browser follows the URL it gets back. */
router.post(
  "/connect",
  requireCan("manage_settings"),
  asyncHandler(async (req, res) => {
    if (!zoho.configured()) {
      throw ApiError.badRequest("Zoho is not set up on the server yet: ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET are missing.");
    }
    res.json({ url: zoho.authorizeUrl(zoho.makeState({ companyId: req.companyId, userId: req.user.id })) });
  })
);

router.post(
  "/organization",
  requireCan("manage_settings"),
  validate(z.object({ id: z.string().trim().min(1), name: z.string().trim().max(200) })),
  asyncHandler(async (req, res) => {
    await asCompany(req, (client) =>
      client.query("UPDATE zoho_connections SET organization_id = $2, organization_name = $3 WHERE company_id = $1", [req.companyId, req.body.id, req.body.name])
    );
    res.json({ ok: true });
  })
);

router.delete(
  "/",
  requireCan("manage_settings"),
  asyncHandler(async (req, res) => {
    await asCompany(req, (client) => client.query("DELETE FROM zoho_connections WHERE company_id = $1", [req.companyId]));
    res.json({ ok: true });
  })
);

/** Zoho's transactions for the dates, read now. */
async function fetchRange(req) {
  const conn = await asCompany(req, (client) => connection(client, req.companyId));
  if (!conn) throw ApiError.badRequest("Zoho is not connected.");
  if (!conn.organization_id) throw ApiError.badRequest("Say which Zoho organisation first.");
  try {
    return await zoho.transactions(await zoho.clientFor(conn), req.body);
  } catch (err) {
    throw ApiError.badRequest(err.message);
  }
}

const range = z.object({ from: day, to: day, mapping: z.record(z.string(), z.any()).optional() });

router.post(
  "/preview",
  requireCan("adjust"),
  validate(range),
  asyncHandler(async (req, res) => {
    const transactions = await fetchRange(req);
    const out = await asCompany(req, async (client) => {
      const p = await history.preview(client, { companyId: req.companyId, system: SYSTEM, transactions });
      // The same year brought in by CSV as well would count everything twice.
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM imported_records r JOIN journal_entries e ON e.id = r.entry_id
          WHERE r.company_id = $1 AND r.system <> $2 AND e.entry_date BETWEEN $3 AND $4`,
        [req.companyId, SYSTEM, req.body.from, req.body.to]
      );
      return { ...p, fromOtherImports: rows[0].n };
    });
    res.json(out);
  })
);

router.post(
  "/commit",
  requireCan("adjust"),
  validate(range),
  asyncHandler(async (req, res) => {
    const transactions = await fetchRange(req);
    try {
      res.status(201).json(
        await asCompany(req, (client) =>
          history.commit(client, { companyId: req.companyId, userId: req.user.id, system: SYSTEM, transactions, mapping: req.body.mapping || {} })
        )
      );
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

module.exports = router;

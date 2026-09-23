const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { rolesCan } = require("../middleware/company");
const { withTransaction } = require("../config/db");
const { asCompany } = require("../ledger/session");
const { formatLaari } = require("../ledger/money");

/**
 * The practice view: every company a person keeps books for, on one page, for
 * the accountant with several clients (or the owner with several companies).
 * For each: what needs a person, the tax return and whether it is late, bank
 * lines not explained, when the books were last closed, and how far setup is.
 *
 * Each company is read inside its own walls, as this person, with their role
 * there: nothing here sees more than opening that company would.
 *
 * ponytail: companies are read one after another; a practice with dozens of
 * clients wants this cached per company and refreshed in the background.
 */
const router = express.Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const companies = await withTransaction(async (client) => {
      await client.query("SELECT set_config('app.user_id', $1, true)", [req.user.id]);
      const { rows } = await client.query(
        `SELECT c.id, c.name, trim(c.base_currency) AS currency, c.gst_registered, c.tax_pack,
                array_agg(m.role::text) AS roles
           FROM memberships m JOIN companies c ON c.id = m.company_id
          WHERE m.user_id = $1 GROUP BY c.id ORDER BY c.name`,
        [req.user.id]
      );
      return rows;
    });

    const out = [];
    for (const c of companies) {
      const can = (a) => rolesCan(c.roles, a);
      const base = { id: c.id, name: c.name, roles: c.roles, currency: c.currency };
      if (!can("read")) {
        out.push({ ...base, reads: false });
        continue;
      }
      const tax = require("../ledger/tax").wordsOf(require("../ledger/tax").packCalled(c.tax_pack || "MV"));
      const as = { companyId: c.id, user: req.user, can, roles: c.roles, company: { id: c.id, name: c.name, baseCurrency: c.currency, gstRegistered: c.gst_registered, tax } };
      try {
        const summary = await asCompany(as, async (client) => {
          const items = await require("./attention").collect(client, as);
          const setup = await require("../ledger/setup").steps(client, { companyId: c.id });
          const { rows: n } = await client.query(
            `SELECT (SELECT count(*) FROM bank_statement_lines WHERE company_id = $1 AND status = 'open' AND debit_laari + credit_laari > 0)::int AS bank,
                    books_locked_through($1)::text AS closed`,
            [c.id]
          );
          let ret = null;
          if (c.gst_registered) {
            const r = await require("../ledger/gstReturn").build(client, { companyId: c.id });
            const owe = r.out.tax - r.inp.tax;
            ret = { label: `${tax.tax} ${r.period.label}`, due: r.period.due, daysLeft: r.period.daysLeft, filed: Boolean(r.filed), owe: formatLaari(owe > 0n ? owe : 0n), problems: r.problems.length };
          }
          return {
            needs: items.length,
            atRisk: items.filter((i) => i.kind === "money_at_risk").length,
            top: items.slice(0, 3).map((i) => ({ title: i.title, kind: i.kind, href: i.href })),
            bankToExplain: n[0].bank,
            closedThrough: n[0].closed,
            setup: { done: setup.done, total: setup.total },
            taxReturn: ret,
          };
        });
        out.push({ ...base, reads: true, ...require("../ledger/words").speak(summary, as.company) });
      } catch (err) {
        out.push({ ...base, reads: true, error: err.message });
      }
    }
    res.json({ companies: out });
  })
);

module.exports = router;

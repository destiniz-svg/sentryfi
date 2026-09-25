/** A bundle sells its parts: each leaves stock at its own cost, and stock still equals its value. */
import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import { raise, post } from "../src/ledger/sales";
import * as stock from "../src/ledger/stock";

afterAll(closePool);

describe("bundles", () => {
  it("takes each part out at its cost when the bundle is sold", () =>
    inRollback(async (client) => {
      const { companyId, userId } = await aCompanyWith(client);
      await client.query("INSERT INTO accounts (company_id, code, name, type) VALUES ($1,'1300','Owed to us','asset'), ($1,'4100','Sales','income'), ($1,'2200','GST we owe','liability')", [companyId]);
      await assumeIdentity(client, { companyId, userId });
      const item = async (name, kind = "product", counted = true) => (await client.query("INSERT INTO stock_items (company_id, name, unit, kind, counted, buys, created_by) VALUES ($1,$2,'pcs',$3,$4,$5,$6) RETURNING id", [companyId, name, kind, counted, kind !== "bundle", userId])).rows[0].id;
      const basin = await item("Basin");
      const tap = await item("Tap");
      const set = await item("Bathroom set", "bundle", false);
      await stock.opening(client, { companyId, userId, itemId: basin, quantity: "5", unitCost: "100", on: "2026-09-01" });
      await stock.opening(client, { companyId, userId, itemId: tap, quantity: "10", unitCost: "20", on: "2026-09-01" });
      await client.query("INSERT INTO bundle_parts (company_id, bundle_id, item_id, quantity) VALUES ($1,$2,$3,1), ($1,$2,$4,2)", [companyId, set, basin, tap]);
      const cp = (await client.query("INSERT INTO counterparties (company_id, name, kind) VALUES ($1,'Villa','{customer}') RETURNING id", [companyId])).rows[0].id;
      const { invoice } = await raise(client, { companyId, userId, counterpartyId: cp, gstTreatment: "none_unregistered", issueDate: "2026-09-20", lines: [{ itemId: set, quantity: 1, unitPrice: "300" }] });
      await post(client, { companyId, userId, invoiceId: invoice.id });
      const b = await stock.holding(client, { companyId, itemId: basin });
      const t = await stock.holding(client, { companyId, itemId: tap });
      expect([stock.unitsText(b.units), b.value, stock.unitsText(t.units), t.value]).toEqual(["4", 40000n, "8", 16000n]);
      const { rows } = await client.query("SELECT COALESCE(SUM(l.debit_laari - l.credit_laari), 0)::text AS v FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE a.company_id = $1 AND a.code = '1350'", [companyId]);
      expect(rows[0].v).toBe("56000");
      const { rows: moves } = await client.query("SELECT sum(sale_net_laari)::text AS s FROM stock_moves WHERE company_id = $1 AND kind = 'sold'", [companyId]);
      expect(moves[0].s).toBe("30000");
    }));
});

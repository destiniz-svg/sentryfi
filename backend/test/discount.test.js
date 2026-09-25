/** A discount comes off each line before GST, so the tax is on what is charged. */
import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import { raise } from "../src/ledger/sales";

afterAll(closePool);

describe("discounts", () => {
  it("takes 10% off before GST at 8%", () =>
    inRollback(async (client) => {
      const { companyId, userId } = await aCompanyWith(client);
      await client.query("INSERT INTO accounts (company_id, code, name, type) VALUES ($1,'1300','Owed to us','asset'), ($1,'4100','Sales','income'), ($1,'2200','GST we owe','liability')", [companyId]);
      await assumeIdentity(client, { companyId, userId });
      const cp = (await client.query("INSERT INTO counterparties (company_id, name, kind) VALUES ($1,'Resort','{customer}') RETURNING id", [companyId])).rows[0].id;
      const { invoice } = await raise(client, { companyId, userId, counterpartyId: cp, gstTreatment: "exclusive", gstRateBp: 800, issueDate: "2026-09-20", lines: [{ description: "Hire", quantity: 2, unitPrice: "500.00", discountPercent: 10 }] });
      expect([invoice.net_laari, invoice.tax_laari, invoice.gross_laari].map(String)).toEqual(["90000", "7200", "97200"]);
      const { rows } = await client.query("SELECT discount_bp FROM sales_invoice_lines WHERE invoice_id = $1", [invoice.id]);
      expect(rows[0].discount_bp).toBe(1000);
      await expect(raise(client, { companyId, userId, counterpartyId: cp, gstTreatment: "exclusive", issueDate: "2026-09-20", lines: [{ description: "x", quantity: 1, unitPrice: "1", discountPercent: 120 }] })).rejects.toThrow(/between 0 and 100/);
    }));
});

/**
 * A second country is data. A company on the UAE pack is taxed at 5% by the
 * pack, keeps its books through the same ledger code as a Maldivian one, and
 * its return comes out as the VAT 201's boxes, agreeing with the books.
 */
import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import { raise, post } from "../src/ledger/sales";
import { rateOn } from "../src/ledger/tax";
import { build, figures } from "../src/ledger/gstReturn";

afterAll(closePool);

describe("a second country", () => {
  it("keeps a UAE company's books at 5% VAT and gives its return as VAT 201 boxes", () =>
    inRollback(async (client) => {
      const co = await aCompanyWith(client, { name: "Dubai Test LLC" });
      await client.query("UPDATE companies SET tax_pack = 'AE', base_currency = 'AED', gst_number = '100123456700003' WHERE id = $1", [co.companyId]);
      await client.query(
        "INSERT INTO accounts (company_id, code, name, type) VALUES ($1,'1300','Money owed to us','asset'), ($1,'2200','VAT we owe','liability'), ($1,'4100','Work invoiced','income')",
        [co.companyId]
      );
      await assumeIdentity(client, { companyId: co.companyId, userId: co.userId });

      const rate = await rateOn(client, { companyId: co.companyId, on: "2026-08-10" });
      expect(rate).toMatchObject({ bp: 500, label: "Standard VAT" });

      const { rows } = await client.query("INSERT INTO counterparties (company_id, name, kind) VALUES ($1,'A client','{customer}') RETURNING id", [co.companyId]);
      const { invoice } = await raise(client, {
        companyId: co.companyId, userId: co.userId, counterpartyId: rows[0].id, issueDate: "2026-08-10", dueDate: "2026-09-10",
        gstTreatment: "exclusive", lines: [{ description: "Consulting", quantity: 1, unitPrice: "1000" }],
      });
      await post(client, { companyId: co.companyId, userId: co.userId, invoiceId: invoice.id });

      const r = await build(client, { companyId: co.companyId, key: "2026-Q3" });
      expect(r.pack.code).toBe("AE");
      expect(r.out.tax).toBe(5000n); // AED 50.00, in fils
      expect(r.problems.filter((p) => /does not match/.test(p.what))).toEqual([]);
      const boxes = Object.fromEntries(figures(r).map((f) => [f.label, f.amount]));
      expect(boxes["Box 1: Standard-rated supplies, amount"]).toBe("1,000.00");
      expect(boxes["Box 1: Standard-rated supplies, VAT"]).toBe("50.00");
      expect(boxes["Box 14: Payable tax for the period"]).toBe("50.00");
      expect(JSON.stringify(r.problems)).not.toMatch(/MIRA|MVR/);
    }));
});

/**
 * Money asked for before the tax invoice. A proforma asks for 10,800 (10,000
 * and 8% GST); half is paid, carrying its GST that day (time of supply is
 * payment); the proforma becomes its tax invoice, which charges GST on all of
 * it and uses the advance, taking that GST back off, so GST is charged once
 * and the invoice has half left to pay. A retainer's leftover is refunded with
 * its GST. The GST return agrees with the books throughout.
 */
import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import * as advances from "../src/ledger/advances";
import * as sales from "../src/ledger/sales";
import * as gstReturn from "../src/ledger/gstReturn";

afterAll(closePool);

const balance = async (client, companyId, code) =>
  BigInt((await client.query(
    "SELECT COALESCE(SUM(l.debit_laari - l.credit_laari), 0) AS b FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE a.company_id = $1 AND a.code = $2",
    [companyId, code]
  )).rows[0].b);

async function aSeller(client) {
  const co = await aCompanyWith(client);
  await client.query(
    "INSERT INTO accounts (company_id, code, name, type) VALUES ($1,'1300','Money owed to us','asset'), ($1,'2200','GST we owe','liability'), ($1,'4100','Work invoiced','income')",
    [co.companyId]
  );
  await client.query("UPDATE companies SET gst_number = '1000001GST501' WHERE id = $1", [co.companyId]);
  await assumeIdentity(client, { companyId: co.companyId, userId: co.userId });
  return co;
}

describe("proforma and retainer invoices", () => {
  it("takes GST on the advance when paid, and once only when the tax invoice uses it", () =>
    inRollback(async (client) => {
      const co = await aSeller(client);
      const { companyId, userId } = co;
      const pf = await advances.create(client, {
        companyId, userId, kind: "proforma", customerName: "Lagoon Resort", issueDate: "2026-09-02", gstTreatment: "exclusive",
        lines: [{ description: "Jetty repair, first stage", quantity: 1, unitPrice: "10000" }],
      });
      expect(pf.number).toBe("PF-0001");
      expect(BigInt(pf.gross_laari)).toBe(1080000n);
      // Nothing in the books yet.
      expect(await balance(client, companyId, "2200")).toBe(0n);

      const paid = await advances.receive(client, { companyId, userId, requestId: pf.id, amount: "5400", receivedOn: "2026-09-05", accountId: co.accounts.bank });
      expect(paid.tax).toBe("400.00");
      expect(await balance(client, companyId, "2350")).toBe(-500000n);
      expect(await balance(client, companyId, "2200")).toBe(-40000n);

      const inv = await advances.invoiceProforma(client, { companyId, userId, id: pf.id, issueDate: "2026-09-20" });
      expect(inv.invoiceNo).toBeTruthy();
      // The invoice charges 800; the advance's 400 comes back off: 800 in all.
      expect(await balance(client, companyId, "2200")).toBe(-80000n);
      expect(await balance(client, companyId, "2350")).toBe(0n);
      expect(await sales.outstanding(client, { companyId, invoiceId: inv.invoiceId })).toBe(540000n);
      await expect(advances.invoiceProforma(client, { companyId, userId, id: pf.id })).rejects.toThrow(/Its tax invoice is/);

      const r = await gstReturn.build(client, { companyId, key: "2026-09" });
      expect(r.out.tax).toBe(80000n);
      expect(r.problems.map((p) => p.what)).not.toContain("Output tax in the books does not match the invoices");
    }));

  it("refunds what is left of a retainer with its GST", () =>
    inRollback(async (client) => {
      const co = await aSeller(client);
      const { companyId, userId } = co;
      const rt = await advances.create(client, { companyId, userId, kind: "retainer", customerName: "Harbour Trading", issueDate: "2026-09-01", lines: [{ description: "Retainer, September", unitPrice: "2000" }] });
      expect(rt.number).toBe("RT-0001");
      const got = await advances.receive(client, { companyId, userId, requestId: rt.id, amount: "2160", receivedOn: "2026-09-03", accountId: co.accounts.bank });
      expect(got.tax).toBe("160.00");
      const [a] = await advances.held(client, { companyId });
      await advances.refund(client, { companyId, userId, advanceId: a.id, amount: "1080", on: "2026-09-10", fromAccountId: co.accounts.bank });
      expect(await balance(client, companyId, "2200")).toBe(-8000n);
      expect(await balance(client, companyId, "2350")).toBe(-100000n);
      await expect(advances.refund(client, { companyId, userId, advanceId: a.id, amount: "5000", fromAccountId: co.accounts.bank })).rejects.toThrow(/Up to 1,080.00/);
      await expect(advances.cancel(client, { companyId, id: rt.id })).rejects.toThrow(/Money has come in/);
    }));
});

/**
 * Non-resident withholding tax. The properties: a supplier marked as
 * non-resident is paid the bill less the tax kept back, the bill is settled in
 * full, the tax is owed on 2250, the month lists the payment for the return,
 * and a payment taken back drops out of the month.
 */
import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import { postBill } from "../src/ledger/bills";
import { pay, unpaid } from "../src/ledger/payments";
import * as nwt from "../src/ledger/nwt";

afterAll(closePool);

async function aDesignBill(client) {
  const co = await aCompanyWith(client);
  const { companyId, userId, accounts } = co;
  await assumeIdentity(client, { companyId, userId });
  co.supplier = (await client.query("INSERT INTO counterparties (company_id, name, kind) VALUES ($1,'Overseas design studio','{supplier}') RETURNING id", [companyId])).rows[0].id;
  const { rows } = await client.query(
    `INSERT INTO bills (company_id, counterparty_id, bill_no, issue_date, net_laari, tax_laari, gross_laari, gst_treatment, status)
     VALUES ($1,$2,'DS-7','2026-08-03',5000000,0,5000000,'none_unregistered','draft') RETURNING id`,
    [companyId, co.supplier]
  );
  co.billId = rows[0].id;
  await postBill(client, { companyId, userId, billId: co.billId, accounts: { expense: accounts.expense, payable: accounts.payable, taxReclaimable: accounts.taxReclaimable } });
  co.balance = async (code) =>
    BigInt((await client.query("SELECT COALESCE(SUM(l.debit_laari - l.credit_laari), 0) AS b FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE a.company_id = $1 AND a.code = $2", [companyId, code])).rows[0].b);
  return co;
}

describe("withholding tax on a payment abroad", () => {
  it("pays the supplier less the tax, settles the bill in full, and lists it for the month's return", () =>
    inRollback(async (client) => {
      const co = await aDesignBill(client);
      const { companyId, userId, accounts } = co;
      await nwt.setSupplier(client, { companyId, counterpartyId: co.supplier, category: "services" });
      const bankBefore = await co.balance("1100");

      const r = await pay(client, { companyId, userId, fromAccountId: accounts.bank, paidOn: "2026-08-20", reference: "Run 1", items: [{ billId: co.billId, amount: "50000" }] });
      expect(r.withheld).toBe(500000n); // 10% of 50,000.00
      expect(r.transfers[0]).toMatchObject({ amount: "45,000.00", withheld: "5,000.00" });
      expect(bankBefore - (await co.balance("1100"))).toBe(4500000n);
      expect(await co.balance("2250")).toBe(-500000n); // owed to the tax authority
      expect((await unpaid(client, { companyId })).find((u) => u.id === co.billId)).toBeUndefined(); // settled in full

      const m = await nwt.month(client, { companyId, key: "2026-08" });
      expect(m).toMatchObject({ total: "5,000.00", due: "2026-09-15", form: "MIRA 602" });
      expect(m.payments[0]).toMatchObject({ payee: "Overseas design studio", gross: "50,000.00", withheld: "5,000.00", ratePct: 10 });

      // Taken back: the tax was never paid over, so it leaves the month too.
      await client.query("UPDATE payment_runs SET reversed_at = now() WHERE id = $1", [r.runId]);
      expect((await nwt.month(client, { companyId, key: "2026-08" })).total).toBe("0.00");
    }));

  it("keeps back nothing from a supplier not marked, and refuses a category it does not know", () =>
    inRollback(async (client) => {
      const co = await aDesignBill(client);
      const r = await pay(client, { companyId: co.companyId, userId: co.userId, fromAccountId: co.accounts.bank, paidOn: "2026-08-20", items: [{ billId: co.billId, amount: "50000" }] });
      expect(r.withheld).toBe(0n);
      await expect(nwt.setSupplier(client, { companyId: co.companyId, counterpartyId: co.supplier, category: "lottery" })).rejects.toThrow(/Which kind/);
    }));
});

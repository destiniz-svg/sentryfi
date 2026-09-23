/**
 * Expense claims and payment runs. The properties: nobody approves their own
 * claim, nor one above their limit; approval puts each line on its kind of
 * cost and the whole on what is owed to staff; a payment run pays bills and
 * claims in one entry, never more than is owed on each, and each then knows
 * what has been paid; a paid claim and a paid bill leave the unpaid list.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import { postBill } from "../src/ledger/bills";
import * as claims from "../src/ledger/claims";
import * as payments from "../src/ledger/payments";

afterAll(closePool);

async function aTeam(client) {
  const co = await aCompanyWith(client);
  const { companyId } = co;
  co.other = (await client.query("INSERT INTO users (name, email, password_hash) VALUES ('Aisha', $1, 'x') RETURNING id", [`aisha+${Math.random()}@sentryfi.invalid`])).rows[0].id;
  await client.query("INSERT INTO accounts (company_id, code, name, type) VALUES ($1,'5500','Transport and boat freight','expense')", [companyId]);
  await assumeIdentity(client, { companyId, userId: co.userId });
  const { rows } = await client.query("SELECT code, id FROM accounts WHERE company_id = $1", [companyId]);
  co.code = Object.fromEntries(rows.map((a) => [a.code, a.id]));
  co.balance = async (code) =>
    BigInt((await client.query("SELECT COALESCE(SUM(l.debit_laari - l.credit_laari), 0) AS b FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE a.company_id = $1 AND a.code = $2", [companyId, code])).rows[0].b);
  return co;
}

describe("an expense claim", () => {
  it("is approved by someone else, within their limit, onto its costs and owed to the claimant", () =>
    inRollback(async (client) => {
      const co = await aTeam(client);
      const { companyId, userId, other } = co;
      await assumeIdentity(client, { companyId, userId: other });
      const c = await claims.create(client, {
        companyId, userId: other,
        lines: [
          { spentOn: "2026-09-10", description: "Ferry to site", accountId: co.code["5500"], amount: "450" },
          { spentOn: "2026-09-11", description: "Nails", accountId: co.code["5100"], amount: "120.50" },
        ],
      });
      expect(c.number).toBe("EC-0001");
      await expect(claims.approve(client, { companyId, userId: other, claimId: c.id, approveUpTo: null })).rejects.toThrow(/Nobody approves their own/);
      await expect(claims.approve(client, { companyId, userId, claimId: c.id, approveUpTo: 50000n })).rejects.toThrow(/over your limit/);
      const r = await claims.approve(client, { companyId, userId, claimId: c.id, approveUpTo: null, on: "2026-09-12" });
      expect(r.total).toBe(57050n);
      expect(await co.balance("2400")).toBe(-57050n);
      expect(await co.balance("5500")).toBe(45000n);
      expect(claims.show(await claims.load(client, { companyId, claimId: c.id })).status).toBe("approved");
    }));
});

describe("a payment run", () => {
  it("pays bills and claims in one entry, never more than is owed", () =>
    inRollback(async (client) => {
      const co = await aTeam(client);
      const { companyId, userId, other } = co;
      const supplier = (await client.query("INSERT INTO counterparties (company_id, name, kind, bank_accounts) VALUES ($1,'A supplier','{supplier}','{7730000123456}') RETURNING id", [companyId])).rows[0].id;
      const bill = (
        await client.query(
          `INSERT INTO bills (company_id, counterparty_id, bill_no, issue_date, net_laari, tax_laari, gross_laari, gst_treatment, status)
           VALUES ($1,$2,'S-1','2026-09-01',100000,0,100000,'none_unregistered','draft') RETURNING id`,
          [companyId, supplier]
        )
      ).rows[0].id;
      await postBill(client, { companyId, userId, billId: bill, accounts: { expense: co.accounts.expense, payable: co.accounts.payable, taxReclaimable: co.accounts.taxReclaimable } });
      await assumeIdentity(client, { companyId, userId: other });
      const c = await claims.create(client, { companyId, userId: other, lines: [{ spentOn: "2026-09-10", description: "Ferry", accountId: co.code["5500"], amount: "450" }] });
      await claims.approve(client, { companyId, userId, claimId: c.id, approveUpTo: null });

      let owed = await payments.unpaid(client, { companyId });
      expect(owed.map((o) => [o.kind, o.payee, o.owed, o.bankAccount])).toEqual([["bill", "A supplier", "1,000.00", "7730000123456"], ["claim", "Aisha", "450.00", null]]);

      await expect(payments.pay(client, { companyId, userId, fromAccountId: co.accounts.bank, paidOn: "2026-09-20", items: [{ billId: bill, amount: "1000.01" }] })).rejects.toThrow(/Only MVR 1,000.00 is still owed/);
      const run = await payments.pay(client, {
        companyId, userId, fromAccountId: co.accounts.bank, paidOn: "2026-09-20", reference: "Sept",
        items: [{ billId: bill, amount: "600" }, { claimId: c.id, amount: "450" }],
      });
      expect(run.total).toBe(105000n);
      expect(run.transfers).toEqual([
        { payee: "A supplier", bankAccount: "7730000123456", amount: "600.00", reference: "S-1" },
        { payee: "Aisha", bankAccount: null, amount: "450.00", reference: "EC-0001" },
      ]);
      expect(await co.balance("2400")).toBe(0n);
      expect(await co.balance("2100")).toBe(-40000n);
      owed = await payments.unpaid(client, { companyId });
      expect(owed.map((o) => [o.kind, o.owed])).toEqual([["bill", "400.00"]]);
      expect(claims.show(await claims.load(client, { companyId, claimId: c.id })).status).toBe("paid");
      expect((await payments.runs(client, { companyId }))[0]).toMatchObject({ total: "1,050.00", items: 2, reference: "Sept" });
    }));
});

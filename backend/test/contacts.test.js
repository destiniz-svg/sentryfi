/**
 * Customers and suppliers. The properties: what a party owes, or is owed, is
 * the ledger's figure for them, not a second sum; a record that looks like one
 * already on file is refused until the person says it is new; and a changed
 * bank account waits for a person before a payment can use it.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { postEntry } from "../src/ledger/post";
import * as contacts from "../src/ledger/contacts";

process.env.DATABASE_URL ||= process.env.TEST_DATABASE_URL || "postgres://unused:unused@127.0.0.1:5432/unused";
process.env.JWT_SECRET ||= "contacts-test-secret-long-enough-to-pass-validation";

afterAll(closePool);

describe("contacts", () => {
  it("reads balances from the ledger, and refuses a lookalike until told it is new", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await aCompanyWith(client);
      const { rows: ar } = await client.query("INSERT INTO accounts (company_id, code, name, type) VALUES ($1,'1300','Owed to us','asset'), ($1,'4000','Sales','income') RETURNING id, code", [companyId]);
      const owedToUs = ar.find((a) => a.code === "1300").id;
      const salesAcct = ar.find((a) => a.code === "4000").id;

      const resort = await contacts.create(client, { companyId, body: { name: "Lagoon View Resort", customer: true, phone: "+960 777 1234", tin: "1012345GST501" } });
      await expect(contacts.create(client, { companyId, body: { name: "Lagoon View Resort Pvt Ltd", customer: true } })).rejects.toMatchObject({ statusCode: 409 });
      await expect(contacts.create(client, { companyId, body: { name: "LVR", customer: true, phone: "7771234" } })).rejects.toMatchObject({ statusCode: 409, details: { lookalikes: [{ why: "the same phone" }] } });
      const cement = await contacts.create(client, { companyId, body: { name: "Island Cement", supplier: true } });

      await postEntry(client, { companyId, userId, date: "2026-09-01", source: "adjustment", narrative: "Invoice to the resort", lines: [{ accountId: owedToUs, debit: "11800.00", counterpartyId: resort }, { accountId: salesAcct, credit: "11800.00" }] });
      await postEntry(client, { companyId, userId, date: "2026-09-10", source: "adjustment", narrative: "Part paid", lines: [{ accountId: accounts.bank, debit: "1800.00" }, { accountId: owedToUs, credit: "1800.00", counterpartyId: resort }] });
      await postEntry(client, { companyId, userId, date: "2026-09-12", source: "adjustment", narrative: "Cement bill", lines: [{ accountId: accounts.expense, debit: "4250.50" }, { accountId: accounts.payable, credit: "4250.50", counterpartyId: cement }] });

      const { contacts: all, totals } = await contacts.list(client, { companyId });
      const r = all.find((c) => c.id === resort);
      expect(r.receivable).toBe("10,000.00");
      expect(r.customer).toBe(true);
      expect(all.find((c) => c.id === cement).payable).toBe("4,250.50");
      expect(totals.receivable).toBe("10,000.00");
      expect(totals.payable).toBe("4,250.50");

      const shown = await contacts.show(client, { companyId, id: resort });
      expect(shown.money.receivable).toBe("10,000.00");
      expect(shown.details.tin).toBe("1012345GST501");

      await contacts.update(client, { companyId, id: resort, body: { paymentTermsDays: 30, tags: ["Resort"], creditLimit: "5000" } });
      await contacts.savePerson(client, { companyId, id: resort, person: { name: "Shifa", role: "Accounts", phone: "+960 790 0000", forAccounts: true } });
      const again = await contacts.show(client, { companyId, id: resort });
      expect(again.details.tags).toEqual(["Resort"]);
      expect(again.money.overLimit).toBe(true);
      expect(again.people.map((p) => [p.name, p.forAccounts])).toEqual([["Shifa", true]]);
    }));

  it("holds a new bank account until a person takes it", () =>
    inRollback(async (client) => {
      const { companyId, userId } = await aCompanyWith(client);
      await client.query("INSERT INTO memberships (company_id, user_id, role) VALUES ($1, $2, 'administrator')", [companyId, userId]);
      const id = await contacts.create(client, { companyId, body: { name: "Island Cement", supplier: true } });
      const { observe } = await import("../src/ledger/counterparties");
      await observe(client, { companyId, userId, partyId: id, facts: { bank_account: "7730000011111" }, source: { kind: "bill" } });
      await observe(client, { companyId, userId, partyId: id, facts: { bank_account: "7730000099999" }, source: { kind: "bill" } });
      const before = await contacts.show(client, { companyId, id });
      expect(before.details.bankAccounts).toEqual(["····1111"]);
      expect(before.doubts.map((d) => [d.field, d.value])).toEqual([["bank_account", "····9999"]]);
      await contacts.settleDoubt(client, { companyId, userId, id, doubtId: before.doubts[0].id, take: true });
      const after = await contacts.show(client, { companyId, id });
      expect(after.details.bankAccounts).toEqual(["····9999", "····1111"]);
      expect(after.doubts).toHaveLength(0);
    }));
});

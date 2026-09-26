/**
 * Costs passed on, and repeating bills. The properties: a bill's cost or a
 * claim's line marked for a customer waits, with its markup, only once the
 * bill is posted or the claim approved; an invoice takes it, and voiding that
 * invoice lets it wait again; it can never be taken for another customer or
 * twice. A repeating bill is drafted on its date, split onto its kind of
 * cost, and never posted by itself.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import { postBill } from "../src/ledger/bills";
import * as billSplit from "../src/ledger/billSplit";
import * as claims from "../src/ledger/claims";
import * as sales from "../src/ledger/sales";
import * as passOn from "../src/ledger/passOn";
import * as recurring from "../src/ledger/recurring";

afterAll(closePool);

describe("a cost passed on", () => {
  it("waits for its customer's next invoice, with its markup, until an invoice takes it", () =>
    inRollback(async (client) => {
      const co = await aCompanyWith(client);
      const { companyId, userId, accounts } = co;
      const other = (await client.query("INSERT INTO users (name, email, password_hash) VALUES ('Aisha', $1, 'x') RETURNING id", [`aisha+${Math.random()}@sentryfi.invalid`])).rows[0].id;
      await assumeIdentity(client, { companyId, userId });
      const party = async (name, kind) => (await client.query("INSERT INTO counterparties (company_id, name, kind) VALUES ($1,$2,$3) RETURNING id", [companyId, name, `{${kind}}`])).rows[0].id;
      const supplier = await party("A hardware shop", "supplier");
      const client1 = await party("A client", "customer");
      const client2 = await party("Another client", "customer");

      const bill = (await client.query(
        `INSERT INTO bills (company_id, counterparty_id, bill_no, issue_date, net_laari, tax_laari, gross_laari, gst_treatment, status)
         VALUES ($1,$2,'H-7','2026-09-01',150000,0,150000,'none_unregistered','draft') RETURNING *`, [companyId, supplier])).rows[0];
      await billSplit.save(client, {
        companyId, userId, billId: bill.id,
        lines: [
          { kind: "cost", description: "Tiles for the client", accountId: accounts.expense, amount: "1000", forCustomerId: client1, markup: "10" },
          { kind: "cost", description: "Our own glue", accountId: accounts.expense, amount: "500" },
        ],
      });
      // Not a cost until the bill is in the books.
      expect(await passOn.waiting(client, { companyId, counterpartyId: client1 })).toEqual([]);
      await postBill(client, { companyId, userId, billId: bill.id, accounts: { expense: accounts.expense, payable: accounts.payable, taxReclaimable: accounts.taxReclaimable } });

      await assumeIdentity(client, { companyId, userId: other });
      const c = await claims.create(client, { companyId, userId: other, lines: [{ spentOn: "2026-09-03", description: "Ferry with the tiles", accountId: accounts.expense, amount: "200", forCustomerId: client1 }] });
      await assumeIdentity(client, { companyId, userId });
      expect((await passOn.waiting(client, { companyId, counterpartyId: client1 })).length).toBe(1);
      await claims.approve(client, { companyId, userId, claimId: c.id, approveUpTo: null, on: "2026-09-04" });

      const costs = await passOn.waiting(client, { companyId, counterpartyId: client1 });
      expect(costs.map((x) => [x.description, x.source, x.cost, x.markupPercent, x.price])).toEqual([
        ["Tiles for the client", "A hardware shop H-7", "1,000.00", 10, "1,100.00"],
        ["Ferry with the tiles", "EC-0001", "200.00", 0, "200.00"],
      ]);
      expect(await passOn.waiting(client, { companyId, counterpartyId: client2 })).toEqual([]);

      const invoice = async (counterpartyId) =>
        (await sales.raise(client, { companyId, userId, counterpartyId, gstTreatment: "none_unregistered", lines: [{ description: "Tiles", quantity: 1, unitPrice: "1100" }] })).invoice;
      await expect(passOn.take(client, { companyId, invoiceId: (await invoice(client2)).id, counterpartyId: client2, ids: [costs[0].id] })).rejects.toThrow(/not waiting for this customer/);

      const first = await invoice(client1);
      await passOn.take(client, { companyId, invoiceId: first.id, counterpartyId: client1, ids: [costs[0].id] });
      expect((await passOn.waiting(client, { companyId, counterpartyId: client1 })).map((x) => x.description)).toEqual(["Ferry with the tiles"]);
      await expect(passOn.take(client, { companyId, invoiceId: (await invoice(client1)).id, counterpartyId: client1, ids: [costs[0].id] })).rejects.toThrow(/on another invoice/);

      // Voided, the invoice lets the cost wait again.
      await client.query("UPDATE sales_invoices SET voided_at = now(), void_reason = 'test' WHERE id = $1", [first.id]);
      expect((await passOn.waiting(client, { companyId, counterpartyId: client1 })).length).toBe(2);
    }));
});

describe("a repeating bill", () => {
  it("is drafted on its date, onto its kind of cost, and never posted by itself", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await aCompanyWith(client);
      await assumeIdentity(client, { companyId, userId });
      const landlord = (await client.query("INSERT INTO counterparties (company_id, name, kind) VALUES ($1,'A landlord','{supplier}') RETURNING id", [companyId])).rows[0].id;
      await expect(
        recurring.create(client, { companyId, userId, kind: "bill", counterpartyId: landlord, every: "month", startsOn: "2026-07-31", lines: [{ description: "Rent", unitPrice: "8000" }] })
      ).rejects.toThrow(/Which kind of cost/);
      const id = await recurring.create(client, {
        companyId, userId, kind: "bill", counterpartyId: landlord, name: "Office rent", every: "month", startsOn: "2026-07-31",
        gstTreatment: "none_unregistered", postAutomatically: true, lines: [{ description: "Rent, office 2", unitPrice: "8000", accountId: accounts.expense }],
      });
      const raised = await recurring.runDue(client, { companyId, userId, today: "2026-09-15" });
      expect(raised.map((r) => [r.kind, r.on])).toEqual([["bill", "2026-07-31"], ["bill", "2026-08-31"]]);
      const { rows } = await client.query(
        `SELECT b.status, b.gross_laari, b.issue_date::text AS on, c.description, c.account_id FROM bills b JOIN bill_charges c ON c.bill_id = b.id
          WHERE b.recurring_id = $1 ORDER BY b.issue_date`, [id]);
      expect(rows.map((r) => [r.status, String(r.gross_laari), r.on, r.description, r.account_id])).toEqual([
        ["draft", "800000", "2026-07-31", "Rent, office 2, from 31 Jul 2026", accounts.expense],
        ["draft", "800000", "2026-08-31", "Rent, office 2, from 31 Aug 2026", accounts.expense],
      ]);
      expect(await recurring.list(client, { companyId })).toEqual([]);
      expect((await recurring.list(client, { companyId, kind: "bill" }))[0]).toMatchObject({ raised: 2, each: "8,000.00", customer: "A landlord", postAutomatically: false });
    }));
});

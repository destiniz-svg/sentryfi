/**
 * Orders. The properties: a purchase order over what its orderer may approve
 * waits, and nothing can be received against it until someone with a high
 * enough limit approves; a delivery moves quantities, not money; only what
 * arrived can be billed, and the bill is split into stock and costs line by
 * line, so the order, the delivery and the bill are one cost, not three; a
 * supplier's different price is shown, not hidden; an open order on a project
 * is committed until billed; and a sales order goes out and is invoiced from
 * what went out, its stock leaving at average cost.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import { postBill } from "../src/ledger/bills";
import { post as postInvoice } from "../src/ledger/sales";
import * as orders from "../src/ledger/orders";
import * as stock from "../src/ledger/stock";
import * as projects from "../src/ledger/projects";

afterAll(closePool);

async function aBuyer(client) {
  const co = await aCompanyWith(client);
  const { companyId, userId } = co;
  await client.query(
    `INSERT INTO accounts (company_id, code, name, type) VALUES
       ($1,'1300','Money owed to us','asset'), ($1,'2200','GST we owe','liability'), ($1,'4100','Sales','income'),
       ($1,'5500','Transport and boat freight','expense')`,
    [companyId]
  );
  await assumeIdentity(client, { companyId, userId });
  const { rows: acc } = await client.query("SELECT code, id FROM accounts WHERE company_id = $1", [companyId]);
  co.code = Object.fromEntries(acc.map((a) => [a.code, a.id]));
  co.cement = (await client.query("INSERT INTO stock_items (company_id, name, unit, created_by) VALUES ($1,'Cement','bag',$2) RETURNING id", [companyId, userId])).rows[0].id;
  co.projectId = (await client.query("INSERT INTO projects (company_id, name) VALUES ($1,'A site') RETURNING id", [companyId])).rows[0].id;
  co.entries = async () => Number((await client.query("SELECT count(*) AS n FROM journal_entries WHERE company_id = $1", [companyId])).rows[0].n);
  co.post = (billId) => postBill(client, { companyId, userId, billId, accounts: { expense: co.accounts.expense, payable: co.accounts.payable, taxReclaimable: co.accounts.taxReclaimable } });
  co.order = (approveUpTo) =>
    orders.create(client, {
      companyId, userId, kind: "purchase", partyName: "A cement supplier", projectId: co.projectId, approveUpTo,
      lines: [
        { itemId: co.cement, quantity: "100", unitPrice: "120" },
        { description: "Delivery to site", accountId: co.code["5500"], quantity: "1", unit: "trip", unitPrice: "2000" },
      ],
    });
  return co;
}

describe("a purchase order", () => {
  it("waits for approval above the orderer's reach, and is approved only within the approver's", () =>
    inRollback(async (client) => {
      const co = await aBuyer(client);
      const { companyId, userId } = co;
      const o = await co.order(-1n);
      expect(o).toMatchObject({ number: "PO-0001", total: 1400000n, approved: false });
      expect((await orders.load(client, { companyId, orderId: o.id })).status).toBe("awaiting_approval");
      const line = (await orders.load(client, { companyId, orderId: o.id })).lines[0];
      await expect(orders.deliver(client, { companyId, userId, orderId: o.id, lines: [{ orderLineId: line.id, quantity: "1" }] })).rejects.toThrow(/not been approved/);
      await expect(orders.approve(client, { companyId, userId, orderId: o.id, approveUpTo: 1000000n })).rejects.toThrow(/over your limit/);
      await orders.approve(client, { companyId, userId, orderId: o.id, approveUpTo: null });
      expect((await orders.load(client, { companyId, orderId: o.id })).status).toBe("open");
      expect((await co.order(2000000n)).approved).toBe(true);
    }));

  it("is received in parts and billed from what arrived: one cost, not three", () =>
    inRollback(async (client) => {
      const co = await aBuyer(client);
      const { companyId, userId } = co;
      const o = await co.order(null);
      let s = await orders.load(client, { companyId, orderId: o.id });
      const [cement, trip] = s.lines;

      // Committed on the project: the whole order, before anything is billed.
      expect((await projects.summary(client, { companyId, projectId: co.projectId })).committed).toBe("14,000.00");

      const before = await co.entries();
      await orders.deliver(client, { companyId, userId, orderId: o.id, reference: "DN-1", lines: [{ orderLineId: cement.id, quantity: "60" }, { orderLineId: trip.id, quantity: "1" }] });
      expect(await co.entries()).toBe(before); // a delivery moves quantities, not money
      expect((await orders.load(client, { companyId, orderId: o.id })).status).toBe("part_delivered");

      await expect(orders.billFromOrder(client, { companyId, userId, orderId: o.id, lines: [{ orderLineId: cement.id, quantity: "61" }] })).rejects.toThrow(/Only 60 of Cement has arrived/);
      const first = await orders.billFromOrder(client, { companyId, userId, orderId: o.id, billNo: "INV-1", issueDate: "2026-09-10", gstTreatment: "exclusive", gstRateBp: 800 });
      // 60 bags at 120 and the trip at 2,000: 9,200 + 8% GST.
      expect([first.bill.net_laari, first.bill.tax_laari, first.bill.gross_laari].map(String)).toEqual(["920000", "73600", "993600"]);
      expect(first.differences).toEqual([]);
      await co.post(first.bill.id);
      expect(await co.entries()).toBe(before + 1);
      const held = (await stock.list(client, { companyId })).find((i) => i.id === co.cement);
      expect([held.onHand, held.value]).toEqual(["60", "7,200.00"]);
      expect((await projects.summary(client, { companyId, projectId: co.projectId })).committed).toBe("4,800.00");

      // Nothing more has arrived, so there is nothing more to bill.
      await expect(orders.billFromOrder(client, { companyId, userId, orderId: o.id })).rejects.toThrow(/Nothing has arrived/);
      await expect(orders.finish(client, { companyId, userId, orderId: o.id, how: "cancel" })).rejects.toThrow(/Close it instead/);

      await orders.deliver(client, { companyId, userId, orderId: o.id, lines: [{ orderLineId: cement.id, quantity: "40" }] });
      await expect(orders.deliver(client, { companyId, userId, orderId: o.id, lines: [{ orderLineId: cement.id, quantity: "1" }] })).rejects.toThrow(/Only 0 of Cement is still to come/);
      const second = await orders.billFromOrder(client, { companyId, userId, orderId: o.id, billNo: "INV-2", issueDate: "2026-09-12", gstTreatment: "none_unregistered", lines: [{ orderLineId: cement.id, quantity: "40", unitPrice: "125" }] });
      expect(second.differences).toEqual(["Cement: MVR 125.00 a unit, not the MVR 120.00 ordered"]);
      await co.post(second.bill.id);
      s = await orders.load(client, { companyId, orderId: o.id });
      expect(s.status).toBe("done");
      expect((await projects.summary(client, { companyId, projectId: co.projectId })).committed).toBe("0.00");
    }));
});

describe("a sales order", () => {
  it("goes out, and is invoiced from what went out", () =>
    inRollback(async (client) => {
      const co = await aBuyer(client);
      const { companyId, userId } = co;
      await stock.opening(client, { companyId, userId, itemId: co.cement, quantity: "20", unitCost: "100", on: "2026-09-01" });
      const o = await orders.create(client, { companyId, userId, kind: "sale", partyName: "A customer", lines: [{ itemId: co.cement, quantity: "10", unitPrice: "200" }] });
      expect(o).toMatchObject({ number: "SO-0001", approved: true });
      const line = (await orders.load(client, { companyId, orderId: o.id })).lines[0];
      await expect(orders.invoiceFromOrder(client, { companyId, userId, orderId: o.id, gstTreatment: "none_unregistered" })).rejects.toThrow(/Nothing has gone out/);
      await orders.deliver(client, { companyId, userId, orderId: o.id, lines: [{ orderLineId: line.id, quantity: "10" }] });
      const { invoice } = await orders.invoiceFromOrder(client, { companyId, userId, orderId: o.id, issueDate: "2026-09-15", gstTreatment: "none_unregistered" });
      expect(String(invoice.gross_laari)).toBe("200000");
      await postInvoice(client, { companyId, userId, invoiceId: invoice.id });
      const held = (await stock.list(client, { companyId })).find((i) => i.id === co.cement);
      expect([held.onHand, held.costOfSales, held.margin]).toEqual(["10", "1,000.00", "1,000.00"]);
      expect((await orders.load(client, { companyId, orderId: o.id })).status).toBe("done");
    }));
});

describe("a quote", () => {
  it("accepted, becomes a sales order with the same lines; declined, is kept and marked so", () =>
    inRollback(async (client) => {
      const co = await aBuyer(client);
      const { companyId, userId } = co;
      const q = await orders.create(client, {
        companyId, userId, kind: "quote", partyName: "A prospect", validUntil: "2099-12-31",
        lines: [{ itemId: co.cement, quantity: "30", unitPrice: "210" }, { description: "Delivery", quantity: "1", unitPrice: "500" }],
      });
      expect(q).toMatchObject({ number: "QT-0001", total: 680000n });
      expect((await orders.load(client, { companyId, orderId: q.id })).status).toBe("quoted");
      const line = (await orders.load(client, { companyId, orderId: q.id })).lines[0];
      await expect(orders.deliver(client, { companyId, userId, orderId: q.id, lines: [{ orderLineId: line.id, quantity: "1" }] })).rejects.toThrow(/A quote is not delivered/);

      await client.query("INSERT INTO memberships (company_id, user_id, role) VALUES ($1, $2, 'administrator')", [companyId, userId]);
      const so = await orders.answerQuote(client, { companyId, userId, orderId: q.id, accepted: true, by: "Ms Prospect", via: "link" });
      expect(so.number).toBe("SO-0001");
      const made = orders.show(await orders.load(client, { companyId, orderId: so.id }));
      expect(made.lines.map((l) => [l.description, l.quantity, l.price])).toEqual([["Cement", "30", "210.00"], ["Delivery", "1", "500.00"]]);
      expect(orders.show(await orders.load(client, { companyId, orderId: q.id }))).toMatchObject({ status: "accepted", becameOrderId: so.id });

      // Its invoice is drafted, never posted, and takes the order's lines once.
      const { rows: [inv] } = await client.query("SELECT invoice_no, entry_id, order_id, subject FROM sales_invoices WHERE id = $1", [so.invoiceId]);
      expect(inv).toMatchObject({ invoice_no: so.invoiceNo, entry_id: null, order_id: so.id, subject: "Quote QT-0001" });
      expect((await orders.load(client, { companyId, orderId: so.id })).status).toBe("invoiced");
      const cementLine = (await orders.load(client, { companyId, orderId: so.id })).lines[0];
      await orders.deliver(client, { companyId, userId, orderId: so.id, lines: [{ orderLineId: cementLine.id, quantity: "30" }] });
      expect((await orders.load(client, { companyId, orderId: so.id })).status).toBe("done");
      await expect(orders.invoiceFromOrder(client, { companyId, userId, orderId: so.id, gstTreatment: "none_unregistered" })).rejects.toThrow(/Nothing has gone out/);
      const { rows: told } = await client.query("SELECT title, href FROM notifications WHERE company_id = $1 AND dedupe_key = $2", [companyId, `quote-accepted:${q.id}`]);
      expect(told).toEqual([{ title: "Ms Prospect accepted QT-0001", href: `/documents/invoice/${so.invoiceId}` }]);
      await expect(orders.answerQuote(client, { companyId, userId, orderId: q.id, accepted: false })).rejects.toThrow(/answered already/);

      const q2 = await orders.create(client, { companyId, userId, kind: "quote", partyName: "Another prospect", validUntil: "2020-01-01", lines: [{ description: "Survey", quantity: "1", unitPrice: "900" }] });
      expect((await orders.load(client, { companyId, orderId: q2.id })).status).toBe("expired");
      await orders.answerQuote(client, { companyId, userId, orderId: q2.id, accepted: false });
      expect((await orders.load(client, { companyId, orderId: q2.id })).status).toBe("declined");
    }));
});

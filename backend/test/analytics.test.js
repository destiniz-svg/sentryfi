/**
 * Analytics. The properties: every figure is the ledger read with a filter,
 * and the entries that open behind a figure add up to it exactly; the period
 * before is as long as the one asked for; who pays late is weighted by amount.
 */
import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import { postBill } from "../src/ledger/bills";
import { raise, post, receive } from "../src/ledger/sales";
import * as analytics from "../src/ledger/analytics";

afterAll(closePool);

async function aBusiness(client) {
  const co = await aCompanyWith(client);
  const { companyId, userId, accounts } = co;
  await client.query(
    `INSERT INTO accounts (company_id, code, name, type) VALUES
       ($1,'1300','Money owed to us','asset'), ($1,'2200','GST we owe','liability'), ($1,'4100','Work invoiced','income'), ($1,'5400','Fuel','expense')`,
    [companyId]
  );
  await assumeIdentity(client, { companyId, userId });
  const { rows } = await client.query("SELECT code, id FROM accounts WHERE company_id = $1", [companyId]);
  co.code = Object.fromEntries(rows.map((a) => [a.code, a.id]));
  const party = async (name, kind) => (await client.query("INSERT INTO counterparties (company_id, name, kind) VALUES ($1,$2,$3) RETURNING id", [companyId, name, `{${kind}}`])).rows[0].id;
  co.quick = await party("Pays on time", "customer");
  co.slow = await party("Pays late", "customer");
  co.supplier = await party("A fuel supplier", "supplier");
  co.invoice = async (who, on, due, amount) => {
    const { invoice } = await raise(client, { companyId, userId, counterpartyId: who, issueDate: on, dueDate: due, gstTreatment: "none_unregistered", lines: [{ description: "Work", amount }] });
    await post(client, { companyId, userId, invoiceId: invoice.id });
    return invoice;
  };
  co.bill = async (on, amount) => {
    const { rows: b } = await client.query(
      `INSERT INTO bills (company_id, counterparty_id, issue_date, net_laari, tax_laari, gross_laari, gst_treatment, status) VALUES ($1,$2,$3,$4,0,$4,'none_unregistered','draft') RETURNING id`,
      [companyId, co.supplier, on, String(amount)]
    );
    await postBill(client, { companyId, userId, billId: b[0].id, accounts: { expense: co.code["5400"], payable: accounts.payable, taxReclaimable: accounts.taxReclaimable } });
  };
  co.pay = (inv, on, amount) => receive(client, { companyId, userId, accountId: accounts.bank, receivedOn: on, amount, allocations: [{ invoiceId: inv.id, amount }] });
  return co;
}

describe("analytics", () => {
  it("measures a period against the one before it, as long as it", () => {
    expect(analytics.previous("2026-09-01", "2026-09-30")).toEqual({ from: "2026-08-02", to: "2026-08-31" });
    expect(analytics.previous("2026-01-01", "2026-12-31")).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(analytics.previous("2026-01-01", "2026-09-24", "year")).toEqual({ from: "2025-01-01", to: "2025-09-24" });
    expect(analytics.previous("2028-01-01", "2028-02-29", "year")).toEqual({ from: "2027-01-01", to: "2027-02-28" });
  });

  it("opens every figure onto entries that add up to it", () =>
    inRollback(async (client) => {
      const co = await aBusiness(client);
      const { companyId } = co;
      const a = await co.invoice(co.quick, "2026-08-03", "2026-08-17", "10000");
      await co.invoice(co.slow, "2026-08-05", "2026-08-19", "6000.50");
      await co.bill("2026-08-10", 250000);
      await co.bill("2026-07-10", 100000);
      await co.pay(a, "2026-08-15", "10000");
      const o = await analytics.overview(client, { companyId, from: "2026-08-01", to: "2026-08-31" });
      expect([o.kpis.income.now, o.kpis.costs.now, o.kpis.profit.now]).toEqual(["16,000.50", "2,500.00", "13,500.50"]);
      expect(o.kpis.costs.before).toBe("1,000.00");
      expect(o.kpis.costs.change).toBe(150);
      expect(o.months).toHaveLength(12);

      const period = { companyId, from: "2026-08-01", to: "2026-08-31" };
      const income = await analytics.entries(client, { ...period, type: "income" });
      expect(income.total).toBe(o.kpis.income.now);
      const costs = await analytics.entries(client, { ...period, type: "expense" });
      expect(costs.total).toBe(o.kpis.costs.now);
      const slow = o.incomeBy.find((r) => r.name === "Pays late");
      expect((await analytics.entries(client, { ...period, type: "income", counterpartyId: slow.id })).total).toBe(slow.amount);
      const fuel = o.costsBy[0];
      expect((await analytics.entries(client, { ...period, type: "expense", accountId: fuel.id })).total).toBe(fuel.amount);
    }));

  it("says who pays late, weighted by amount, and what they still owe", () =>
    inRollback(async (client) => {
      const co = await aBusiness(client);
      const x = await co.invoice(co.slow, "2026-06-01", "2026-06-15", "1000");
      const y = await co.invoice(co.slow, "2026-06-01", "2026-06-15", "3000");
      await co.invoice(co.slow, "2026-07-01", "2026-07-15", "500");
      await co.pay(x, "2026-06-11", "1000"); // 10 days, on time
      await co.pay(y, "2026-07-01", "3000"); // 30 days, 16 late
      const o = await analytics.overview(client, { companyId: co.companyId, from: "2026-06-01", to: "2026-07-31" });
      const p = o.payers.find((r) => r.name === "Pays late");
      // (1000 x 10 + 3000 x 30) / 4000 = 25 days; (3000 x 16) / 4000 = 12 days late; 25% on time.
      expect([p.daysToPay, p.daysLate, p.onTimePct]).toEqual([25, 12, 25]);
      expect([p.owed, p.overdue]).toEqual(["500.00", "500.00"]);
    }));
});

describe("the ranked lists", () => {
  it("put the largest first", () =>
    inRollback(async (client) => {
      const co = await aBusiness(client);
      await client.query("INSERT INTO accounts (company_id, code, name, type) VALUES ($1,'5500','Office','expense')", [co.companyId]);
      await co.invoice(co.quick, "2026-08-03", "2026-08-17", "100");
      await co.invoice(co.slow, "2026-08-04", "2026-08-18", "900");
      const o = await analytics.overview(client, { companyId: co.companyId, from: "2026-08-01", to: "2026-08-31" });
      expect(o.incomeBy.map((r) => r.name)).toEqual(["Pays late", "Pays on time"]);
    }));
});

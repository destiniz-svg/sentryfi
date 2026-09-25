/**
 * Purchase returns. The properties: goods go back at what they came in at on
 * that bill, so stock still equals its value; a charge goes back in the bill's
 * shares, GST included; what is owed on the bill falls by the return and a
 * return can never take back more than is owed; and the GST return takes the
 * input tax back off in the month of the return.
 */
import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import { postBill } from "../src/ledger/bills";
import * as stock from "../src/ledger/stock";
import * as returns from "../src/ledger/purchaseReturns";

afterAll(closePool);

async function setUp(client) {
  const co = await aCompanyWith(client);
  const { companyId, userId } = co;
  await assumeIdentity(client, { companyId, userId });
  co.supplier = (await client.query("INSERT INTO counterparties (company_id, name, kind) VALUES ($1,'Island Cement','{supplier}') RETURNING id", [companyId])).rows[0].id;
  co.bill = async ({ net, tax = "0", stockLines = null }) => {
    const n = BigInt(Math.round(Number(net) * 100));
    const t = BigInt(Math.round(Number(tax) * 100));
    const { rows } = await client.query(
      `INSERT INTO bills (company_id, counterparty_id, bill_no, issue_date, net_laari, tax_laari, gross_laari, gst_treatment, gst_rate_bp, status)
       VALUES ($1,$2,'IC-1','2026-09-10',$3,$4,$5,$6,$7,'draft') RETURNING id`,
      [companyId, co.supplier, n.toString(), t.toString(), (n + t).toString(), t > 0n ? "exclusive" : "none_unregistered", t > 0n ? 800 : null]
    );
    if (stockLines) await stock.setBillStock(client, { companyId, userId, billId: rows[0].id, lines: stockLines });
    await postBill(client, { companyId, userId, billId: rows[0].id, accounts: { expense: co.accounts.expense, payable: co.accounts.payable, taxReclaimable: co.accounts.taxReclaimable } });
    return rows[0].id;
  };
  co.balance = async (code) => (await client.query("SELECT COALESCE(SUM(l.debit_laari - l.credit_laari), 0)::text AS b FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE a.company_id = $1 AND a.code = $2", [companyId, code])).rows[0].b;
  return co;
}

describe("purchase returns", () => {
  it("takes a charge back in the bill's shares, GST included, and never more than is owed", () =>
    inRollback(async (client) => {
      const co = await setUp(client);
      const billId = await co.bill({ net: "1000.00", tax: "80.00" });
      expect(await co.balance("2100")).toBe("-108000");
      await expect(returns.create(client, { companyId: co.companyId, userId: co.userId, billId, reason: "Too much", amount: "2000" })).rejects.toThrow(/Only MVR 1,080.00 is still owed/);
      const { ret } = await returns.create(client, { companyId: co.companyId, userId: co.userId, billId, reason: "Two bags damaged", amount: "216.00", issueDate: "2026-09-20" });
      expect(ret.number).toBe("PR-0001");
      expect([ret.net_laari, ret.tax_laari, ret.gross_laari]).toEqual(["20000", "1600", "21600"]);
      expect(await co.balance("2100")).toBe("-86400");
      expect(await co.balance("1400")).toBe("6400");
      expect(await co.balance("5100")).toBe("80000");
      const { left } = await returns.returnable(client, { companyId: co.companyId, billId });
      expect(left).toBe(86400n);
    }));

  it("sends goods back at what they came in at, so stock still equals its value", () =>
    inRollback(async (client) => {
      const co = await setUp(client);
      const cement = (await client.query("INSERT INTO stock_items (company_id, name, unit, created_by) VALUES ($1,'Cement','bag',$2) RETURNING id", [co.companyId, co.userId])).rows[0].id;
      const billId = await co.bill({ net: "1000.00", stockLines: [{ itemId: cement, quantity: "10", amount: "1000.00" }] });
      await returns.create(client, { companyId: co.companyId, userId: co.userId, billId, reason: "Wrong grade", items: [{ itemId: cement, quantity: "3" }] });
      const held = await stock.holding(client, { companyId: co.companyId, itemId: cement });
      expect(stock.unitsText(held.units)).toBe("7");
      expect(held.value).toBe(70000n);
      expect(await co.balance("1350")).toBe("70000");
      await expect(returns.create(client, { companyId: co.companyId, userId: co.userId, billId, reason: "More", items: [{ itemId: cement, quantity: "8" }] })).rejects.toThrow(/Only 7/);
      await expect(returns.create(client, { companyId: co.companyId, userId: co.userId, billId, reason: "A charge", amount: "50" })).rejects.toThrow(/went into stock/);
    }));
});

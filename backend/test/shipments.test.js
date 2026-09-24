/**
 * Shipments and landed cost. Figures are made up, in the shape of a real
 * import: steel bought in dollars with the ocean freight on the same invoice,
 * a clearing agent's bill in rufiyaa, and Customs paid from the bank.
 *
 * The properties: every landing cost waits on 1360 until shared; shared by
 * value, quantity or container space, it lands on the goods to the laari;
 * the share of goods already sold goes to cost of goods sold; import GST is
 * claimed, not buried in the stock; the value on hand still equals the Stock
 * account; and a bill whose costs are shared cannot quietly be reversed.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import { postBill } from "../src/ledger/bills";
import { raise, post } from "../src/ledger/sales";
import * as billSplit from "../src/ledger/billSplit";
import * as shipments from "../src/ledger/shipments";
import * as stock from "../src/ledger/stock";
import * as adviser from "../src/ledger/adviser";
import * as gst from "../src/ledger/gstReturn";
import { reverseEntry } from "../src/ledger/post";

afterAll(closePool);

async function anImporter(client, { basis = "value", cbm = [20, 20] } = {}) {
  const co = await aCompanyWith(client);
  const { companyId, userId } = co;
  await client.query(
    `INSERT INTO accounts (company_id, code, name, type) VALUES ($1,'1300','Money owed to us','asset'), ($1,'2200','GST we owe','liability'), ($1,'4100','Sales','income')`,
    [companyId]
  );
  await assumeIdentity(client, { companyId, userId });
  const party = async (name, kind = "supplier") =>
    (await client.query("INSERT INTO counterparties (company_id, name, kind) VALUES ($1,$2,$3) RETURNING id", [companyId, name, `{${kind}}`])).rows[0].id;
  const item = async (name) =>
    (await client.query("INSERT INTO stock_items (company_id, name, unit, created_by) VALUES ($1,$2,'ton',$3) RETURNING id", [companyId, name, userId])).rows[0].id;
  co.bar10 = await item("Deformed bar 10mm");
  co.bar16 = await item("Deformed bar 16mm");
  co.steelCo = await party("Overseas steel");
  co.agent = await party("Clearing agent");
  co.customer = await party("A customer", "customer");
  co.shipmentId = await shipments.create(client, {
    companyId, userId, reference: "BL-TEST-1", basis,
    containers: [{ number: "ABCU1111111", size: "20", cbm: String(cbm[0]) }, { number: "ABCU2222222", size: "20", cbm: String(cbm[1]) }],
  });
  const { rows: boxes } = await client.query("SELECT id FROM shipment_containers WHERE shipment_id = $1 ORDER BY number", [co.shipmentId]);
  co.boxes = boxes.map((b) => b.id);
  co.bill = async ({ party: p, net, fx, lines, billNo }) => {
    const { rows } = await client.query(
      `INSERT INTO bills (company_id, counterparty_id, bill_no, issue_date, net_laari, tax_laari, gross_laari, gst_treatment, status,
                          currency, fx_rate, fc_net, fc_tax, fc_gross, shipment_id)
       VALUES ($1,$2,$3,'2026-06-20',$4,0,$4,'none_unregistered','draft',$5,$6,$7,$8,$7,$9) RETURNING id`,
      [companyId, p, billNo, fx ? fx.base : String(net), fx ? "USD" : "MVR", fx ? fx.rate : null, fx ? String(net) : null, fx ? "0" : null, co.shipmentId]
    );
    await billSplit.save(client, { companyId, userId, billId: rows[0].id, lines });
    await postBill(client, { companyId, userId, billId: rows[0].id, accounts: { expense: co.accounts.expense, payable: co.accounts.payable, taxReclaimable: co.accounts.taxReclaimable } });
    return rows[0].id;
  };
  // USD 21,000 at 15.42: 20 t and 10 t at USD 600, and USD 3,000 of ocean freight.
  co.steelBill = await co.bill({
    party: co.steelCo, billNo: "PI-1", net: 2100000, fx: { base: "32382000", rate: "15.42" },
    lines: [
      { kind: "stock", description: "Deformed bar 10mm", itemId: co.bar10, quantity: "20", amount: "12000" },
      { kind: "stock", description: "Deformed bar 16mm", itemId: co.bar16, quantity: "10", amount: "6000" },
      { kind: "landed", description: "Shipping charges", shipmentId: co.shipmentId, amount: "3000" },
    ],
  });
  const { rows: goods } = await client.query("SELECT id, item_id FROM bill_stock_lines WHERE bill_id = $1 ORDER BY position", [co.steelBill]);
  await shipments.placeInContainer(client, { companyId, shipmentId: co.shipmentId, lineId: goods[0].id, containerId: co.boxes[0] });
  await shipments.placeInContainer(client, { companyId, shipmentId: co.shipmentId, lineId: goods[1].id, containerId: co.boxes[1] });
  // The clearing agent, not GST-registered: MVR 2,000, every line a landing cost.
  co.agentBill = await co.bill({
    party: co.agent, billNo: "AG-1", net: 200000,
    lines: [
      { kind: "landed", description: "Clearance and labour", shipmentId: co.shipmentId, amount: "1400" },
      { kind: "landed", description: "Transport charge", shipmentId: co.shipmentId, amount: "600" },
    ],
  });
  // Customs: MVR 5,000 of duty and MVR 1,000 of GST, paid from the bank.
  await shipments.payDirect(client, { companyId, userId, shipmentId: co.shipmentId, kind: "duty", description: "Customs duty", amount: "5000", gstAmount: "1000", fromAccountId: co.accounts.bank, on: "2026-06-25" });
  co.balance = async (code) =>
    BigInt(
      (
        await client.query(
          `SELECT COALESCE(SUM(l.debit_laari - l.credit_laari), 0) AS b FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE a.company_id = $1 AND a.code = $2`,
          [companyId, code]
        )
      ).rows[0].b
    );
  co.held = async (itemId) => (await stock.list(client, { companyId })).find((i) => i.id === itemId);
  return co;
}

// Waiting: freight 46,260.00 + agent 2,000.00 + duty 5,000.00 = 53,260.00.
const WAITING = 5326000n;

describe("landing costs", () => {
  it("wait on 1360, with import GST claimed rather than buried", () =>
    inRollback(async (client) => {
      const co = await anImporter(client);
      expect(await co.balance("1360")).toBe(WAITING);
      expect(await co.balance("1400")).toBe(100000n);
      const s = (await shipments.list(client, { companyId: co.companyId }))[0];
      expect(s).toMatchObject({ goodsValue: "277,560.00", landed: "53,260.00", waiting: "53,260.00" });
      expect(s.costs.map((c) => c.kind).sort()).toEqual(["clearing", "clearing", "duty", "freight"]);
    }));

  it("shared by value, land on the goods to the laari and leave nothing waiting", () =>
    inRollback(async (client) => {
      const co = await anImporter(client);
      const r = await shipments.allocateCosts(client, { companyId: co.companyId, userId: co.userId, shipmentId: co.shipmentId, on: "2026-06-30" });
      expect(r.total).toBe(WAITING);
      expect(r.soldShare).toBe(0n);
      // Goods 185,040.00 and 92,520.00: two thirds and one third.
      expect((await co.held(co.bar10)).value).toBe("220,546.67");
      expect((await co.held(co.bar16)).value).toBe("110,273.33");
      expect(await co.balance("1360")).toBe(0n);
      expect(await co.balance("1350")).toBe(33082000n);
      await expect(shipments.allocateCosts(client, { companyId: co.companyId, userId: co.userId, shipmentId: co.shipmentId, on: "2026-06-30" })).rejects.toThrow(/No landing costs are waiting/);
    }));

  it("put the share of goods already sold into cost of goods sold", () =>
    inRollback(async (client) => {
      const co = await anImporter(client);
      const { invoice } = await raise(client, {
        companyId: co.companyId, userId: co.userId, counterpartyId: co.customer, gstTreatment: "none_unregistered", issueDate: "2026-06-26",
        lines: [{ itemId: co.bar16, quantity: 5, unitPrice: "12000" }],
      });
      await post(client, { companyId: co.companyId, userId: co.userId, invoiceId: invoice.id });
      const cogsBefore = await co.balance("5050");
      const r = await shipments.allocateCosts(client, { companyId: co.companyId, userId: co.userId, shipmentId: co.shipmentId, on: "2026-06-30" });
      // 16mm's share is 17,753.33; half of the 10 t is gone.
      expect(r.soldShare).toBe(887667n);
      expect((await co.balance("5050")) - cogsBefore).toBe(887667n);
      expect((await co.held(co.bar16)).value).toBe("55,136.66");
      expect(await co.balance("1350")).toBe(33082000n - 4626000n - 887667n);
    }));

  it("share by quantity", () =>
    inRollback(async (client) => {
      const byWeight = await anImporter(client, { basis: "quantity" });
      await shipments.allocateCosts(client, { companyId: byWeight.companyId, userId: byWeight.userId, shipmentId: byWeight.shipmentId, on: "2026-06-30" });
      // 20 t and 10 t: the same two thirds and one third as by value here.
      expect((await byWeight.held(byWeight.bar16)).value).toBe("110,273.33");
    }));

  it("share by container space", () =>
    inRollback(async (client) => {
      const bySpace = await anImporter(client, { basis: "cbm", cbm: [30, 10] });
      await shipments.allocateCosts(client, { companyId: bySpace.companyId, userId: bySpace.userId, shipmentId: bySpace.shipmentId, on: "2026-06-30" });
      // 30 m3 and 10 m3: three quarters of 53,260.00 to the 10mm container.
      expect((await bySpace.held(bySpace.bar10)).value).toBe("224,985.00");
      expect((await bySpace.held(bySpace.bar16)).value).toBe("105,835.00");
    }));

  it("will not let a bill whose costs are shared be reversed", () =>
    inRollback(async (client) => {
      const co = await anImporter(client);
      await shipments.allocateCosts(client, { companyId: co.companyId, userId: co.userId, shipmentId: co.shipmentId, on: "2026-06-30" });
      await expect(shipments.undoBillCosts(client, { companyId: co.companyId, billId: co.agentBill })).rejects.toThrow(/shared into the goods already/);
    }));

  it("the adviser puts a clearing agent's lines on the open shipment", () =>
    inRollback(async (client) => {
      const co = await anImporter(client);
      const a = await adviser.advise(client, {
        companyId: co.companyId, counterpartyId: co.agent,
        lines: [{ description: "Form set", amountLaari: 5000n }, { description: "Customs process", amountLaari: 20000n }],
      });
      expect(a.map((x) => [x.kind, x.shipmentId])).toEqual([["landed", co.shipmentId], ["landed", co.shipmentId]]);
    }));

  it("puts GST paid at Customs on the GST return, and takes it off when reversed", () =>
    inRollback(async (client) => {
      const co = await anImporter(client);
      const june = await gst.build(client, { companyId: co.companyId, key: "2026-06" });
      const line = june.bills.find((b) => b.customs);
      expect(line).toMatchObject({ bill_no: "BL-TEST-1", tax_laari: "100000", net_laari: "1250000", gst_rate_bp: 800, sign: 1 });
      expect(june.inp.tax).toBe(june.ledger.input);
      expect(june.problems.map((p) => p.what).join()).not.toMatch(/Input tax|TIN/);
      const { rows } = await client.query("SELECT entry_id FROM journal_lines WHERE company_id = $1 AND memo LIKE '%GST paid at Customs'", [co.companyId]);
      await reverseEntry(client, { companyId: co.companyId, userId: co.userId, entryId: rows[0].entry_id, reason: "wrong shipment", date: "2026-07-02" });
      const july = await gst.build(client, { companyId: co.companyId, key: "2026-07" });
      expect(july.bills.find((b) => b.customs)).toMatchObject({ sign: -1, tax_laari: "100000" });
      expect(july.inp.tax).toBe(july.ledger.input);
    }));
});

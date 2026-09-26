/**
 * The auditor's workspace: a period's seal, and samples kept as drawn, each
 * item opening onto its document, entry and money, ticked as seen with a note.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import { postBill } from "../src/ledger/bills";
import * as audit from "../src/ledger/audit";

afterAll(closePool);

async function withBills(client) {
  const co = await aCompanyWith(client);
  const { companyId, userId, accounts } = co;
  await assumeIdentity(client, { companyId, userId });
  const supplier = (await client.query("INSERT INTO counterparties (company_id, name, kind) VALUES ($1,'Island Hardware','{supplier}') RETURNING id", [companyId])).rows[0].id;
  co.bills = [];
  for (const [i, [amount, on]] of [[10000, "2025-02-01"], [20000, "2025-04-01"], [30000, "2025-06-01"], [40000, "2025-08-01"], [50000, "2025-10-01"], [60000, "2026-01-05"]].entries()) {
    const { rows } = await client.query(
      `INSERT INTO bills (company_id, counterparty_id, bill_no, issue_date, net_laari, tax_laari, gross_laari, gst_treatment, status)
       VALUES ($1,$2,$3,$4,$5,0,$5,'none_unregistered','draft') RETURNING id`,
      [companyId, supplier, `IH-${i + 1}`, on, amount]
    );
    await postBill(client, { companyId, userId, billId: rows[0].id, accounts: { expense: accounts.expense, payable: accounts.payable, taxReclaimable: accounts.taxReclaimable } });
    co.bills.push(rows[0].id);
  }
  return co;
}

describe("the audit workspace", () => {
  it("checks the seal over a period and keeps samples drawn at random or by value", () =>
    inRollback(async (client) => {
      const { companyId, userId, bills } = await withBills(client);
      await expect(audit.createPeriod(client, { companyId, userId, from: "2025-12-31", to: "2025-01-01" })).rejects.toThrow(/ends before it starts/);
      const { id: periodId, seal } = await audit.createPeriod(client, { companyId, userId, name: "Year to 31 Dec 2025", from: "2025-01-01", to: "2025-12-31" });
      expect(seal).toMatchObject({ ok: true, entries: 5, checked: 6, problems: [] });

      // Two at random, out of the five in the year (the January 2026 bill is not in it).
      const random = await audit.draw(client, { companyId, userId, periodId, kind: "bill", how: "random", size: 2 });
      expect(random).toMatchObject({ drawn: 2, population: 5 });
      // Every bill of MVR 300 or more: three.
      const big = await audit.draw(client, { companyId, userId, periodId, kind: "bill", how: "over", over: "300" });
      expect(big.drawn).toBe(3);
      await expect(audit.draw(client, { companyId, userId, periodId, kind: "invoice", how: "random", size: 3 })).rejects.toThrow(/nothing to draw/);
      await expect(audit.draw(client, { companyId, userId, periodId, kind: "bill", how: "random", size: 0 })).rejects.toThrow(/between 1 and 200/);

      const s = await audit.sample(client, { companyId, sampleId: big.id });
      expect(s.items.map((i) => [i.no, i.amount, i.party])).toEqual([["IH-5", "500.00", "Island Hardware"], ["IH-4", "400.00", "Island Hardware"], ["IH-3", "300.00", "Island Hardware"]]);
      expect(s.items.every((i) => bills.includes(i.docId) && i.seen === null)).toBe(true);

      // An item opens onto its bill and the entry it made.
      const ev = await audit.evidence(client, { companyId, sampleId: big.id, itemId: s.items[0].id });
      expect(ev.document).toMatchObject({ no: "IH-5", on: "2025-10-01", gross: "500.00", status: "posted" });
      expect(ev.entry.on).toBe("2025-10-01");
      expect(ev.entry.lines.map((l) => [l.account, l.debit, l.credit])).toEqual([["5100 Materials", "500.00", "0.00"], ["2100 Suppliers we owe", "0.00", "500.00"]]);
      expect(ev.money).toEqual([]);

      // Seen, with a note; the period shows three of three seen for that sample.
      await audit.see(client, { companyId, userId, sampleId: big.id, itemId: s.items[0].id, note: "Agreed to delivery note DN-88" });
      const again = await audit.sample(client, { companyId, sampleId: big.id });
      expect(again.items[0]).toMatchObject({ note: "Agreed to delivery note DN-88", seen: { by: "Test" } });
      const p = await audit.period(client, { companyId, periodId });
      expect(p.samples.map((x) => [x.how, x.items, x.seen])).toEqual([["random", 2, 0], ["over", 3, 1]]);
      expect(p.seal.ok).toBe(true);

      // A tick taken back.
      await audit.see(client, { companyId, userId, sampleId: big.id, itemId: s.items[0].id, seen: false, note: "Delivery note missing" });
      expect((await audit.sample(client, { companyId, sampleId: big.id })).items[0]).toMatchObject({ seen: null, note: "Delivery note missing" });

      // Journal entries can be sampled too.
      const entries = await audit.draw(client, { companyId, userId, periodId, kind: "entry", how: "over", over: "450" });
      expect(entries.drawn).toBe(1);
    }));
});

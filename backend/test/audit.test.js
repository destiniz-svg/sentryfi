/**
 * The auditor's workspace: a period's seal, samples kept as drawn and provable
 * from their seed, each item opening onto its document, entry and money,
 * ticked as seen with a note; and the journal risk screen (ISA 240).
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity, postEntry } from "../src/ledger/post";
import { postBill } from "../src/ledger/bills";
import * as audit from "../src/ledger/audit";
import * as risk from "../src/ledger/auditRisk";

afterAll(closePool);

// Five bills in 2025 of MVR 100 to 500, one of MVR 2,000, and one in January 2026.
const BILLS = [[10000, "2025-02-01"], [20000, "2025-04-01"], [30000, "2025-06-01"], [40000, "2025-08-01"], [50000, "2025-10-01"], [200000, "2025-12-30"], [60000, "2026-01-05"]];

async function withBills(client) {
  const co = await aCompanyWith(client);
  const { companyId, userId, accounts } = co;
  await assumeIdentity(client, { companyId, userId });
  const supplier = (await client.query("INSERT INTO counterparties (company_id, name, kind) VALUES ($1,'Island Hardware','{supplier}') RETURNING id", [companyId])).rows[0].id;
  co.bills = [];
  co.post = async (amount, on, i) => {
    const { rows } = await client.query(
      `INSERT INTO bills (company_id, counterparty_id, bill_no, issue_date, net_laari, tax_laari, gross_laari, gst_treatment, status)
       VALUES ($1,$2,$3,$4,$5,0,$5,'none_unregistered','draft') RETURNING id`,
      [companyId, supplier, `IH-${i}`, on, amount]
    );
    await postBill(client, { companyId, userId, billId: rows[0].id, accounts: { expense: accounts.expense, payable: accounts.payable, taxReclaimable: accounts.taxReclaimable } });
    co.bills.push(rows[0].id);
    return rows[0].id;
  };
  for (const [i, [amount, on]] of BILLS.entries()) await co.post(amount, on, i + 1);
  return co;
}

describe("the audit workspace", () => {
  it("checks the seal, draws samples that keep their seed, and proves them by drawing again", () =>
    inRollback(async (client) => {
      const co = await withBills(client);
      const { companyId, userId, bills } = co;
      await expect(audit.createPeriod(client, { companyId, userId, from: "2025-12-31", to: "2025-01-01" })).rejects.toThrow(/ends before it starts/);
      const { id: periodId, seal } = await audit.createPeriod(client, { companyId, userId, name: "Year to 31 Dec 2025", from: "2025-01-01", to: "2025-12-31" });
      expect(seal).toMatchObject({ ok: true, entries: 6, checked: 7, problems: [] });

      // Two at random from the six bills in the year; the seed is kept and proves the same two.
      const random = await audit.draw(client, { companyId, userId, periodId, kind: "bill", how: "random", size: 2 });
      expect(random).toMatchObject({ drawn: 2, population: 6 });
      expect(random.seed).toMatch(/^[0-9a-f]{16}$/);
      expect(await audit.prove(client, { companyId, sampleId: random.id })).toMatchObject({ provable: true, samePopulation: true, sameItems: true });

      // Every bill of MVR 300 or more: four, largest first.
      const big = await audit.draw(client, { companyId, userId, periodId, kind: "bill", how: "over", over: "300" });
      const s = await audit.sample(client, { companyId, sampleId: big.id });
      expect(s.items.map((i) => [i.no, i.amount])).toEqual([["IH-6", "2,000.00"], ["IH-5", "500.00"], ["IH-4", "400.00"], ["IH-3", "300.00"]]);
      expect(s.said).toBe("Every one of the bills of MVR 300.00 or more");
      expect(s.items.every((i) => bills.includes(i.docId) && i.seen === null && i.changed === null)).toBe(true);

      // Key items and the rest: the MVR 2,000 bill always, and two of the other five at random.
      const key = await audit.sample(client, { companyId, sampleId: (await audit.draw(client, { companyId, userId, periodId, kind: "bill", how: "key", over: "1000", size: 2 })).id });
      expect(key.items).toHaveLength(3);
      expect(key.items[0]).toMatchObject({ no: "IH-6", why: "Key item: MVR 1,000.00 or more" });
      expect(key.items.slice(1).every((i) => i.why === "At random from the rest")).toBe(true);

      // Monetary unit, three hits over MVR 3,500: the interval is MVR 1,166.66, so the MVR 2,000 bill is always drawn.
      const unit = await audit.sample(client, { companyId, sampleId: (await audit.draw(client, { companyId, userId, periodId, kind: "bill", how: "mus", size: 3 })).id });
      expect(unit.said).toBe("3 bills by monetary unit, one hit every MVR 1,166.66");
      expect(unit.items[0]).toMatchObject({ no: "IH-6", why: expect.stringMatching(/always drawn/) });
      expect(unit.items.length).toBeGreaterThanOrEqual(2);

      // A bill added to the period afterwards: the proof says the population changed.
      await co.post(70000, "2025-07-01", 99);
      const later = await audit.prove(client, { companyId, sampleId: random.id });
      expect(later).toMatchObject({ samePopulation: false, then: { count: 6 }, now: { count: 7 } });

      await expect(audit.draw(client, { companyId, userId, periodId, kind: "invoice", how: "random", size: 3 })).rejects.toThrow(/nothing to draw/);
      await expect(audit.draw(client, { companyId, userId, periodId, kind: "bill", how: "random", size: 0 })).rejects.toThrow(/between 1 and 200/);
      await expect(audit.draw(client, { companyId, userId, periodId, kind: "bill", how: "risk", tests: ["late"] })).rejects.toThrow(/about entries/);
    }));

  it("opens an item onto its document and entry, and keeps the tick and note", () =>
    inRollback(async (client) => {
      const { companyId, userId } = await withBills(client);
      const { id: periodId } = await audit.createPeriod(client, { companyId, userId, from: "2025-01-01", to: "2025-12-31" });
      const big = await audit.draw(client, { companyId, userId, periodId, kind: "bill", how: "over", over: "500" });
      const s = await audit.sample(client, { companyId, sampleId: big.id });
      const ev = await audit.evidence(client, { companyId, sampleId: big.id, itemId: s.items[0].id });
      expect(ev.document).toMatchObject({ title: "Bill", no: "IH-6", on: "2025-12-30", gross: "2,000.00" });
      expect(ev.entry).toMatchObject({ on: "2025-12-30", posted_by: "Test", source: "bill" });
      expect(ev.entry.lines.map((l) => [l.account, l.debit, l.credit])).toEqual([["5100 Materials", "2,000.00", "0.00"], ["2100 Suppliers we owe", "0.00", "2,000.00"]]);
      expect(ev.money).toEqual({ title: "Paid", rows: [] });
      // Its entry was posted today for a 2025 bill: the screen says so.
      expect(ev.flags.map((x) => x.test)).toEqual(expect.arrayContaining(["late", "round", "year_end"]));

      await audit.see(client, { companyId, userId, sampleId: big.id, itemId: s.items[0].id, note: "Agreed to delivery note DN-88" });
      expect((await audit.sample(client, { companyId, sampleId: big.id })).items[0]).toMatchObject({ note: "Agreed to delivery note DN-88", seen: { by: "Test" } });
      const p = await audit.period(client, { companyId, periodId });
      expect(p.samples.map((x) => [x.how, x.items, x.seen])).toEqual([["over", 2, 1]]);
      await audit.see(client, { companyId, userId, sampleId: big.id, itemId: s.items[0].id, seen: false, note: "Delivery note missing" });
      expect((await audit.sample(client, { companyId, sampleId: big.id })).items[0]).toMatchObject({ seen: null, note: "Delivery note missing" });
    }));

  it("screens the period's entries for the signs of override, and draws from them", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await withBills(client);
      await assumeIdentity(client, { companyId, userId });
      // An entry made by hand, with no real description.
      await postEntry(client, { companyId, userId, date: "2025-09-09", source: "adjustment", narrative: "adj", lines: [{ accountId: accounts.expense, debit: 12345n }, { accountId: accounts.bank, credit: 12345n }] });
      const screened = await risk.screen(client, { companyId, from: "2025-01-01", to: "2025-12-31" });
      expect(screened.total).toBe(7);
      // Everything was posted in 2026 for a 2025 date: all seven are late.
      expect(screened.tests.find((t) => t.key === "late").count).toBe(7);
      const hand = screened.entries.find((e) => e.narrative === "adj");
      expect(hand.flags.map((x) => x.test)).toEqual(expect.arrayContaining(["manual", "undescribed", "late", "backdated"]));
      expect(hand.flags.find((x) => x.test === "undescribed").said).toBe('Described only as "adj"');
      expect(screened.entries[0].score).toBeGreaterThanOrEqual(screened.entries.at(-1).score);

      const { id: periodId } = await audit.createPeriod(client, { companyId, userId, from: "2025-01-01", to: "2025-12-31" });
      const drawn = await audit.draw(client, { companyId, userId, periodId, kind: "entry", how: "risk", tests: ["manual"] });
      const s = await audit.sample(client, { companyId, sampleId: drawn.id });
      expect(s.items).toHaveLength(1);
      expect(s.items[0]).toMatchObject({ party: "adj", why: "Made by hand, not from a bill, invoice or other document" });
      expect(s.said).toBe("Every one of the entries that came from no document");
      expect(await audit.prove(client, { companyId, sampleId: drawn.id })).toMatchObject({ sameItems: true });
    }));

  it("lays monetary-unit hits end to end from the seed's start", () => {
    const rows = [
      { id: "a", no: "1", day: "2025-01-01", amount: "100" },
      { id: "b", no: "2", day: "2025-01-02", amount: "900" },
      { id: "c", no: "3", day: "2025-01-03", amount: "50" },
    ];
    const { picked, interval } = audit.mus("seed", rows, 2);
    expect(interval).toBe(525n);
    expect(picked.map((r) => r.id)).toContain("b");
    expect(audit.mus("seed", rows, 2).picked).toEqual(picked);
  });
});

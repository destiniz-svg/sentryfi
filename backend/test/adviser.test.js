/**
 * The adviser and the split it feeds. The properties: a charge is suggested
 * from what was decided before, then from stock, then from its words, and is
 * only sure when this supplier's same charge was decided before; what a
 * person decides is learned; a bill split into stock, costs and an asset
 * posts each where it belongs and balances; reversing it takes the asset back
 * off the register, unless it has been depreciated since.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity, reverseEntry } from "../src/ledger/post";
import { postBill } from "../src/ledger/bills";
import * as adviser from "../src/ledger/adviser";
import * as billSplit from "../src/ledger/billSplit";
import { depreciate } from "../src/ledger/assets";

afterAll(closePool);

async function aBuyer(client) {
  const co = await aCompanyWith(client);
  const { companyId, userId } = co;
  await client.query(
    `INSERT INTO accounts (company_id, code, name, type) VALUES
       ($1,'5200','Labour','expense'), ($1,'5400','Equipment and fuel','expense'), ($1,'5500','Transport and boat freight','expense')`,
    [companyId]
  );
  await assumeIdentity(client, { companyId, userId });
  const { rows: acc } = await client.query("SELECT code, id FROM accounts WHERE company_id = $1", [companyId]);
  co.code = Object.fromEntries(acc.map((a) => [a.code, a.id]));
  co.party = async (name) =>
    (await client.query("INSERT INTO counterparties (company_id, name, kind) VALUES ($1,$2,'{supplier}') RETURNING id", [companyId, name])).rows[0].id;
  co.bill = async (supplier, net, lines) =>
    (
      await client.query(
        `INSERT INTO bills (company_id, counterparty_id, issue_date, net_laari, tax_laari, gross_laari, gst_treatment, status, read_lines)
         VALUES ($1,$2,'2026-06-15',$3,0,$3,'none_unregistered','draft',$4) RETURNING *`,
        [companyId, supplier, String(net), lines ? JSON.stringify(lines) : null]
      )
    ).rows[0];
  co.post = (billId) =>
    postBill(client, { companyId, userId, billId, accounts: { expense: co.accounts.expense, payable: co.accounts.payable, taxReclaimable: co.accounts.taxReclaimable } });
  return co;
}

describe("reading a charge", () => {
  it("keeps the words that say what it is", () => {
    expect(adviser.keyOf("Cement OPC 50kg x 10 bags")).toBe("cement opc 50kg bags");
    expect(adviser.keyOf("DEFORMED BAR 10MM X 5.9M")).not.toBe(adviser.keyOf("DEFORMED BAR 16MM X 5.9M"));
    expect(adviser.keyOf("DIESEL 200 LTR @ 17.50")).toBe("diesel");
  });

  it("splits read lines to the bill's net exactly, whatever the printed lines add to", () => {
    const lines = adviser.linesFor({ read_lines: [{ description: "a", amount: "100" }, { description: "b", amount: "200" }] }, 32401n);
    expect(lines.map((l) => l.amountLaari)).toEqual([10800n, 21601n]);
    expect(adviser.linesFor({ read_lines: null }, 500n)).toEqual([{ description: "", quantity: "", amountLaari: 500n }]);
  });
});

describe("advice", () => {
  it("suggests from words, from stock, and puts only a large lasting thing on the register", () =>
    inRollback(async (client) => {
      const co = await aBuyer(client);
      const { companyId, userId } = co;
      const s = await co.party("Fuel Supplier");
      await client.query("INSERT INTO stock_items (company_id, name, unit, created_by) VALUES ($1,'Cement OPC','bag',$2)", [companyId, userId]);
      const a = await adviser.advise(client, {
        companyId, counterpartyId: s,
        lines: [
          { description: "Diesel 200 ltr", amountLaari: 350000n },
          { description: "Cement OPC 50kg", quantity: "10", amountLaari: 150000n },
          { description: "Generator 20kVA", amountLaari: 4500000n },
          { description: "Generator spark plug", amountLaari: 20000n },
          { description: "Boat freight Male to site", amountLaari: 80000n },
        ],
      });
      expect(a.map((x) => [x.kind, x.sure])).toEqual([["cost", false], ["stock", false], ["asset", false], ["cost", false], ["cost", false]]);
      expect(a[0].accountId).toBe(co.code["5400"]);
      expect(a[2].category).toBe("equipment");
      expect(a[3].accountId).toBe(co.code["5100"]);
      expect(a[4].accountId).toBe(co.code["5500"]);
      expect(a.every((x) => x.because)).toBe(true);
    }));

  it("learns what a person decided, is sure of it next time from the same supplier, and only suggests it from another", () =>
    inRollback(async (client) => {
      const co = await aBuyer(client);
      const { companyId, userId } = co;
      const s = await co.party("Island Hardware");
      const other = await co.party("Another Hardware");
      const first = await co.bill(s, 50000, [{ description: "Site cleaning, June", amount: "500" }]);
      let a = await adviser.advise(client, { companyId, counterpartyId: s, lines: adviser.linesFor(first, 50000n) });
      expect(a[0].sure).toBe(false);
      const decided = [{ kind: "cost", description: "Site cleaning, June", amount: "500.00", accountId: co.code["5200"] }];
      await billSplit.save(client, { companyId, userId, billId: first.id, lines: decided });
      await adviser.learn(client, { companyId, counterpartyId: s, decisions: decided });

      a = await adviser.advise(client, { companyId, counterpartyId: s, lines: [{ description: "Site cleaning, July", amountLaari: 50000n }] });
      expect(a[0]).toMatchObject({ kind: "cost", accountId: co.code["5200"], sure: true });
      a = await adviser.advise(client, { companyId, counterpartyId: other, lines: [{ description: "Site cleaning", amountLaari: 50000n }] });
      expect(a[0]).toMatchObject({ kind: "cost", accountId: co.code["5200"], sure: false });

      // The next bill from the same supplier goes in on the adviser's word.
      const second = await co.bill(s, 60000, [{ description: "Site cleaning, July", amount: "600" }]);
      expect(await adviser.applyIfSure(client, { companyId, userId, billId: second.id })).toBe(true);
      const done = await co.post(second.id);
      const { rows } = await client.query("SELECT account_id, debit_laari FROM journal_lines WHERE entry_id = $1 AND debit_laari > 0", [done.entry.id]);
      expect(rows).toEqual([{ account_id: co.code["5200"], debit_laari: "60000" }]);
      // A new supplier's bill is not guessed at: it goes in as it always has.
      const third = await co.bill(other, 1000, [{ description: "Site cleaning", amount: "10" }]);
      expect(await adviser.applyIfSure(client, { companyId, userId, billId: third.id })).toBe(false);
    }));
});

describe("a bill split into stock, costs and an asset", () => {
  it("posts each part where it belongs, and reversing takes the asset back off the register", () =>
    inRollback(async (client) => {
      const co = await aBuyer(client);
      const { companyId, userId } = co;
      const s = await co.party("Marine Supplies");
      const { rows: item } = await client.query("INSERT INTO stock_items (company_id, name, unit, created_by) VALUES ($1,'Rope','roll',$2) RETURNING id", [companyId, userId]);
      const bill = await co.bill(s, 6000000);
      await billSplit.save(client, {
        companyId, userId, billId: bill.id,
        lines: [
          { kind: "asset", description: "Yamaha 40hp outboard", amount: "48000.00", category: "vehicles", lifeYears: 4 },
          { kind: "stock", description: "Rope", amount: "2000.00", itemId: item[0].id, quantity: "4" },
          { kind: "cost", description: "Fuel", amount: "3000.00", accountId: co.code["5400"] },
        ],
      });
      const done = await co.post(bill.id);
      const { rows } = await client.query(
        `SELECT a.code, SUM(l.debit_laari - l.credit_laari) AS b FROM journal_lines l JOIN accounts a ON a.id = l.account_id
          WHERE l.entry_id = $1 GROUP BY a.code ORDER BY a.code`,
        [done.entry.id]
      );
      expect(rows.map((r) => [r.code, String(r.b)])).toEqual([
        ["1350", "200000"], ["1520", "4800000"], ["2100", "-6000000"], ["5100", "700000"], ["5400", "300000"],
      ]);
      const { rows: assets } = await client.query("SELECT name, cost_laari, life_months, entry_id FROM fixed_assets WHERE company_id = $1", [companyId]);
      expect(assets).toEqual([{ name: "Yamaha 40hp outboard", cost_laari: "4800000", life_months: 48, entry_id: done.entry.id }]);

      const r = await reverseEntry(client, { companyId, userId, entryId: done.entry.id, reason: "wrong bill" });
      await billSplit.undoAssets(client, { companyId, entryId: done.entry.id });
      expect((await client.query("SELECT count(*)::int AS n FROM fixed_assets WHERE company_id = $1", [companyId])).rows[0].n).toBe(0);
      expect(r.id).toBeTruthy();
    }));

  it("will not take an asset off the register once it has been depreciated", () =>
    inRollback(async (client) => {
      const co = await aBuyer(client);
      const { companyId, userId } = co;
      const s = await co.party("Computer Shop");
      const bill = await co.bill(s, 3600000);
      await billSplit.save(client, { companyId, userId, billId: bill.id, lines: [{ kind: "asset", description: "Laptops", amount: "36000", category: "furniture" }] });
      const done = await co.post(bill.id);
      await depreciate(client, { companyId, userId, through: "2026-07-31" });
      await expect(billSplit.undoAssets(client, { companyId, entryId: done.entry.id })).rejects.toThrow(/depreciated or disposed of since/);
    }));

  it("refuses a cost on an account that is not an expense, or parts that come to more than the bill", () =>
    inRollback(async (client) => {
      const co = await aBuyer(client);
      const { companyId, userId } = co;
      const bill = await co.bill(await co.party("Someone"), 10000);
      await expect(billSplit.save(client, { companyId, userId, billId: bill.id, lines: [{ kind: "cost", amount: "50", accountId: co.accounts.bank }] })).rejects.toThrow(/expense accounts/);
      await expect(billSplit.save(client, { companyId, userId, billId: bill.id, lines: [{ kind: "cost", amount: "150", accountId: co.code["5400"] }] })).rejects.toThrow(/more than the bill/);
    }));
});

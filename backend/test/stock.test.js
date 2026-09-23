/**
 * Stock at weighted average cost. The properties: a sale takes its share of
 * the value and the last unit takes exactly what is left; nothing goes below
 * zero; a bill's stock is split from the rest of it, in our own currency; a
 * count's difference is seen on its own account; and at every step the value
 * of what is on hand equals the Stock account.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity, reverseEntry } from "../src/ledger/post";
import { verifyChain } from "../src/ledger/verify";
import { postBill } from "../src/ledger/bills";
import { raise, post, creditNote } from "../src/ledger/sales";
import * as stock from "../src/ledger/stock";

afterAll(closePool);

async function aShop(client) {
  const shop = await aCompanyWith(client);
  const { companyId, userId } = shop;
  await client.query(
    `INSERT INTO accounts (company_id, code, name, type) VALUES
       ($1,'1300','Money owed to us','asset'), ($1,'2200','GST we owe','liability'), ($1,'4100','Sales','income')`,
    [companyId]
  );
  await assumeIdentity(client, { companyId, userId });
  const party = async (name, kind) =>
    (await client.query("INSERT INTO counterparties (company_id, name, kind) VALUES ($1,$2,$3) RETURNING id", [companyId, name, `{${kind}}`])).rows[0].id;
  shop.supplier = await party("Cement Supplier", "supplier");
  shop.customer = await party("A Customer", "customer");
  shop.item = async (name, unit = "bag") =>
    (await client.query("INSERT INTO stock_items (company_id, name, unit, created_by) VALUES ($1,$2,$3,$4) RETURNING id", [companyId, name, unit, userId])).rows[0].id;
  let billNo = 0;
  shop.buy = async (lines, { net, fx } = {}) => {
    billNo += 1;
    const n = BigInt(net ?? lines.reduce((s, l) => s + Math.round(Number(l.amount) * 100), 0));
    const { rows } = await client.query(
      `INSERT INTO bills (company_id, counterparty_id, bill_no, issue_date, net_laari, tax_laari, gross_laari, gst_treatment, status,
                          currency, fx_rate, fc_net, fc_tax, fc_gross)
       VALUES ($1,$2,$3,'2026-09-10',$4,0,$4,'none_unregistered','draft',$5,$6,$7,$8,$7)
       RETURNING id`,
      [companyId, shop.supplier, `B-${billNo}`, fx ? fx.base : n.toString(), fx ? "USD" : "MVR", fx ? fx.rate : null, fx ? n.toString() : null, fx ? "0" : null]
    );
    await stock.setBillStock(client, { companyId, userId, billId: rows[0].id, lines });
    const done = await postBill(client, {
      companyId, userId, billId: rows[0].id,
      accounts: { expense: shop.accounts.expense, payable: shop.accounts.payable, taxReclaimable: shop.accounts.taxReclaimable },
    });
    return { billId: rows[0].id, entryId: done.entry.id };
  };
  shop.sell = async (lines) => {
    const { invoice } = await raise(client, { companyId, userId, counterpartyId: shop.customer, gstTreatment: "none_unregistered", issueDate: "2026-09-20", lines });
    return post(client, { companyId, userId, invoiceId: invoice.id });
  };
  shop.held = async (itemId) => (await stock.list(client, { companyId })).find((i) => i.id === itemId);
  // The value of everything on hand, and the Stock account's balance: always the same.
  shop.tied = async () => {
    const items = await stock.list(client, { companyId });
    const value = items.reduce((s, i) => s + BigInt(i.value.replace(/,/g, "").replace(".", "")), 0n);
    const { rows } = await client.query(
      `SELECT COALESCE(SUM(l.debit_laari - l.credit_laari), 0) AS b FROM journal_lines l JOIN accounts a ON a.id = l.account_id
        WHERE a.company_id = $1 AND a.code = '1350'`,
      [companyId]
    );
    expect(BigInt(rows[0].b)).toBe(value);
    return value;
  };
  return shop;
}

describe("weighted average cost", () => {
  it("costs each sale at the average, and the last one takes exactly what is left", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const cement = await shop.item("Cement");
      await shop.buy([{ itemId: cement, quantity: "10", amount: "1000.00" }]);
      await shop.buy([{ itemId: cement, quantity: "10", amount: "1300.00" }]);
      expect((await shop.held(cement)).averageCost).toBe("115.00");
      expect(await shop.tied()).toBe(230000n);

      await shop.sell([{ itemId: cement, quantity: 5, unitPrice: "200.00" }]);
      let held = await shop.held(cement);
      expect(held.onHand).toBe("15");
      expect(held.value).toBe("1,725.00");
      expect(held.costOfSales).toBe("575.00");
      expect(held.margin).toBe("425.00");
      await shop.tied();

      // Thirds do not divide evenly; two lines of the same item on one invoice.
      await shop.sell([
        { itemId: cement, quantity: 7, unitPrice: "200.00" },
        { itemId: cement, quantity: 8, unitPrice: "210.00" },
      ]);
      held = await shop.held(cement);
      expect(held.onHand).toBe("0");
      expect(held.value).toBe("0.00");
      expect(held.costOfSales).toBe("2,300.00");
      expect(await shop.tied()).toBe(0n);
      expect((await verifyChain(client, { companyId: shop.companyId, userId: shop.userId })).ok).toBe(true);
    }));

  it("refuses to sell more than is on hand", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const cement = await shop.item("Cement");
      await shop.buy([{ itemId: cement, quantity: "2", amount: "200.00" }]);
      await expect(shop.sell([{ itemId: cement, quantity: 3, unitPrice: "150.00" }])).rejects.toThrow(/Only 2 bag of Cement are on hand/);
    }));
});

describe("bills that bring stock in", () => {
  it("puts the stock on the Stock account and leaves the rest of the bill a cost", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const cement = await shop.item("Cement");
      const { entryId } = await shop.buy([{ itemId: cement, quantity: "10", amount: "1000.00" }], { net: 115000 });
      const { rows } = await client.query(
        "SELECT a.code, l.debit_laari AS d FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE l.entry_id = $1 AND l.debit_laari > 0 ORDER BY a.code",
        [entryId]
      );
      expect(rows.map((r) => [r.code, String(r.d)])).toEqual([["1350", "100000"], ["5100", "15000"]]);
      await shop.tied();
    }));

  it("values stock bought in dollars in rufiyaa, at the bill's rate", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const tiles = await shop.item("Tiles", "box");
      // USD 100.00 at 15.42 = MVR 1,542.00, all of it tiles.
      await shop.buy([{ itemId: tiles, quantity: "3", amount: "100.00" }], { net: 10000, fx: { base: "154200", rate: "15.42" } });
      expect((await shop.held(tiles)).value).toBe("1,542.00");
      expect((await shop.held(tiles)).averageCost).toBe("514.00");
      await shop.tied();
    }));

  it("refuses items that come to more than the bill", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const cement = await shop.item("Cement");
      await expect(shop.buy([{ itemId: cement, quantity: "1", amount: "500.00" }], { net: 40000 })).rejects.toThrow(/more than the bill/);
    }));

  it("takes a reversed bill's stock back out, unless some has been sold", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const { companyId, userId } = shop;
      const cement = await shop.item("Cement");
      const undo = async ({ billId, entryId }) => {
        const r = await reverseEntry(client, { companyId, userId, entryId, reason: "wrong bill" });
        await stock.undoBillStock(client, { companyId, userId, billId, entryId: r.id, on: "2026-09-21" });
      };
      const first = await shop.buy([{ itemId: cement, quantity: "4", amount: "400.00" }]);
      await undo(first);
      expect((await shop.held(cement)).onHand).toBe("0");
      await shop.tied();

      const second = await shop.buy([{ itemId: cement, quantity: "4", amount: "400.00" }]);
      await shop.sell([{ itemId: cement, quantity: 1, unitPrice: "150.00" }]);
      await expect(undo(second)).rejects.toThrow(/has been sold since/);
    }));
});

describe("counts and stock already on hand", () => {
  it("puts opening stock against opening balances, and a count's difference on its own account", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const { companyId, userId } = shop;
      const nails = await shop.item("Nails", "kg");
      await stock.opening(client, { companyId, userId, itemId: nails, quantity: "12.5", unitCost: "20.00", on: "2026-09-01" });
      expect((await shop.held(nails)).value).toBe("250.00");

      const short = await stock.count(client, { companyId, userId, itemId: nails, counted: "10", on: "2026-09-30" });
      expect(short.difference).toBe("-2.5");
      expect(short.value).toBe(-5000n);
      expect((await shop.held(nails)).value).toBe("200.00");

      await expect(stock.count(client, { companyId, userId, itemId: nails, counted: "10", on: "2026-09-30" })).rejects.toThrow(/Nothing to change/);
      await stock.count(client, { companyId, userId, itemId: nails, counted: "0", on: "2026-09-30" });
      await expect(stock.count(client, { companyId, userId, itemId: nails, counted: "3", on: "2026-10-01" })).rejects.toThrow(/say what one kg cost/);
      await stock.count(client, { companyId, userId, itemId: nails, counted: "3", unitCost: "21.00", on: "2026-10-01" });
      expect((await shop.held(nails)).value).toBe("63.00");

      const { rows } = await client.query(
        `SELECT a.code, SUM(l.debit_laari - l.credit_laari) AS b FROM journal_lines l JOIN accounts a ON a.id = l.account_id
          WHERE a.company_id = $1 AND a.code IN ('3900','5870') GROUP BY a.code ORDER BY a.code`,
        [companyId]
      );
      expect(rows.map((r) => [r.code, String(r.b)])).toEqual([["3900", "-25000"], ["5870", "18700"]]);
      await shop.tied();
    }));

  it("reads quantities exactly, to four places", () => {
    expect(stock.unitsText(stock.toUnits("0.0001"))).toBe("0.0001");
    expect(stock.unitsText(stock.fromDb("-2.5000"))).toBe("-2.5");
    expect(() => stock.toUnits("1.23456")).toThrow(/four decimal places/);
    expect(() => stock.toUnits("0")).toThrow(/above zero/);
  });
});

describe("reorder levels", () => {
  it("flags an item at or below its level as low, and not one above it or without one", () =>
    inRollback(async (client) => {
      const { companyId, userId } = await aCompanyWith(client);
      await assumeIdentity(client, { companyId, userId });
      const add = async (name, reorder) =>
        (await client.query("INSERT INTO stock_items (company_id, name, unit, created_by, reorder_at) VALUES ($1,$2,'bag',$3,$4) RETURNING id", [companyId, name, userId, reorder])).rows[0].id;
      await add("Cement", "10");
      await add("Sand", null);
      const list = await stock.list(client, { companyId });
      const by = Object.fromEntries(list.map((i) => [i.name, i]));
      expect(by.Cement).toMatchObject({ low: true, reorderAt: "10" });
      expect(by.Sand.low).toBe(false);
    }));
});

describe("goods coming back on a credit note", () => {
  it("go back in at what they left at, come off the item's sales, and never more than went out", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const { companyId, userId } = shop;
      const cement = await shop.item("Cement");
      const sand = await shop.item("Sand");
      await shop.buy([{ itemId: cement, quantity: "10", amount: "1000.00" }]);
      const { invoice } = await raise(client, { companyId, userId, counterpartyId: shop.customer, gstTreatment: "none_unregistered", issueDate: "2026-09-20", lines: [{ itemId: cement, quantity: 4, unitPrice: "200.00" }] });
      await post(client, { companyId, userId, invoiceId: invoice.id });
      // The average moves after the sale; the returned bags come back at 100, not the new average.
      await shop.buy([{ itemId: cement, quantity: "10", amount: "1300.00" }]);

      await creditNote(client, { companyId, userId, invoiceId: invoice.id, reason: "Three bags came back", amount: "600.00", issueDate: "2026-09-22", returned: [{ itemId: cement, quantity: "3" }] });
      const held = await shop.held(cement);
      expect(held.onHand).toBe("19");
      expect(held.value).toBe("2,200.00");
      expect([held.sold, held.sales, held.costOfSales, held.margin]).toEqual(["1", "200.00", "100.00", "100.00"]);
      await shop.tied();
      const back = (await stock.returnable(client, { companyId, invoiceId: invoice.id }))[0];
      expect(stock.unitsText(back.units)).toBe("1");

      await expect(creditNote(client, { companyId, userId, invoiceId: invoice.id, reason: "More", amount: "100.00", returned: [{ itemId: cement, quantity: "2" }] })).rejects.toThrow(/sold 1 bag of Cement still out/);
      await expect(creditNote(client, { companyId, userId, invoiceId: invoice.id, reason: "Sand", amount: "100.00", returned: [{ itemId: sand, quantity: "1" }] })).rejects.toThrow(/sold none of that item/);
      expect((await verifyChain(client, { companyId, userId })).ok).toBe(true);
    }));
});

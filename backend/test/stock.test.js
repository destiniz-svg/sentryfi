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
import * as counts from "../src/ledger/counts";
import * as orders from "../src/ledger/orders";

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
  shop.buy = async (lines, { net, fx, on = "2026-09-10" } = {}) => {
    billNo += 1;
    const n = BigInt(net ?? lines.reduce((s, l) => s + Math.round(Number(l.amount) * 100), 0));
    const { rows } = await client.query(
      `INSERT INTO bills (company_id, counterparty_id, bill_no, issue_date, net_laari, tax_laari, gross_laari, gst_treatment, status,
                          currency, fx_rate, fc_net, fc_tax, fc_gross)
       VALUES ($1,$2,$3,$9,$4,0,$4,'none_unregistered','draft',$5,$6,$7,$8,$7)
       RETURNING id`,
      [companyId, shop.supplier, `B-${billNo}`, fx ? fx.base : n.toString(), fx ? "USD" : "MVR", fx ? fx.rate : null, fx ? n.toString() : null, fx ? "0" : null, on]
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
  it("offers the company's units, most used first", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      await shop.item("Sand", "m³");
      await shop.item("Cement");
      await shop.item("Blocks");
      expect(await stock.units(client, { companyId: shop.companyId })).toEqual(["bag", "m³"]);
    }));

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
      await shop.buy([{ itemId: cement, quantity: "10", amount: "1300.00" }], { on: "2026-09-21" });

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

describe("a bill dated before sales already costed", () => {
  it("re-costs those sales once, today, as if it had been posted on its own date", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const cement = await shop.item("Cement");
      await shop.buy([{ itemId: cement, quantity: "10", amount: "1000.00" }]); // dated 10 Sep
      await shop.sell([{ itemId: cement, quantity: 5, unitPrice: "200.00" }]); // 20 Sep, costed at 100
      expect((await shop.held(cement)).costOfSales).toBe("500.00");
      // Also dated 10 Sep, posted later: the sale should have cost the average of 115.
      await shop.buy([{ itemId: cement, quantity: "10", amount: "1300.00" }]);
      const held = await shop.held(cement);
      expect([held.onHand, held.value, held.costOfSales]).toEqual(["15", "1,725.00", "575.00"]);
      await shop.tied();
      expect(await stock.recost(client, { companyId: shop.companyId, userId: shop.userId, itemId: cement, since: "2026-09-10", why: "again" })).toBeNull();
      expect((await verifyChain(client, { companyId: shop.companyId, userId: shop.userId })).ok).toBe(true);
    }));
});

describe("stock kept in more than one place", () => {
  it("moves between places without touching its value, sells from the main store first, and counts at a place", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const { companyId, userId } = shop;
      const cement = await shop.item("Cement");
      await shop.buy([{ itemId: cement, quantity: "10", amount: "1000.00" }]); // into the main store, 100.00 each
      const yard = await stock.addPlace(client, { companyId, userId, name: "The yard" });
      await expect(stock.addPlace(client, { companyId, userId, name: "the Yard" })).rejects.toThrow(/already a place/);

      const valueBefore = await shop.tied();
      await stock.transfer(client, { companyId, userId, itemId: cement, fromPlaceId: null, toPlaceId: yard.id, quantity: "6", on: "2026-09-12", arrived: true });
      expect(await shop.tied()).toBe(valueBefore); // where it is changed, not what it is worth
      await expect(stock.transfer(client, { companyId, userId, itemId: cement, fromPlaceId: null, toPlaceId: yard.id, quantity: "5", on: "2026-09-12" })).rejects.toThrow(/Only 4 bag/);

      // Selling 8 takes the 4 in the main store, then 4 from the yard, at the one average cost.
      await shop.sell([{ itemId: cement, quantity: 8, unitPrice: "200.00" }]);
      const held = await shop.held(cement);
      expect(held.onHand).toBe("2");
      expect(held.places).toEqual([{ id: yard.id, name: "The yard", onHand: "2" }]);
      expect(await shop.tied()).toBe(20000n);

      // Counted 1 at the yard: one short, at average cost.
      const c = await stock.count(client, { companyId, userId, itemId: cement, counted: "1", on: "2026-09-25", placeId: yard.id });
      expect(c.difference).toBe("-1");
      expect((await shop.held(cement)).value).toBe("100.00");

      const h = await stock.history(client, { companyId, itemId: cement });
      expect(h.find((x) => x.kind === "moved").note).toBe("From Main store to The yard");
    }));

  it("names a kind, a person in charge and a site's project, and a bill receives into its place and gives back from it", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const { companyId, userId } = shop;
      const project = (await client.query("INSERT INTO projects (company_id, name) VALUES ($1,'Hulhumale tower') RETURNING id", [companyId])).rows[0].id;
      await client.query("INSERT INTO memberships (company_id, user_id, role) VALUES ($1, $2, 'administrator')", [companyId, userId]);
      const stranger = crypto.randomUUID(); // no one in this company
      await expect(stock.addPlace(client, { companyId, userId, name: "Van", kind: "vehicle", projectId: project })).rejects.toThrow(/Only a site/);
      await expect(stock.addPlace(client, { companyId, userId, name: "Van", kind: "vehicle", inChargeId: stranger })).rejects.toThrow(/someone in this company/);
      const site = await stock.addPlace(client, { companyId, userId, name: "Tower site", kind: "site", inChargeId: userId, projectId: project });
      const listed = (await stock.places(client, { companyId })).find((p) => p.id === site.id);
      expect(listed).toMatchObject({ kind: "site", inChargeId: userId, projectId: project, project: "Hulhumale tower" });
      await stock.updatePlace(client, { companyId, placeId: site.id, name: "Tower site store", kind: "site", inChargeId: null, projectId: project });
      expect((await stock.places(client, { companyId })).find((p) => p.id === site.id)).toMatchObject({ name: "Tower site store", inChargeId: null });

      // A bill for the site puts the cement there, and reversing it takes it back from there.
      const cement = await shop.item("Cement");
      const { rows } = await client.query(
        `INSERT INTO bills (company_id, counterparty_id, bill_no, issue_date, net_laari, tax_laari, gross_laari, gst_treatment, status, currency, place_id)
         VALUES ($1,$2,'SITE-1','2026-09-10',50000,0,50000,'none_unregistered','draft','MVR',$3) RETURNING id`,
        [companyId, shop.supplier, site.id]
      );
      await stock.setBillStock(client, { companyId, userId, billId: rows[0].id, lines: [{ itemId: cement, quantity: "5", amount: "500.00" }] });
      const done = await postBill(client, { companyId, userId, billId: rows[0].id, accounts: { expense: shop.accounts.expense, payable: shop.accounts.payable, taxReclaimable: shop.accounts.taxReclaimable } });
      const at = await stock.atPlaces(client, { companyId, itemId: cement });
      expect(at.get(site.id)).toBe(stock.toUnits("5"));
      const r = await reverseEntry(client, { companyId, userId, entryId: done.entry.id, reason: "wrong bill" });
      await stock.undoBillStock(client, { companyId, userId, billId: rows[0].id, entryId: r.id, on: "2026-09-21" });
      expect((await stock.atPlaces(client, { companyId, itemId: cement })).get(site.id) || 0n).toBe(0n);
      await shop.tied();
    }));
});

describe("sending stock and its arrival", () => {
  it("is on the way until it arrives, cannot be sold meanwhile, and a shortfall is written off at the place with its reason", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const { companyId, userId } = shop;
      const cement = await shop.item("Cement");
      await shop.buy([{ itemId: cement, quantity: "10", amount: "1000.00" }]); // 100.00 each, main store
      const site = await stock.addPlace(client, { companyId, userId, name: "Tower site", kind: "site" });

      const sent = await stock.transfer(client, { companyId, userId, itemId: cement, fromPlaceId: null, toPlaceId: site.id, quantity: "8", on: "2026-09-12", note: "On the dhoni" });
      expect(sent.onTheWay).toBe(true);
      let at = await stock.atPlaces(client, { companyId, itemId: cement });
      expect(at.get("main")).toBe(stock.toUnits("2"));
      expect(at.get(site.id)).toBeUndefined();
      expect((await shop.held(cement)).inTransit).toBe("8");
      const [way] = await stock.onTheWay(client, { companyId });
      expect(way).toMatchObject({ id: sent.id, item: "Cement", quantity: "8", from: "Main store", to: "Tower site", sentOn: "2026-09-12", note: "On the dhoni" });
      // What is on the way cannot be sold, and nothing can be sent onward from where it has not reached.
      await expect(shop.sell([{ itemId: cement, quantity: 3, unitPrice: "200.00" }])).rejects.toThrow(/still on the way/);
      await expect(stock.transfer(client, { companyId, userId, itemId: cement, fromPlaceId: site.id, toPlaceId: null, quantity: "1", on: "2026-09-13" })).rejects.toThrow(/Only 0 bag/);

      // Seven came: the one short needs a reason, more than was sent is refused, and it cannot arrive before it left.
      const arrive = (over) => stock.arrive(client, { companyId, userId, transferId: sent.id, received: "7", on: "2026-09-14", ...over });
      await expect(arrive({})).rejects.toThrow(/Say why 1 bag is short/);
      await expect(arrive({ received: "9" })).rejects.toThrow(/8 bag were sent/);
      await expect(arrive({ reason: "Split bag", on: "2026-09-11" })).rejects.toThrow(/cannot arrive before/);
      const valueBefore = await shop.tied();
      const got = await arrive({ reason: "One bag split on the jetty" });
      expect(got).toEqual({ received: "7", short: "1", to: "Tower site" });
      await expect(arrive({ reason: "again" })).rejects.toThrow(/already arrived/);

      at = await stock.atPlaces(client, { companyId, itemId: cement });
      expect(at.get(site.id)).toBe(stock.toUnits("7"));
      expect(at.get("transit") || 0n).toBe(0n);
      expect(await stock.onTheWay(client, { companyId })).toEqual([]);
      expect(await shop.tied()).toBe(valueBefore - 10000n); // the lost bag, at its average cost
      const { rows } = await client.query(
        "SELECT SUM(l.debit_laari) AS d FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE a.company_id = $1 AND a.code = '5870'",
        [companyId]
      );
      expect(BigInt(rows[0].d)).toBe(10000n);
      const h = await stock.history(client, { companyId, itemId: cement });
      expect(h.find((x) => x.kind === "moved").note).toBe("From Main store to Tower site, 7 arrived 2026-09-14: On the dhoni");
      expect(h.find((x) => x.kind === "counted").note).toBe("Short on arrival: One bag split on the jetty");
      expect((await verifyChain(client, { companyId, userId })).ok).toBe(true);
    }));

  it("all arriving writes nothing into the books", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const { companyId, userId } = shop;
      const cement = await shop.item("Cement");
      await shop.buy([{ itemId: cement, quantity: "4", amount: "400.00" }]);
      const van = await stock.addPlace(client, { companyId, userId, name: "Van", kind: "vehicle" });
      const sent = await stock.transfer(client, { companyId, userId, itemId: cement, fromPlaceId: null, toPlaceId: van.id, quantity: "4", on: "2026-09-12" });
      const before = (await client.query("SELECT count(*) AS n FROM journal_entries WHERE company_id = $1", [companyId])).rows[0].n;
      expect(await stock.arrive(client, { companyId, userId, transferId: sent.id, received: "4", on: "2026-09-12" })).toMatchObject({ short: "0" });
      expect((await client.query("SELECT count(*) AS n FROM journal_entries WHERE company_id = $1", [companyId])).rows[0].n).toBe(before);
      expect((await stock.atPlaces(client, { companyId, itemId: cement })).get(van.id)).toBe(stock.toUnits("4"));
    }));
});

describe("the owner's snapshot", () => {
  it("shows what is where and what it is worth as at any date, agreeing with the books, with what came in, moved and looks wrong", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const { companyId, userId } = shop;
      const cement = await shop.item("Cement");
      const sand = await shop.item("Sand");
      await shop.buy([{ itemId: cement, quantity: "10", amount: "1000.00" }, { itemId: sand, quantity: "5", amount: "250.00" }]); // 2026-09-10
      const project = (await client.query("INSERT INTO projects (company_id, name) VALUES ($1,'Hulhumale tower') RETURNING id", [companyId])).rows[0].id;
      const site = await stock.addPlace(client, { companyId, userId, name: "Tower site", kind: "site", projectId: project });
      const c = await stock.transfer(client, { companyId, userId, itemId: cement, fromPlaceId: null, toPlaceId: site.id, quantity: "4", on: "2026-09-12" });
      await stock.transfer(client, { companyId, userId, itemId: sand, fromPlaceId: null, toPlaceId: site.id, quantity: "2", on: "2026-09-12" }); // never arrives
      await stock.arrive(client, { companyId, userId, transferId: c.id, received: "3", on: "2026-09-14", reason: "One bag split" });
      await shop.sell([{ itemId: cement, quantity: 2, unitPrice: "200.00" }]); // 2026-09-20, from the main store
      await stock.issue(client, { companyId, userId, itemId: cement, placeId: site.id, quantity: "1", on: "2026-09-21", projectId: project });

      const place = (s, id) => s.places.find((p) => p.id === id);
      const early = await stock.snapshot(client, { companyId, on: "2026-09-13", from: "2026-09-07" });
      expect(early).toMatchObject({ total: "1,250.00", books: "1,250.00", agrees: true });
      expect(place(early, "main")).toMatchObject({ value: "750.00" });
      expect(place(early, "transit").items).toMatchObject([
        { itemId: cement, name: "Cement", unit: "bag", quantity: "4", value: "400.00" },
        { itemId: sand, name: "Sand", unit: "bag", quantity: "2", value: "100.00" },
      ]);
      expect(place(early, site.id).items).toEqual([]);
      expect(early.cameIn.map((r) => [r.item, r.quantity, r.from, r.placeName]).sort()).toEqual([
        ["Cement", "10", "Cement Supplier", "Main store"],
        ["Sand", "5", "Cement Supplier", "Main store"],
      ]);
      expect(early.moved.sent.map((t) => [t.item, t.arrived])).toEqual(expect.arrayContaining([["Cement", false], ["Sand", false]]));
      expect(early.wrong).toEqual([]);

      const late = await stock.snapshot(client, { companyId, on: "2026-09-25", from: "2026-09-19" });
      expect(late).toMatchObject({ total: "850.00", books: "850.00", agrees: true });
      expect(place(late, "main").items.map((i) => [i.name, i.quantity, i.value])).toEqual([["Cement", "4", "400.00"], ["Sand", "3", "150.00"]]);
      expect(place(late, site.id).items).toMatchObject([{ itemId: cement, name: "Cement", unit: "bag", quantity: "2", value: "200.00" }]);
      expect(late.moved.sold).toMatchObject({ quantity: "2", cost: "200.00", sales: "400.00" });
      expect(late.moved.used).toMatchObject({ quantity: "1", cost: "100.00" });
      expect(late.cameIn).toEqual([]);
      expect(late.wrong.map((w) => w.kind)).toEqual(["late"]); // the sand, on the way since the 12th
      expect(late.wrong[0].detail).toMatch(/2 bag of Sand sent to Tower site on 12 Sept? 2026 has not arrived/);

      const shortWeek = await stock.snapshot(client, { companyId, on: "2026-09-14", from: "2026-09-14" });
      expect(shortWeek.wrong.find((w) => w.kind === "short").detail).toMatch(/1 bag of Cement short at Tower site on 14 Sept? 2026, worth 100.00\. Short on arrival: One bag split$/);
      const idle = await stock.snapshot(client, { companyId, on: "2027-01-10", from: "2027-01-04" });
      expect(idle.wrong.filter((w) => w.kind === "still").length).toBe(2);

      // Every figure opens onto its moves.
      const atSite = await stock.moves(client, { companyId, place: site.id, to: "2026-09-25" });
      expect(atSite.map((m) => m.kind).sort()).toEqual(["counted", "issued", "moved", "moved"]);
      const onWay = await stock.moves(client, { companyId, place: "transit", to: "2026-09-25" });
      expect(onWay).toHaveLength(1);
      expect(onWay[0].note).toBe("From Main store to Tower site, on the way");
      expect((await stock.moves(client, { companyId, kinds: ["sold"] })).map((m) => [m.item, m.quantity, m.place])).toEqual([["Cement", "-2", "Main store"]]);
    }));
});

describe("counting sessions, blind", () => {
  // Someone in the company: a user and a membership.
  const person = async (client, companyId, name, role = "administrator") => {
    await client.query("RESET ROLE"); // setting up, as the owner of the database; the ledger calls take the app role again
    const { rows } = await client.query("INSERT INTO users (name, email, password_hash) VALUES ($1, $2, 'x') RETURNING id", [name, `${name.toLowerCase()}+${Math.random().toString(36).slice(2)}@sentryfi.invalid`]);
    await client.query("INSERT INTO memberships (company_id, user_id, role) VALUES ($1, $2, $3)", [companyId, rows[0].id, role]);
    return rows[0].id;
  };
  const counted = async (client, companyId, userId, id, lines) => {
    for (const [itemId, n, reason] of lines) await counts.saveLine(client, { companyId, userId, countId: id, itemId, counted: n, reason });
  };

  it("keeps the books out of sight until submitted, and a difference within tolerance posts at once", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const { companyId, userId } = shop;
      await client.query("INSERT INTO memberships (company_id, user_id, role) VALUES ($1, $2, 'administrator')", [companyId, userId]);
      const cement = await shop.item("Cement");
      const sand = await shop.item("Sand");
      await shop.buy([{ itemId: cement, quantity: "10", amount: "1000.00" }, { itemId: sand, quantity: "5", amount: "250.00" }]);

      const c = await counts.create(client, { companyId, userId, kind: "full", placeId: null, counterId: userId });
      expect(c.items).toBe(2);
      await expect(counts.create(client, { companyId, userId, kind: "full", placeId: null, counterId: userId })).rejects.toThrow(/already has a count open/);
      await counted(client, companyId, userId, c.id, [[cement, "9", "Torn bag"], [sand, "5"]]);
      const blind = await counts.view(client, { companyId, userId, countId: c.id, reads: true });
      expect(blind.blind).toBe(true);
      expect(blind.lines.every((l) => l.book === undefined && l.difference === undefined)).toBe(true);

      expect(await counts.submit(client, { companyId, userId, countId: c.id })).toEqual({ status: "posted", over: 0 });
      const seen = await counts.view(client, { companyId, userId, countId: c.id, reads: true });
      expect(seen.lines.find((l) => l.itemId === cement)).toMatchObject({ book: "10", counted: "9", difference: "-1", value: "-100.00", over: false });
      expect(seen.lines.find((l) => l.itemId === sand)).toMatchObject({ difference: "0", entryNo: null });
      expect((await shop.held(cement)).onHand).toBe("9");
      await shop.tied();
      expect((await counts.accuracy(client, { companyId })).get("main")).toEqual({ lines: 2, within: 2, percent: 100 });
    }));

  it("the tolerance is the company's to set: at MVR 1,000 a 600.00 shortfall posts at once", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const { companyId, userId } = shop;
      await client.query("INSERT INTO memberships (company_id, user_id, role) VALUES ($1, $2, 'administrator')", [companyId, userId]);
      const cement = await shop.item("Cement");
      await shop.buy([{ itemId: cement, quantity: "10", amount: "1000.00" }]);
      await expect(counts.setTolerance(client, { companyId, userId, amount: "-5" })).rejects.toThrow();
      expect(await counts.setTolerance(client, { companyId, userId, amount: "1000" })).toEqual({ tolerance: "1,000.00" });
      const c = await counts.create(client, { companyId, userId, kind: "full", placeId: null, counterId: userId });
      await counted(client, companyId, userId, c.id, [[cement, "4"]]);
      expect(await counts.submit(client, { companyId, userId, countId: c.id })).toEqual({ status: "posted", over: 0 });
    }));

  it("posts on the day it was counted, not the day it was approved", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const { companyId, userId } = shop;
      await client.query("INSERT INTO memberships (company_id, user_id, role) VALUES ($1, $2, 'administrator')", [companyId, userId]);
      const cement = await shop.item("Cement");
      await shop.buy([{ itemId: cement, quantity: "10", amount: "1000.00" }]);
      const c = await counts.create(client, { companyId, userId, kind: "full", placeId: null, counterId: userId });
      await counted(client, companyId, userId, c.id, [[cement, "9"]]);
      await client.query("UPDATE stock_count_lines SET counted_at = '2026-09-20 10:00+05' WHERE count_id = $1", [c.id]); // counted six days ago
      await counts.submit(client, { companyId, userId, countId: c.id });
      const { rows } = await client.query("SELECT moved_on::text AS d FROM stock_moves WHERE company_id = $1 AND kind = 'counted'", [companyId]);
      expect(rows).toEqual([{ d: "2026-09-20" }]);
    }));

  it("stock that cost nothing is counted, short and used by quantity alone, with no entry", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const { companyId, userId } = shop;
      const samples = await shop.item("Tile samples", "box");
      const project = (await client.query("INSERT INTO projects (company_id, name) VALUES ($1,'Show flat') RETURNING id", [companyId])).rows[0].id;
      const site = await stock.addPlace(client, { companyId, userId, name: "Show flat", kind: "site" });
      const entries = async () => Number((await client.query("SELECT count(*) AS n FROM journal_entries WHERE company_id = $1", [companyId])).rows[0].n);
      const before = await entries();
      const found = await stock.count(client, { companyId, userId, itemId: samples, counted: "5", on: "2026-09-12", unitCost: "0" });
      expect(found.entry).toBeNull();
      const sent = await stock.transfer(client, { companyId, userId, itemId: samples, fromPlaceId: null, toPlaceId: site.id, quantity: "3", on: "2026-09-13" });
      expect(await stock.arrive(client, { companyId, userId, transferId: sent.id, received: "2", on: "2026-09-14", reason: "One box broken" })).toMatchObject({ short: "1" });
      expect((await stock.issue(client, { companyId, userId, itemId: samples, placeId: site.id, quantity: "1", on: "2026-09-15", projectId: project })).entry).toBeNull();
      expect(await entries()).toBe(before);
      expect((await shop.held(samples)).onHand).toBe("3");
      const h = await stock.history(client, { companyId, itemId: samples });
      expect(h.filter((m) => m.kind !== "moved").every((m) => m.entryNo === null && m.value === "0.00")).toBe(true);
      await shop.tied();
    }));

  it("a sale after an item is counted makes no false difference", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const { companyId, userId } = shop;
      await client.query("INSERT INTO memberships (company_id, user_id, role) VALUES ($1, $2, 'administrator')", [companyId, userId]);
      const cement = await shop.item("Cement");
      await shop.buy([{ itemId: cement, quantity: "10", amount: "1000.00" }]);
      const c = await counts.create(client, { companyId, userId, kind: "full", placeId: null, counterId: userId });
      await counted(client, companyId, userId, c.id, [[cement, "10"]]);
      await shop.sell([{ itemId: cement, quantity: 2, unitPrice: "200.00" }]); // while the count is open
      await counts.submit(client, { companyId, userId, countId: c.id });
      expect((await shop.held(cement)).onHand).toBe("8");
    }));

  it("a difference beyond the tolerance waits for someone other than the counter, who may send it back", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const { companyId, userId } = shop;
      await client.query("INSERT INTO memberships (company_id, user_id, role) VALUES ($1, $2, 'administrator')", [companyId, userId]);
      const counter = await person(client, companyId, "Hassan", "manager");
      const cement = await shop.item("Cement");
      await shop.buy([{ itemId: cement, quantity: "10", amount: "1000.00" }]);
      const c = await counts.create(client, { companyId, userId, kind: "full", placeId: null, counterId: counter });
      await expect(counts.saveLine(client, { companyId, userId, countId: c.id, itemId: cement, counted: "4" })).rejects.toThrow(/Hassan is counting this one/);
      await counted(client, companyId, counter, c.id, [[cement, "4"]]); // 6 short, 600.00, over 500.00
      expect(await counts.submit(client, { companyId, userId: counter, countId: c.id })).toEqual({ status: "submitted", over: 1 });
      expect((await shop.held(cement)).onHand).toBe("10");
      await expect(counts.approve(client, { companyId, userId: counter, countId: c.id })).rejects.toThrow(/Someone other than the counter/);

      await counts.reopen(client, { companyId, userId, countId: c.id });
      await counted(client, companyId, counter, c.id, [[cement, "4", "Six bags gone from the yard"]]);
      await counts.submit(client, { companyId, userId: counter, countId: c.id });
      const waiting = await counts.view(client, { companyId, userId, countId: c.id, reads: true });
      expect(waiting.lines[0]).toMatchObject({ difference: "-6", value: "-600.00", over: true });
      expect(await counts.approve(client, { companyId, userId, countId: c.id })).toEqual({ status: "posted" });
      expect((await shop.held(cement)).onHand).toBe("4");
      expect((await counts.accuracy(client, { companyId })).get("main")).toMatchObject({ lines: 1, within: 0, percent: 0 });
      await shop.tied();
    }));

  it("a spot check picks a few of what is there, and is not counted by the place's person in charge", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const { companyId, userId } = shop;
      await client.query("INSERT INTO memberships (company_id, user_id, role) VALUES ($1, $2, 'administrator')", [companyId, userId]);
      const keeper = await person(client, companyId, "Aminath", "site_staff");
      const site = await stock.addPlace(client, { companyId, userId, name: "Tower site", kind: "site", inChargeId: keeper });
      const ids = [];
      for (const n of ["A", "B", "C", "D", "E", "F", "G"]) ids.push(await shop.item(`Part ${n}`));
      await shop.buy(ids.map((itemId, i) => ({ itemId, quantity: "2", amount: `${(i + 1) * 10}.00` })));
      for (const itemId of ids) await stock.transfer(client, { companyId, userId, itemId, fromPlaceId: null, toPlaceId: site.id, quantity: "2", on: "2026-09-12", arrived: true });

      await expect(counts.create(client, { companyId, userId, kind: "spot", placeId: site.id, counterId: keeper })).rejects.toThrow(/Aminath looks after Tower site/);
      const s = await counts.create(client, { companyId, userId, kind: "spot", placeId: site.id, counterId: userId });
      expect(s.items).toBe(5);
      const v = await counts.view(client, { companyId, userId, countId: s.id, reads: true });
      expect(new Set(v.lines.map((l) => l.itemId)).size).toBe(5);
      expect(v.lines.every((l) => ids.includes(l.itemId))).toBe(true);
      await expect(counts.view(client, { companyId, userId: keeper, countId: s.id, reads: false })).rejects.toThrow(/not yours/);
      // Something found there that is not on the list can be added, from the items not on it yet.
      const more = await counts.addable(client, { companyId, userId, countId: s.id, reads: true });
      expect(more.map((m) => m.itemId).sort()).toEqual(ids.filter((i) => !v.lines.some((l) => l.itemId === i)).sort());
      await counts.addLine(client, { companyId, userId, countId: s.id, itemId: more[0].itemId });
      expect((await counts.view(client, { companyId, userId, countId: s.id, reads: true })).lines).toHaveLength(6);
    }));

  it("sorts items by value into A, B and C, and says when each is due a count", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const { companyId } = shop;
      const big = await shop.item("Generator");
      const mid = await shop.item("Cable");
      const small = await shop.item("Nails");
      await shop.buy([{ itemId: big, quantity: "1", amount: "8000.00" }, { itemId: mid, quantity: "10", amount: "1500.00" }, { itemId: small, quantity: "100", amount: "500.00" }]); // 2026-09-10
      const cls = await counts.classes(client, { companyId });
      expect([cls.get(big), cls.get(mid), cls.get(small)]).toEqual(["A", "B", "C"]);
      const d = await counts.due(client, { companyId, on: "2026-10-15" });
      expect(d.find((x) => x.itemId === big)).toMatchObject({ class: "A", dueOn: "2026-10-10", overdue: true, lastCounted: null });
      expect(d.find((x) => x.itemId === mid)).toMatchObject({ class: "B", dueOn: "2026-12-09", overdue: false });
    }));
});

describe("a second unit: pieces kept, boxes bought and sold", () => {
  it("turns boxes into pieces, and shows pieces as boxes", () => {
    const tile = { unit: "piece", pack_unit: "box", pack_size: "12.0000" };
    expect(stock.inBase(tile, stock.toUnits("2"), "Box")).toBe(stock.toUnits("24"));
    expect(stock.inBase(tile, stock.toUnits("2"), "piece")).toBe(stock.toUnits("2"));
    expect(stock.inBase(tile, stock.toUnits("2"), null)).toBe(stock.toUnits("2"));
    expect(stock.inBase({ unit: "piece", pack_unit: null, pack_size: null }, stock.toUnits("2"), "box")).toBe(stock.toUnits("2"));
    expect(stock.packsText(stock.toUnits("27"), tile)).toBe("2 box 3 piece");
    expect(stock.packsText(stock.toUnits("24"), tile)).toBe("2 box");
    expect(stock.packsText(stock.toUnits("5"), tile)).toBeNull();
  });

  it("a bill in boxes brings in the pieces at the same total, and a sale in boxes takes out the pieces at average cost", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const { companyId } = shop;
      const tile = await shop.item("Floor tile", "piece");
      await client.query("UPDATE stock_items SET pack_unit = 'box', pack_size = 12 WHERE id = $1", [tile]);
      await shop.buy([{ itemId: tile, quantity: "5", unit: "box", amount: "600.00" }]); // 60 pieces, 10.00 each
      let held = await shop.held(tile);
      expect(held).toMatchObject({ onHand: "60", value: "600.00", averageCost: "10.00", packUnit: "box", packSize: "12", onHandPacks: "5 box" });

      await shop.sell([{ itemId: tile, quantity: 2, unitPrice: "150.00", uom: "box" }, { itemId: tile, quantity: 3, unitPrice: "13.00", uom: "piece" }]);
      held = await shop.held(tile);
      expect(held).toMatchObject({ onHand: "33", value: "330.00", onHandPacks: "2 box 9 piece", sold: "27" });
      expect(held.costOfSales).toBe("270.00");
      await shop.tied();
      expect((await client.query("SELECT count(*)::int AS n FROM stock_moves WHERE company_id = $1 AND kind = 'sold'", [companyId])).rows[0].n).toBe(2);
    }));
});

describe("batches and expiry", () => {
  it("a bill for an item kept in batches does not go into the books without its batch", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const { companyId, userId } = shop;
      const paint = await shop.item("Paint 4L", "tin");
      await client.query("UPDATE stock_items SET batches = true WHERE id = $1", [paint]);

      // No batch: a draft may wait, but it does not go into the books.
      await expect(shop.buy([{ itemId: paint, quantity: "2", amount: "200.00" }])).rejects.toThrow(/kept in batches: say its batch/);
    }));

  it("keeps each batch apart, earliest to expire first", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const { companyId, userId } = shop;
      const paint = await shop.item("Paint 4L", "tin");
      await client.query("UPDATE stock_items SET batches = true WHERE id = $1", [paint]);
      await shop.buy([{ itemId: paint, quantity: "6", amount: "600.00", batchCode: "LATE-11", expiresOn: "2026-11-01" }]);
      await shop.buy([{ itemId: paint, quantity: "4", amount: "400.00", batchCode: "SOON-10", expiresOn: "2026-10-15" }]);
      // The same batch, said with another expiry, is refused (asked of the batch itself: a refused
      // bill in a request is rolled back whole, but this test's one transaction would keep its entry).
      await expect(stock.batchFor(client, { companyId, userId, itemId: paint, code: "soon-10", expiresOn: "2026-12-31" })).rejects.toThrow(/Batch SOON-10 already expires on 2026-10-15/);
      expect((await stock.batches(client, { companyId, itemId: paint })).map((b) => [b.code, b.quantity])).toEqual([["SOON-10", "4"], ["LATE-11", "6"]]);

      // Selling 5 takes the 4 expiring first, then 1 of the next.
      await shop.sell([{ itemId: paint, quantity: 5, unitPrice: "150.00" }]);
      expect((await stock.batches(client, { companyId, itemId: paint })).map((b) => [b.code, b.quantity])).toEqual([["LATE-11", "5"]]);
      const { rows: sold } = await client.query(
        "SELECT b.code, m.quantity::text AS q, m.value_laari::text AS v, m.sale_net_laari::text AS net FROM stock_moves m JOIN stock_batches b ON b.id = m.batch_id WHERE m.company_id = $1 AND m.kind = 'sold' ORDER BY b.code DESC",
        [companyId]
      );
      expect(sold).toEqual([
        { code: "SOON-10", q: "-4.0000", v: "-40000", net: "60000" },
        { code: "LATE-11", q: "-1.0000", v: "-10000", net: "15000" },
      ]);
      const held = await shop.held(paint);
      expect(held).toMatchObject({ onHand: "5", value: "500.00", batches: true, nextBatch: { code: "LATE-11", expiresOn: "2026-11-01", quantity: "5" } });
      await shop.tied();

      // Reversing a bill takes its stock out of exactly its own batch.
      const extra = await shop.buy([{ itemId: paint, quantity: "3", amount: "300.00", batchCode: "EXTRA", expiresOn: "2027-01-31" }]);
      const r = await reverseEntry(client, { companyId, userId, entryId: extra.entryId, reason: "wrong bill" });
      await stock.undoBillStock(client, { companyId, userId, billId: extra.billId, entryId: r.id, on: "2026-09-21" });
      expect((await stock.batches(client, { companyId, itemId: paint })).map((b) => b.code)).toEqual(["LATE-11"]);

      // What looks wrong: expiring within 30 days, then expired.
      const soon = await stock.snapshot(client, { companyId, on: "2026-10-20", from: "2026-10-14" });
      expect(soon.wrong.filter((w) => w.kind === "expiring").map((w) => w.detail)).toEqual([expect.stringMatching(/5 tin of Paint 4L, batch LATE-11, expires on 1 Nov 2026/)]);
      const late = await stock.snapshot(client, { companyId, on: "2026-11-05", from: "2026-10-30" });
      expect(late.wrong.filter((w) => w.kind === "expired").map((w) => w.detail)).toEqual([expect.stringMatching(/batch LATE-11, expired on 1 Nov 2026/)]);

      // Stock already held says its batch too.
      await expect(stock.opening(client, { companyId, userId, itemId: paint, quantity: "2", unitCost: "100", on: "2026-09-10" })).rejects.toThrow(/say which batch/);
    }));
});

describe("promised and coming", () => {
  it("reserves what open sales orders have yet to invoice, and counts what approved purchase orders have yet to bring", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const { companyId, userId } = shop;
      const cement = await shop.item("Cement");
      await client.query("UPDATE stock_items SET pack_unit = 'pallet', pack_size = 10 WHERE id = $1", [cement]);
      await shop.buy([{ itemId: cement, quantity: "10", amount: "1000.00" }]);
      const so = await orders.create(client, { companyId, userId, kind: "sale", counterpartyId: shop.customer, lines: [{ itemId: cement, quantity: "4", unitPrice: "200" }] });
      await orders.create(client, { companyId, userId, kind: "purchase", counterpartyId: shop.supplier, lines: [{ itemId: cement, quantity: "2", unit: "pallet", unitPrice: "1000" }], approveUpTo: null });
      // A purchase order waiting for approval is not on order yet.
      await orders.create(client, { companyId, userId, kind: "purchase", counterpartyId: shop.supplier, lines: [{ itemId: cement, quantity: "5", unitPrice: "100" }], approveUpTo: 0n });
      expect(await shop.held(cement)).toMatchObject({ onHand: "10", reserved: "4", onOrder: "20", available: "6" });

      // Three go out and are invoiced: a draft leaves them spoken for; posted, they have left.
      const s = await orders.load(client, { companyId, orderId: so.id });
      await orders.deliver(client, { companyId, userId, orderId: so.id, lines: [{ orderLineId: s.lines[0].id, quantity: "3" }] });
      const { invoice } = await orders.invoiceFromOrder(client, { companyId, userId, orderId: so.id, gstTreatment: "none_unregistered" });
      expect(await shop.held(cement)).toMatchObject({ reserved: "4", available: "6" });
      await post(client, { companyId, userId, invoiceId: invoice.id });
      expect(await shop.held(cement)).toMatchObject({ onHand: "7", reserved: "1", available: "6" });

      // Promising more than is free is flagged on today's snapshot.
      await orders.create(client, { companyId, userId, kind: "sale", counterpartyId: shop.customer, lines: [{ itemId: cement, quantity: "9", unitPrice: "200" }] });
      const snap = await stock.snapshot(client, { companyId, on: require("../src/ledger/today").today(), from: "2026-09-01" });
      expect(snap.promised).toEqual([{ itemId: cement, name: "Cement", unit: "bag", reserved: "10", onOrder: "20", available: "-3" }]);
      expect(snap.wrong.find((w) => w.kind === "oversold").detail).toMatch(/3 bag more of Cement are promised to customers than are free to sell\. 20 are on order\./);

      // Closing the sales order frees what it held.
      await orders.finish(client, { companyId, userId, orderId: so.id, how: "close" });
      expect(await shop.held(cement)).toMatchObject({ reserved: "9", available: "-2" });
    }));
});

describe("stock used on a job", () => {
  it("leaves its place at average cost and carries that cost to the project and department", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const { companyId, userId } = shop;
      const cement = await shop.item("Cement");
      await shop.buy([{ itemId: cement, quantity: "3", amount: "300.00" }]);
      await shop.buy([{ itemId: cement, quantity: "1", amount: "140.00" }]); // average now 110.00
      const project = (await client.query("INSERT INTO projects (company_id, name) VALUES ($1,'Hulhumale tower') RETURNING id", [companyId])).rows[0].id;
      const dept = (await client.query("INSERT INTO dimensions (company_id, kind, name) VALUES ($1,'department','Civil') RETURNING id", [companyId])).rows[0].id;

      const use = (over) => stock.issue(client, { companyId, userId, itemId: cement, placeId: null, quantity: "2", on: "2026-09-15", ...over });
      await expect(use({})).rejects.toThrow(/which project or department/);
      await expect(use({ projectId: project, quantity: "5" })).rejects.toThrow(/Only 4 bag/);
      const r = await use({ projectId: project, dimensionIds: [dept], note: "Slab pour" });
      expect(r.value).toBe(22000n);
      expect(r.usedOn).toBe("Hulhumale tower, Civil");

      const { rows } = await client.query(
        `SELECT a.code, a.name, l.debit_laari, l.project_id, l.dimension_ids FROM journal_lines l JOIN accounts a ON a.id = l.account_id
          WHERE l.entry_id = $1 AND l.debit_laari > 0`,
        [r.entry.id]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ code: "5060", name: "Materials used on jobs", project_id: project, dimension_ids: [dept] });
      expect(BigInt(rows[0].debit_laari)).toBe(22000n);

      const held = await shop.held(cement);
      expect(held).toMatchObject({ onHand: "2", value: "220.00", sold: "0", costOfSales: "0.00" }); // used, not sold
      await shop.tied();
      const h = await stock.history(client, { companyId, itemId: cement });
      expect(h.find((x) => x.kind === "issued")).toMatchObject({ quantity: "-2", value: "-220.00", note: "Used on Hulhumale tower, Civil: Slab pour" });
    }));
});

describe("products and services", () => {
  const balanceOf = async (client, companyId, code) =>
    BigInt((await client.query(
      `SELECT COALESCE(SUM(l.debit_laari - l.credit_laari), 0) AS b FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE a.company_id = $1 AND a.code = $2`,
      [companyId, code]
    )).rows[0].b);

  it("sells a service on its own income account, with no stock and no cost of sales", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const { companyId, userId } = shop;
      const hire = (await client.query("INSERT INTO accounts (company_id, code, name, type) VALUES ($1,'4200','Equipment rental','income') RETURNING id", [companyId])).rows[0].id;
      const { rows } = await client.query(
        "INSERT INTO stock_items (company_id, name, unit, kind, counted, income_account_id, created_by) VALUES ($1,'Excavator hire','day','service',false,$2,$3) RETURNING id",
        [companyId, hire, userId]
      );
      await shop.sell([{ itemId: rows[0].id, quantity: 2.5, unitPrice: "3000.00" }]);
      expect(await balanceOf(client, companyId, "4200")).toBe(-750000n);
      expect(await balanceOf(client, companyId, "4100")).toBe(0n);
      expect(await balanceOf(client, companyId, "5050")).toBe(0n);
      const { rows: moves } = await client.query("SELECT 1 FROM stock_moves WHERE company_id = $1", [companyId]);
      expect(moves).toHaveLength(0);
    }));

  it("buys an uncounted product as a cost on its own kind of cost, and never counts it", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const { companyId, userId } = shop;
      const bolts = (await client.query(
        "INSERT INTO stock_items (company_id, name, unit, counted, cost_account_id, created_by) VALUES ($1,'Nuts and bolts','box',false,$2,$3) RETURNING id",
        [companyId, shop.accounts.expense, userId]
      )).rows[0].id;
      await shop.buy([{ itemId: bolts, quantity: "4", amount: "400.00" }]);
      expect(await shop.tied()).toBe(0n);
      const { rows: moves } = await client.query("SELECT 1 FROM stock_moves WHERE company_id = $1", [companyId]);
      expect(moves).toHaveLength(0);
      const { rows: cost } = await client.query(
        "SELECT SUM(debit_laari) AS d FROM journal_lines WHERE company_id = $1 AND account_id = $2",
        [companyId, shop.accounts.expense]
      );
      expect(BigInt(cost[0].d)).toBe(40000n);
      await expect(stock.count(client, { companyId, userId, itemId: bolts, counted: "3", on: "2026-09-21" })).rejects.toThrow(/is not counted/);
    }));

  it("asks for a kind of cost when an uncounted product has none", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      const { companyId, userId } = shop;
      const sand = (await client.query("INSERT INTO stock_items (company_id, name, counted, created_by) VALUES ($1,'Sand',false,$2) RETURNING id", [companyId, userId])).rows[0].id;
      await expect(shop.buy([{ itemId: sand, quantity: "1", amount: "50.00" }])).rejects.toThrow(/Say which kind of cost/);
    }));

  it("never keeps count of a service", () =>
    inRollback(async (client) => {
      const shop = await aShop(client);
      await expect(
        client.query("INSERT INTO stock_items (company_id, name, kind, counted, created_by) VALUES ($1,'Design','service',true,$2)", [shop.companyId, shop.userId])
      ).rejects.toThrow(/stock_items_service_uncounted/);
    }));
});

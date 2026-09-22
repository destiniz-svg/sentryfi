/**
 * Fixed assets and year end, against a real Postgres where it matters.
 *
 * The properties: straight-line lands exactly on the residual with nothing
 * left over; charging twice charges nothing twice; a closed month is caught up
 * in the next open one; selling says its gain or loss; closing a year charges
 * its depreciation and closes the books; and the balance sheet still balances,
 * with earlier years' earnings apart from this year's.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity, postEntry } from "../src/ledger/post";
import { wornAfter, monthsInUse, register, depreciate, dispose, list } from "../src/ledger/assets";
import { balanceSheet, profitAndLoss } from "../src/ledger/statements";
import * as yearEnd from "../src/ledger/yearEnd";

afterAll(closePool);

describe("how an asset wears out", () => {
  const boat = { cost_laari: "1000000", residual_laari: "100000", life_months: 36, method: "straight_line" };

  it("straight line: evenly, and exactly to the residual at the end", () => {
    expect(wornAfter(boat, 0)).toBe(0n);
    expect(wornAfter(boat, 1)).toBe(25000n);
    expect(wornAfter(boat, 35)).toBe(875000n);
    expect(wornAfter(boat, 36)).toBe(900000n);
    expect(wornAfter(boat, 60)).toBe(900000n);
  });

  it("straight line: never loses a laari to rounding", () => {
    const odd = { cost_laari: "100000", residual_laari: "0", life_months: 7, method: "straight_line" };
    let charged = 0n;
    for (let k = 1; k <= 7; k++) charged += wornAfter(odd, k) - wornAfter(odd, k - 1);
    expect(charged).toBe(100000n);
  });

  it("reducing balance: a share of what is left each year, never below the residual", () => {
    const van = { cost_laari: "1200000", residual_laari: "0", life_months: 60, method: "reducing_balance", rate_bp: 2500 };
    expect(wornAfter(van, 1)).toBe(25000n); // 25% a year, a twelfth of it on 12,000.00
    expect(wornAfter(van, 2)).toBeGreaterThan(wornAfter(van, 1));
    expect(wornAfter(van, 2) - wornAfter(van, 1)).toBeLessThan(25000n);
  });

  it("counts the month it was bought", () => {
    expect(monthsInUse("2026-01-15", "2026-01-31")).toBe(1);
    expect(monthsInUse("2025-11-03", "2026-02-28")).toBe(4);
  });
});

async function books(client) {
  const c = await aCompanyWith(client);
  await assumeIdentity(client, { companyId: c.companyId, userId: c.userId });
  await postEntry(client, {
    companyId: c.companyId, userId: c.userId, date: "2025-01-01", source: "opening_balance", narrative: "Opening bank",
    lines: [
      { accountId: c.accounts.bank, debit: "100,000.00" },
      { accountId: c.accounts.payable, credit: "100,000.00" },
    ],
  });
  return c;
}

describe("the register, against the books", () => {
  it("buys, charges each month once, and the balance sheet still balances", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await books(client);
      const a = await register(client, {
        companyId, userId, name: "Dinghy", category: "vehicles", cost: "36,000.00", residual: "0",
        acquiredOn: "2025-01-10", lifeYears: 3, fromAccountId: accounts.bank,
      });
      expect(a.paidFrom).toBe("Bank");

      const first = await depreciate(client, { companyId, userId, through: "2025-03-31" });
      expect(first.posted.map((p) => p.month)).toEqual(["2025-01-31", "2025-02-28", "2025-03-31"]);
      expect(first.total).toBe(300000n); // 1,000.00 a month
      const again = await depreciate(client, { companyId, userId, through: "2025-03-31" });
      expect(again.posted).toHaveLength(0);

      const [row] = await list(client, { companyId });
      expect(row.worn).toBe("3,000.00");
      expect(row.bookValue).toBe("33,000.00");

      const bs = await balanceSheet(client, { companyId, asAt: "2025-03-31" });
      expect(bs.difference).toBe(0n);
    }));

  it("catches up a month that was closed in the first open month", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await books(client);
      await register(client, {
        companyId, userId, name: "Laptop", category: "furniture", cost: "3,600.00",
        acquiredOn: "2025-01-05", lifeYears: 3, fromAccountId: accounts.bank,
      });
      await client.query("INSERT INTO period_locks (company_id, action, locked_through, by_user) VALUES ($1,'close','2025-02-28',$2)", [companyId, userId]);
      const r = await depreciate(client, { companyId, userId, through: "2025-03-31" });
      expect(r.posted).toHaveLength(1);
      expect(r.posted[0].month).toBe("2025-03-31");
      expect(r.total).toBe(30000n); // three months of 100.00, in March
    }));

  it("selling one says the gain; scrapping one says the loss", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await books(client);
      const boat = await register(client, {
        companyId, userId, name: "Boat", category: "vehicles", cost: "12,000.00",
        acquiredOn: "2025-01-01", lifeYears: 1, fromAccountId: accounts.bank,
      });
      // Charged January to June (6 x 1,000.00), sold on 15 July for 7,000.00.
      const sold = await dispose(client, { companyId, userId, assetId: boat.id, on: "2025-07-15", proceeds: "7,000.00", toAccountId: accounts.bank });
      expect(sold.bookValue).toBe(600000n);
      expect(sold.gain).toBe(100000n);
      await expect(dispose(client, { companyId, userId, assetId: boat.id, on: "2025-08-01" })).rejects.toThrow(/already/);

      const drill = await register(client, {
        companyId, userId, name: "Drill", category: "equipment", cost: "1,200.00",
        acquiredOn: "2025-01-01", lifeYears: 1, fromAccountId: accounts.bank,
      });
      const scrapped = await dispose(client, { companyId, userId, assetId: drill.id, on: "2025-04-01" });
      expect(scrapped.gain).toBe(-90000n); // 900.00 of book value thrown away

      const bs = await balanceSheet(client, { companyId, asAt: "2025-12-31" });
      expect(bs.difference).toBe(0n);
      // Nothing more is charged on either once they are gone.
      const later = await depreciate(client, { companyId, userId, through: "2025-12-31" });
      expect(later.total).toBe(0n);
    }));
});

describe("closing a year", () => {
  it("charges the year's depreciation, closes the books, and keeps last year's profit apart", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await books(client);
      await register(client, {
        companyId, userId, name: "Generator", category: "equipment", cost: "60,000.00",
        acquiredOn: "2025-01-01", lifeYears: 5, fromAccountId: accounts.bank,
      });
      const before = await yearEnd.status(client, { companyId, year: 2025 });
      expect(before.closed).toBe(false);
      expect(before.depreciationMonths).toBe(12);
      expect(before.depreciationToCharge).toBe(1200000n);

      const closed = await yearEnd.close(client, { companyId, userId, year: 2025 });
      expect(closed.lockedThrough).toBe("2025-12-31");
      expect(closed.depreciation).toBe(1200000n);
      await expect(yearEnd.close(client, { companyId, userId, year: 2025 })).rejects.toThrow(/already closed/);

      const pl = await profitAndLoss(client, { companyId, from: "2025-01-01", to: "2025-12-31" });
      expect(pl.profit).toBe(-1200000n);
      const bs = await balanceSheet(client, { companyId, asAt: "2026-01-31" });
      expect(bs.earnedBefore).toBe(-1200000n);
      expect(bs.difference).toBe(0n);
    }));
});

/**
 * Closing the books, against a real Postgres.
 *
 * The property that matters is that a closed month cannot be posted into by
 * accident from anywhere, and can be posted into on purpose only with a reason
 * that is kept, and that reopening it leaves a name and a reason behind.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity, postEntry } from "../src/ledger/post";
import * as periods from "../src/ledger/periods";

afterAll(closePool);

async function aBusiness(client) {
  const { companyId, userId, accounts } = await aCompanyWith(client);
  await assumeIdentity(client, { companyId, userId });
  const base = { companyId, userId };
  const put = (date, amount = "100.00") =>
    postEntry(client, {
      ...base, date, source: "adjustment", narrative: `Entry on ${date}`,
      lines: [{ accountId: accounts.expense, debit: amount }, { accountId: accounts.bank, credit: amount }],
    });
  return { ...base, accounts, base, put };
}

const twoLines = (b, amount) => [
  { accountId: b.accounts.expense, debit: amount },
  { accountId: b.accounts.bank, credit: amount },
];

describe("a closed month", () => {
  it("refuses an entry dated inside it", () =>
    inRollback(async (client) => {
      const b = await aBusiness(client);
      await b.put("2026-08-15");
      await periods.close(client, { ...b.base, through: "2026-08-31" });
      await expect(b.put("2026-08-31")).rejects.toThrow(/closed through 31 Aug 2026/);
    }));

  it("accepts the first day of the next month", () =>
    inRollback(async (client) => {
      const b = await aBusiness(client);
      await periods.close(client, { ...b.base, through: "2026-08-31" });
      await expect(b.put("2026-09-01")).resolves.toMatchObject({ entryNo: 1n });
    }));

  it("is refused by the database itself, not only by the application", () =>
    inRollback(async (client) => {
      const b = await aBusiness(client);
      await periods.close(client, { ...b.base, through: "2026-08-31" });
      await expect(
        client.query(
          `INSERT INTO journal_entries (company_id, entry_no, entry_date, posted_by, source, narrative, hash)
           VALUES ($1, 99, '2026-08-01', $2, 'adjustment', 'sneaked in', decode('00', 'hex'))`,
          [b.companyId, b.userId]
        )
      ).rejects.toThrow(/closed through/);
    }));

  it("takes a deliberate adjustment with a reason, and keeps the reason", () =>
    inRollback(async (client) => {
      const b = await aBusiness(client);
      await periods.close(client, { ...b.base, through: "2026-08-31" });

      const done = await periods.adjust(client, {
        ...b.base, date: "2026-08-20", narrative: "Late fuel bill", reason: "Invoice arrived in September",
        lines: twoLines(b, "500.00"),
      });
      expect(done.intoClosedPeriod).toBe(true);

      const { rows } = await client.query(
        "SELECT reason, locked_through::text AS through FROM period_adjustments WHERE entry_id = $1",
        [done.entry.id]
      );
      expect(rows).toEqual([{ reason: "Invoice arrived in September", through: "2026-08-31" }]);
    }));

  it("will not take an adjustment that says nothing about why", () =>
    inRollback(async (client) => {
      const b = await aBusiness(client);
      await periods.close(client, { ...b.base, through: "2026-08-31" });
      await expect(
        periods.adjust(client, { ...b.base, date: "2026-08-20", narrative: "Sneaky", lines: twoLines(b, "5") })
      ).rejects.toThrow(/Say why/);
    }));

  it("does not let one adjustment's permission carry over to the next entry", () =>
    inRollback(async (client) => {
      const b = await aBusiness(client);
      await periods.close(client, { ...b.base, through: "2026-08-31" });
      await periods.adjust(client, {
        ...b.base, date: "2026-08-20", narrative: "Late fuel bill", reason: "Arrived late", lines: twoLines(b, "5"),
      });
      await expect(b.put("2026-08-21")).rejects.toThrow(/closed through/);
    }));
});

describe("closing and reopening", () => {
  it("closes a month that is over, at its last day, and never backwards", () =>
    inRollback(async (client) => {
      const b = await aBusiness(client);
      await expect(periods.close(client, { ...b.base, through: "2026-08-30" })).rejects.toThrow(/last day/);
      await expect(periods.close(client, { ...b.base, through: "2999-01-31" })).rejects.toThrow(/not over yet/);
      await periods.close(client, { ...b.base, through: "2026-08-31" });
      await expect(periods.close(client, { ...b.base, through: "2026-07-31" })).rejects.toThrow(/already closed/);
    }));

  it("reopens only with a name and a reason on it, and the history keeps both", () =>
    inRollback(async (client) => {
      const b = await aBusiness(client);
      await periods.close(client, { ...b.base, through: "2026-08-31" });
      await expect(periods.reopen(client, { ...b.base, through: "2026-07-31", reason: "" })).rejects.toThrow(/Say why/);
      await expect(periods.reopen(client, { ...b.base, through: "2026-09-30", reason: "Wrong way" })).rejects.toThrow(/goes back/);

      await periods.reopen(client, { ...b.base, through: "2026-07-31", reason: "Accountant found a missing invoice" });
      expect(await periods.lockedThrough(client, b.base)).toBe("2026-07-31");
      await expect(b.put("2026-08-10")).resolves.toBeTruthy(); // August is open again

      const o = await periods.overview(client, b.base);
      expect(o.history.map((h) => [h.action, h.locked_through, h.reason])).toEqual([
        ["reopen", "2026-07-31", "Accountant found a missing invoice"],
        ["close", "2026-08-31", null],
      ]);
    }));

  it("reopens all the way, and the log cannot be edited", () =>
    inRollback(async (client) => {
      const b = await aBusiness(client);
      await periods.close(client, { ...b.base, through: "2026-08-31" });
      await periods.reopen(client, { ...b.base, through: null, reason: "Starting again" });
      expect(await periods.lockedThrough(client, b.base)).toBeNull();
      await expect(client.query("UPDATE period_locks SET reason = 'x'")).rejects.toThrow(/permission denied/);
    }));

  it("says what is unfinished before closing, without stopping it", () =>
    inRollback(async (client) => {
      const b = await aBusiness(client);
      const done = await periods.close(client, { ...b.base, through: "2026-08-31" });
      expect(done.doubts).toEqual({ bills: 0, invoices: 0, bankLines: 0 });
    }));

  it("offers the months that could be closed next", () =>
    inRollback(async (client) => {
      const b = await aBusiness(client);
      await b.put("2026-06-10");
      const first = await periods.overview(client, b.base);
      expect(first.candidates.slice(0, 3)).toEqual(["2026-06-30", "2026-07-31", "2026-08-31"]);
      await periods.close(client, { ...b.base, through: "2026-06-30" });
      expect((await periods.overview(client, b.base)).candidates[0]).toBe("2026-07-31");
    }));
});

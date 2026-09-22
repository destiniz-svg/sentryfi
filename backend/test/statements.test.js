/**
 * The statements, against a real Postgres.
 *
 * Two kinds of test. One is a small worked example whose figures can be
 * checked by hand. The other is a property test: a few hundred random balanced
 * entries spread over a year, and then the same questions asked on many dates,
 * every answer compared with a model that adds the entries up in plain
 * JavaScript. The statements are sums over the journal, so the model and the
 * database must agree on every date, and the trial balance must foot and the
 * balance sheet must balance on all of them.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity, postEntry, reverseEntry } from "../src/ledger/post";
import { trialBalance, profitAndLoss, balanceSheet } from "../src/ledger/statements";

afterAll(closePool);

async function aBusiness(client) {
  const { companyId, userId, accounts } = await aCompanyWith(client);
  await assumeIdentity(client, { companyId, userId });
  const { rows } = await client.query(
    `INSERT INTO accounts (company_id, code, name, type) VALUES
       ($1,'1300','Money owed to us','asset'), ($1,'2200','GST we owe','liability'),
       ($1,'3100','Owner''s stake','equity'),  ($1,'4100','Work invoiced','income')
     RETURNING id, code`,
    [companyId]
  );
  const by = { ...accounts.byCode, ...Object.fromEntries(rows.map((r) => [r.code, r.id])) };
  const put = (date, lines) => postEntry(client, { companyId, userId, date, source: "adjustment", narrative: `Entry ${date}`, lines });
  return { companyId, userId, by, put, base: { companyId } };
}

describe("a worked example", () => {
  async function fill(client) {
    const b = await aBusiness(client);
    const { by } = b;
    await b.put("2026-01-05", [{ accountId: by["1100"], debit: "10000.00" }, { accountId: by["3100"], credit: "10000.00" }]);
    await b.put("2026-02-01", [
      { accountId: by["1300"], debit: "1080.00" }, { accountId: by["4100"], credit: "1000.00" }, { accountId: by["2200"], credit: "80.00" },
    ]);
    const bill = await b.put("2026-02-10", [
      { accountId: by["5100"], debit: "500.00" }, { accountId: by["1400"], debit: "40.00" }, { accountId: by["2100"], credit: "540.00" },
    ]);
    await b.put("2026-02-15", [{ accountId: by["1100"], debit: "1080.00" }, { accountId: by["1300"], credit: "1080.00" }]);
    return { ...b, bill };
  }

  it("foots the trial balance to the laari", () =>
    inRollback(async (client) => {
      const b = await fill(client);
      const t = await trialBalance(client, { ...b.base, asAt: "2026-02-28" });
      expect(t.debit).toBe(1_162_000n);
      expect(t.credit).toBe(1_162_000n);
      expect(t.difference).toBe(0n);
      // Debit balances on the left, credit balances on the right, never both.
      expect(t.rows.every((r) => !(r.debit > 0n && r.credit > 0n))).toBe(true);
    }));

  it("reports what was earned in a window, from the entries dated in it", () =>
    inRollback(async (client) => {
      const b = await fill(client);
      const p = await profitAndLoss(client, { ...b.base, from: "2026-02-01", to: "2026-02-28" });
      expect(p).toMatchObject({ totalIncome: 100_000n, totalExpenses: 50_000n, profit: 50_000n });
      const january = await profitAndLoss(client, { ...b.base, from: "2026-01-01", to: "2026-01-31" });
      expect(january.profit).toBe(0n);
    }));

  it("balances the balance sheet, and gives last month's answer when asked for last month", () =>
    inRollback(async (client) => {
      const b = await fill(client);
      const feb = await balanceSheet(client, { ...b.base, asAt: "2026-02-28" });
      expect(feb).toMatchObject({ totalAssets: 1_112_000n, totalLiabilities: 62_000n, totalEquity: 1_050_000n, earned: 50_000n, difference: 0n });

      const jan = await balanceSheet(client, { ...b.base, asAt: "2026-01-31" });
      expect(jan).toMatchObject({ totalAssets: 1_000_000n, totalLiabilities: 0n, totalEquity: 1_000_000n, earned: 0n, difference: 0n });
    }));

  it("nets a reversal to nothing without losing either entry", () =>
    inRollback(async (client) => {
      const b = await fill(client);
      await reverseEntry(client, { ...b.base, userId: b.userId, entryId: b.bill.id, reason: "Wrong supplier", date: "2026-02-20" });
      const p = await profitAndLoss(client, { ...b.base, from: "2026-02-01", to: "2026-02-28" });
      expect(p.totalExpenses).toBe(0n);
      expect(p.profit).toBe(100_000n);
      expect((await balanceSheet(client, { ...b.base, asAt: "2026-02-28" })).difference).toBe(0n);
    }));
});

/** A small seeded generator, so a failure can be replayed exactly. */
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("on any date asked for", () => {
  it("foots, balances and agrees with a plain-JavaScript model of the journal", () =>
    inRollback(async (client) => {
      const b = await aBusiness(client);
      const codes = ["1100", "1300", "1400", "2100", "2200", "3100", "4100", "5100"];
      const type = { 1100: "asset", 1300: "asset", 1400: "asset", 2100: "liability", 2200: "liability", 3100: "equity", 4100: "income", 5100: "expense" };
      const rnd = mulberry32(20260922);
      const pick = (n) => Math.floor(rnd() * n);

      const model = []; // { date, code, debit, credit }
      for (let i = 0; i < 120; i += 1) {
        const date = `2026-${String(1 + pick(12)).padStart(2, "0")}-${String(1 + pick(28)).padStart(2, "0")}`;
        const n = 2 + pick(3);
        const lines = [];
        let left = 1000 + pick(500_000); // laari
        for (let k = 0; k < n; k += 1) {
          const share = k === n - 1 ? left : 1 + pick(left - (n - 1 - k));
          left -= share;
          lines.push({ code: codes[pick(codes.length)], laari: BigInt(share), debit: true });
        }
        // The other side is one line, so the entry balances by construction.
        const total = lines.reduce((s, l) => s + l.laari, 0n);
        lines.push({ code: codes[pick(codes.length)], laari: total, debit: false });
        await b.put(date, lines.map((l) => ({ accountId: b.by[l.code], [l.debit ? "debit" : "credit"]: l.laari })));
        for (const l of lines) model.push({ date, code: l.code, debit: l.debit ? l.laari : 0n, credit: l.debit ? 0n : l.laari });
      }

      const net = (asAt, code, from = "0000-01-01") =>
        model.filter((m) => m.code === code && m.date <= asAt && m.date >= from).reduce((s, m) => s + m.debit - m.credit, 0n);

      for (const asAt of ["2026-01-15", "2026-03-31", "2026-06-30", "2026-09-22", "2026-12-31", "2027-06-30"]) {
        const t = await trialBalance(client, { ...b.base, asAt });
        expect(t.difference).toBe(0n);
        for (const r of t.rows) expect(r.debit - r.credit).toBe(net(asAt, r.code));

        const s = await balanceSheet(client, { ...b.base, asAt });
        expect(s.difference).toBe(0n);
        const earned = codes.filter((c) => ["income", "expense"].includes(type[c])).reduce((sum, c) => sum - net(asAt, c), 0n);
        expect(s.earned).toBe(earned);
      }

      for (const [from, to] of [["2026-01-01", "2026-03-31"], ["2026-04-01", "2026-04-30"], ["2026-01-01", "2026-12-31"]]) {
        const p = await profitAndLoss(client, { ...b.base, from, to });
        expect(p.totalIncome).toBe(-net(to, "4100", from));
        expect(p.totalExpenses).toBe(net(to, "5100", from));
        expect(p.profit).toBe(p.totalIncome - p.totalExpenses);
      }
    }), 30_000); // 120 entries and eighteen statements: more than the default five seconds under a full parallel run
});

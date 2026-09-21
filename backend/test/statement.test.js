/**
 * Reading a bank statement, then keeping it.
 *
 * The fixtures are invented but built to the real Bank of Maldives export's
 * shape, trap for trap (docs/real-world-samples/bml-csv-import.md): no header
 * row, Excel-wrapped cells, three timestamp shapes, decimals that come as 800,
 * 426.5 and 19605.23, and a malformed row. The real file is never in a test:
 * it holds real people's names.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import { importStatement } from "../src/ledger/bank";
import { parse } from "../src/ledger/statement";

afterAll(closePool);

const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
const xl = (v) => q(`="${v}"`); // Excel keeping a value as text

/** One line, quoted the way the bank quotes it. */
function line({ on, kind = "Transfer Debit", ref = "BLAZ100000000001", int = "FT26001369XH\\B26", at = "01-01-2026 01-51-27",
  who = "SOMEONE, ELSE", channel = "Internet Banking", debit = "", credit = "", balance }) {
  return [q(on), q(on), q(kind), xl(ref), xl(int), q(at), xl(who), q(channel), q(debit), q(credit), q(balance)].join(",");
}

// Opens at 1,000.00. Every row's balance follows from the one before it.
const ROWS = [
  line({ on: "2026/01/01", debit: "800", balance: "200.00", ref: "BLAZ100000000001" }),
  line({ on: "2026/01/02", credit: "426.5", balance: "626.50", ref: "BLAZ100000000002", kind: "Transfer Credit" }),
  // The timestamp is later than the posting date's neighbours: weekends post late.
  line({ on: "2026/01/04", debit: "0.50", balance: "626.00", ref: "BLAZ100000000003", at: "02-01-2026 09-26-45" }),
  // ATM deposits: year-first timestamp, sixteen digit reference.
  line({ on: "2026/01/05", credit: "19605.23", balance: "20231.23", ref: "1234567890123456", at: "2026-01-05 10-11-12", kind: "Cash Deposit-ATM" }),
  // Card purchase: the time has no separators.
  line({ on: "2026/01/06", debit: "31.23", balance: "20200.00", ref: "BLAZ100000000005", at: "06-01-2026 101112", kind: "Purchase" }),
  // Favara: a description sits where the timestamp usually is.
  line({ on: "2026/01/07", debit: "200", balance: "20000.00", ref: "BLAZ100000000006", at: "Payment for a boat", kind: "Favara Debit" }),
  // Malformed: the channel holds a timestamp.
  line({ on: "2026/01/08", debit: "0", balance: "20000.00", ref: "BLAZ100000000007", channel: "08-01-2026 15-47-23" }),
];
const FILE = ROWS.join("\n") + "\n";

describe("reading the statement", () => {
  const r = parse(FILE);

  it("keeps the first line: there is no header row", () => {
    expect(r.rows).toHaveLength(7);
    expect(r.rows[0].bankRef).toBe("BLAZ100000000001");
  });

  it("takes the Excel wrapping off and keeps commas and backslashes", () => {
    expect(r.rows[0].who).toBe("SOMEONE, ELSE");
    expect(r.rows[0].internalRef).toBe("FT26001369XH\\B26");
  });

  it("reads amounts as whole laari whatever the decimal places", () => {
    expect(r.rows[0].debitLaari).toBe(80_000n);
    expect(r.rows[1].creditLaari).toBe(42_650n);
    expect(r.rows[2].debitLaari).toBe(50n);
    expect(r.rows[3].creditLaari).toBe(1_960_523n);
  });

  it("tells the three timestamp shapes apart by shape", () => {
    expect(r.rows[0].happenedAt).toBe("2026-01-01 01:51:27");
    expect(r.rows[2].happenedAt).toBe("2026-01-02 09:26:45"); // day first
    expect(r.rows[3].happenedAt).toBe("2026-01-05 10:11:12"); // year first
    expect(r.rows[4].happenedAt).toBe("2026-01-06 10:11:12"); // no separators
  });

  it("keeps a description that sits where a timestamp usually is, and does not call it malformed", () => {
    expect(r.rows[5].happenedAt).toBeNull();
    expect(r.rows[5].remark).toBe("Payment for a boat");
    expect(r.rows[5].flag).toBeNull();
  });

  it("imports a malformed row and flags the field instead of rejecting the file", () => {
    expect(r.rows[6].flag).toMatch(/channel holds a timestamp/);
    expect(r.rows.filter((x) => x.flag)).toHaveLength(1);
  });

  it("proves the columns were read right: the file's own balances add up", () => {
    expect(r.balance.breaks).toBe(0);
    expect(r.balance.opening).toBe(100_000n);
    expect(r.balance.closing).toBe(2_000_000n);
  });

  it("notices when they do not, and names the row", () => {
    const off = parse(FILE.replace('"426.5"', '"426.4"'));
    expect(off.balance.breaks).toBeGreaterThan(0);
    expect(off.balance.firstBreak).toBe(2);
  });

  it("copes with newest first, a BOM and Windows line endings", () => {
    const flipped = "﻿" + [...ROWS].reverse().join("\r\n") + "\r\n";
    const f = parse(flipped);
    expect(f.rows).toHaveLength(7);
    expect(f.balance.breaks).toBe(0);
    expect(f.balance.newestFirst).toBe(true);
  });

  it("names a line it cannot read and carries on with the rest", () => {
    const f = parse(FILE + line({ on: "not a date", debit: "1", balance: "1" }) + "\n" + '"a","b"\n');
    expect(f.rows).toHaveLength(7);
    expect(f.skipped.map((s) => s.rowNo)).toEqual([8, 9]);
  });
});

describe("keeping the statement", () => {
  async function aBank(client) {
    const { companyId, userId, accounts } = await aCompanyWith(client);
    await assumeIdentity(client, { companyId, userId });
    return { companyId, userId, accounts };
  }

  it("stores every row once, and the same file again adds nothing", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await aBank(client);
      const args = { companyId, userId, accountId: accounts.bank, text: FILE };

      const first = await importStatement(client, args);
      expect(first).toMatchObject({ read: 7, added: 7, alreadyHad: 0, flagged: 1, from: "2026-01-01", to: "2026-01-08" });

      const again = await importStatement(client, args);
      expect(again).toMatchObject({ read: 7, added: 0, alreadyHad: 7 });
    }));

  it("lets two exports overlap without doubling the rows in the overlap", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await aBank(client);
      const args = { companyId, userId, accountId: accounts.bank };
      await importStatement(client, { ...args, text: ROWS.slice(0, 5).join("\n") });
      const second = await importStatement(client, { ...args, text: ROWS.slice(3).join("\n") });
      expect(second).toMatchObject({ read: 4, added: 2, alreadyHad: 2 });
    }));

  it("posts nothing to the books, and only accepts a bank account", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await aBank(client);
      await importStatement(client, { companyId, userId, accountId: accounts.bank, text: FILE });
      const { rows } = await client.query("SELECT count(*)::int AS n FROM journal_entries WHERE company_id = $1", [companyId]);
      expect(rows[0].n).toBe(0);

      await expect(
        importStatement(client, { companyId, userId, accountId: accounts.expense, text: FILE })
      ).rejects.toThrow(/not a bank account/);
    }));

  it("will not let the bank's own fields be rewritten afterwards", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await aBank(client);
      await importStatement(client, { companyId, userId, accountId: accounts.bank, text: FILE });
      await expect(
        client.query("UPDATE bank_statement_lines SET debit_laari = 1 WHERE company_id = $1", [companyId])
      ).rejects.toThrow(/permission denied/);
    }));
});

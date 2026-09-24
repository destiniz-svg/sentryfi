/**
 * The ledger's promises, against a real Postgres.
 *
 * Each of these is a guarantee the database makes rather than something the
 * application remembers to do, which is why they are tested here and not by
 * mocking anything.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { postEntry, reverseEntry, assumeIdentity } from "../src/ledger/post";
import { verifyChain, verifyTrialBalance } from "../src/ledger/verify";
import { toLaari, formatLaari } from "../src/ledger/money";

// The schema is applied once for every file, in test/global-setup.js.
afterAll(closePool);

describe("an entry", () => {
  it("posts when the two sides agree", async () => {
    await inRollback(async (client) => {
      const { companyId, userId, accounts } = await aCompanyWith(client);
      const entry = await postEntry(client, {
        companyId, userId, date: "2026-09-15", source: "bill",
        narrative: "Cement — Lily Enterprises",
        lines: [
          { accountId: accounts.expense, debit: "3935.65" },
          { accountId: accounts.taxReclaimable, debit: "314.85" },
          { accountId: accounts.payable, credit: "4250.50" },
        ],
      });
      expect(entry.entryNo).toBe(1n);
      expect(entry.totalLaari).toBe(425050n);
    });
  });

  it("is refused when the sides do not agree, and says by how much", async () => {
    await inRollback(async (client) => {
      const { companyId, userId, accounts } = await aCompanyWith(client);
      await expect(
        postEntry(client, {
          companyId, userId, date: "2026-09-15", source: "bill", narrative: "Out by ten",
          lines: [
            { accountId: accounts.expense, debit: "100.00" },
            { accountId: accounts.payable, credit: "90.00" },
          ],
        })
      ).rejects.toThrow(/out by MVR 10\.00/i);
    });
  });

  it("refuses a line that is a debit and a credit at once", async () => {
    await inRollback(async (client) => {
      const { companyId, userId, accounts } = await aCompanyWith(client);
      await expect(
        postEntry(client, {
          companyId, userId, date: "2026-09-15", source: "bill", narrative: "Both sides",
          lines: [
            { accountId: accounts.expense, debit: "100.00", credit: "100.00" },
            { accountId: accounts.payable, credit: "100.00" },
          ],
        })
      ).rejects.toThrow(/both a debit and a credit/i);
    });
  });

  it("refuses to be written without saying what it is", async () => {
    await inRollback(async (client) => {
      const { companyId, userId, accounts } = await aCompanyWith(client);
      await expect(
        postEntry(client, {
          companyId, userId, date: "2026-09-15", source: "bill", narrative: "   ",
          lines: [
            { accountId: accounts.expense, debit: "100.00" },
            { accountId: accounts.payable, credit: "100.00" },
          ],
        })
      ).rejects.toThrow(/narrative/i);
    });
  });

  it("numbers without gaps, per company", async () => {
    await inRollback(async (client) => {
      const a = await aCompanyWith(client, { name: "A" });
      for (let i = 0; i < 3; i += 1) {
        const e = await postEntry(client, {
          companyId: a.companyId, userId: a.userId, date: "2026-09-15",
          source: "adjustment", narrative: `Entry ${i}`,
          lines: [
            { accountId: a.accounts.expense, debit: "1.00" },
            { accountId: a.accounts.payable, credit: "1.00" },
          ],
        });
        expect(e.entryNo).toBe(BigInt(i + 1));
      }
    });
  });
});

describe("a posted entry", () => {
  it("cannot be deleted, even by the database owner", async () => {
    await inRollback(async (client) => {
      const { companyId, userId, accounts } = await aCompanyWith(client);
      const entry = await postEntry(client, {
        companyId, userId, date: "2026-09-15", source: "bill", narrative: "A bill",
        lines: [
          { accountId: accounts.expense, debit: "100.00" },
          { accountId: accounts.payable, credit: "100.00" },
        ],
      });
      await client.query("RESET ROLE");
      await expect(
        client.query("DELETE FROM journal_entries WHERE id = $1", [entry.id])
      ).rejects.toThrow(/cannot be deleted|Reverse it instead/i);
    });
  });

  it("cannot have its seal or its date rewritten", async () => {
    await inRollback(async (client) => {
      const { companyId, userId, accounts } = await aCompanyWith(client);
      const entry = await postEntry(client, {
        companyId, userId, date: "2026-09-15", source: "bill", narrative: "A bill",
        lines: [
          { accountId: accounts.expense, debit: "100.00" },
          { accountId: accounts.payable, credit: "100.00" },
        ],
      });
      await client.query("RESET ROLE");
      await expect(
        client.query("UPDATE journal_entries SET entry_date = '2026-01-01' WHERE id = $1", [entry.id])
      ).rejects.toThrow(/cannot be altered/i);
    });
  });

  it("is corrected by a reversal that leaves both records standing", async () => {
    await inRollback(async (client) => {
      const { companyId, userId, accounts } = await aCompanyWith(client);
      const entry = await postEntry(client, {
        companyId, userId, date: "2026-09-15", source: "bill", narrative: "A bill",
        lines: [
          { accountId: accounts.expense, debit: "100.00" },
          { accountId: accounts.payable, credit: "100.00" },
        ],
      });

      await reverseEntry(client, {
        companyId, userId, entryId: entry.id, reason: "Supplier reissued it",
      });

      const { rows } = await client.query(
        "SELECT id FROM journal_entries WHERE id = $1", [entry.id]
      );
      expect(rows).toHaveLength(1);

      const balance = await verifyTrialBalance(client, { companyId, userId });
      expect(balance.ok).toBe(true);

      await expect(
        reverseEntry(client, { companyId, userId, entryId: entry.id, reason: "again" })
      ).rejects.toThrow(/already reversed/i);
    });
  });
});

describe("the seal", () => {
  it("catches a change that still balances and still adds up", async () => {
    await inRollback(async (client) => {
      const { companyId, userId, accounts } = await aCompanyWith(client);
      const entry = await postEntry(client, {
        companyId, userId, date: "2026-09-15", source: "bill", narrative: "Cement",
        lines: [
          { accountId: accounts.expense, debit: "4250.50" },
          { accountId: accounts.payable, credit: "4250.50" },
        ],
      });

      expect((await verifyChain(client, { companyId, userId })).ok).toBe(true);

      // What somebody with direct database access would do: inflate both sides
      // at once with the safety triggers off, so the entry still balances and
      // the trial balance still agrees.
      await client.query("RESET ROLE");
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      // Triggers off for this session only. ALTER TABLE ... DISABLE TRIGGER
      // did the same but locked the whole table until the test ended, and
      // every other test file posting at the time waited until it timed out.
      await client.query("SET LOCAL session_replication_role = replica");
      await client.query(
        "UPDATE journal_lines SET debit_laari = debit_laari + 3825000 WHERE entry_id = $1 AND debit_laari > 0",
        [entry.id]
      );
      await client.query(
        "UPDATE journal_lines SET credit_laari = credit_laari + 3825000 WHERE entry_id = $1 AND credit_laari > 0",
        [entry.id]
      );
      await client.query("SET LOCAL session_replication_role = origin");
      await client.query("SET CONSTRAINTS ALL DEFERRED");

      const balance = await verifyTrialBalance(client, { companyId, userId });
      const chain = await verifyChain(client, { companyId, userId });

      expect(balance.ok).toBe(true);            // nothing else notices
      expect(chain.ok).toBe(false);             // the seal does
      expect(chain.problems[0].entryNo).toBe("1");
    });
  });
});

describe("one company's books", () => {
  it("are invisible to another, even to a query with no filter", async () => {
    await inRollback(async (client) => {
      const a = await aCompanyWith(client, { name: "Altura" });
      const b = await aCompanyWith(client, { name: "Steva" });

      await postEntry(client, {
        companyId: b.companyId, userId: b.userId, date: "2026-09-15",
        source: "bill", narrative: "Steva's own bill",
        lines: [
          { accountId: b.accounts.expense, debit: "999.99" },
          { accountId: b.accounts.payable, credit: "999.99" },
        ],
      });
      await postEntry(client, {
        companyId: a.companyId, userId: a.userId, date: "2026-09-15",
        source: "bill", narrative: "Altura's own bill",
        lines: [
          { accountId: a.accounts.expense, debit: "100.00" },
          { accountId: a.accounts.payable, credit: "100.00" },
        ],
      });

      await assumeIdentity(client, { companyId: a.companyId, userId: a.userId });

      // Deliberately unfiltered: the point is that forgetting the filter is safe.
      const { rows } = await client.query("SELECT company_id FROM journal_entries");
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.company_id === a.companyId)).toBe(true);

      const { rows: aimed } = await client.query(
        "SELECT id FROM journal_entries WHERE company_id = $1", [b.companyId]
      );
      expect(aimed).toHaveLength(0);
    });
  });

  it("show nothing at all when no company has been established", async () => {
    await inRollback(async (client) => {
      const a = await aCompanyWith(client);
      await postEntry(client, {
        companyId: a.companyId, userId: a.userId, date: "2026-09-15",
        source: "bill", narrative: "A bill",
        lines: [
          { accountId: a.accounts.expense, debit: "100.00" },
          { accountId: a.accounts.payable, credit: "100.00" },
        ],
      });

      // A forgotten identity must fail closed, not open.
      await client.query("SET LOCAL ROLE sentryfi_app");
      await client.query("SELECT set_config('app.company_id', '', true)");
      const { rows } = await client.query("SELECT id FROM journal_entries");
      expect(rows).toHaveLength(0);
      await client.query("RESET ROLE");
    });
  });
});

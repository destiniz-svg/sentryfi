/** What the bank says against the books: the last statement day's closing balance, whatever order its lines came in. */
import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { postEntry } from "../src/ledger/post";
import { bankSays } from "../src/ledger/bank";

afterAll(closePool);

describe("bank against books", () => {
  it("finds the day's closing line and compares the books on that day", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await aCompanyWith(client);
      await postEntry(client, { companyId, userId, date: "2026-09-01", source: "adjustment", narrative: "Opening", lines: [{ accountId: accounts.bank, debit: "1000.00" }, { accountId: accounts.expense, credit: "1000.00" }] });
      const line = (on, debit, credit, balance, h) => client.query(
        "INSERT INTO bank_statement_lines (company_id, account_id, posted_on, kind, debit_laari, credit_laari, balance_laari, row_hash) VALUES ($1,$2,$3,'Transfer',$4,$5,$6,$7)",
        [companyId, accounts.bank, on, debit, credit, balance, h]
      );
      // Same day, written out of order: 1000 → 900 → 950. The day closes at 950.
      await line("2026-09-14", 0, 5000, 95000, "b");
      await line("2026-09-14", 10000, 0, 90000, "a");
      expect(await bankSays(client, { companyId, accountId: accounts.bank })).toEqual({ on: "2026-09-14", bank: 95000n, books: 100000n });
    }));
});

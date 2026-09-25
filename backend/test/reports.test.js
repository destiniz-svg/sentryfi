/**
 * The everyday reports read what is in the books: every report runs, and a
 * report's total is the sum of its rows.
 */
import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { postEntry } from "../src/ledger/post";
import * as reports from "../src/ledger/reports";

afterAll(closePool);

describe("reports", () => {
  it("every report runs, and expenses add up by account", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await aCompanyWith(client);
      await postEntry(client, { companyId, userId, date: "2026-09-12", source: "adjustment", narrative: "Cement", lines: [{ accountId: accounts.expense, debit: "4250.50" }, { accountId: accounts.bank, credit: "4250.50" }] });
      await postEntry(client, { companyId, userId, date: "2026-09-14", source: "adjustment", narrative: "More cement", lines: [{ accountId: accounts.expense, debit: "749.50" }, { accountId: accounts.bank, credit: "749.50" }] });
      for (const { key } of reports.list()) {
        const r = await reports.run(client, { companyId, key, from: "2026-09-01", to: "2026-09-30" });
        expect(r.columns.length).toBeGreaterThan(1);
      }
      const e = await reports.run(client, { companyId, key: "expenses-by-account", from: "2026-09-01", to: "2026-09-30" });
      expect(e.rows).toEqual([{ code: "5100", name: "Materials", amount: "5,000.00" }]);
      expect(e.totals.amount).toBe("5,000.00");
      expect(await reports.run(client, { companyId, key: "nope", from: "2026-09-01", to: "2026-09-30" })).toBeNull();
    }));
});

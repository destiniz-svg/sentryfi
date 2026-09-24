/**
 * The income tax view: the year's profit regrouped onto return lines, with
 * depreciation and a fine added back, and an account moved by a person.
 */
import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity, postEntry } from "../src/ledger/post";
import * as incomeTax from "../src/ledger/incomeTax";

afterAll(closePool);

describe("the income tax view", () => {
  it("regroups the year, adds back depreciation and a fine, and follows a person's choice", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await aCompanyWith(client);
      await assumeIdentity(client, { companyId, userId });
      const { rows } = await client.query(
        `INSERT INTO accounts (company_id, code, name, type) VALUES
           ($1,'4100','Work invoiced','income'), ($1,'5110','Materials','expense'), ($1,'5200','Staff wages','expense'),
           ($1,'5800','Depreciation','expense'), ($1,'5950','Late filing fine','expense'), ($1,'5960','Site rent','expense')
         RETURNING code, id`,
        [companyId]
      );
      const id = Object.fromEntries(rows.map((r) => [r.code, r.id]));
      const put = (debitId, creditId, amount) => postEntry(client, { companyId, userId, date: "2025-06-30", source: "adjustment", narrative: "x", lines: [{ accountId: debitId, debit: amount }, { accountId: creditId, credit: amount }] });
      await put(accounts.bank, id["4100"], "100000");
      for (const [code, amount] of [["5110", "40000"], ["5200", "20000"], ["5800", "5000"], ["5950", "1000"], ["5960", "6000"]]) await put(id[code], accounts.bank, amount);

      const y = await incomeTax.year(client, { companyId, year: 2025 });
      const by = Object.fromEntries(y.lines.map((l) => [l.key, l.amount]));
      expect(by).toMatchObject({ revenue: "100,000.00", cost_of_sales: "40,000.00", employment: "20,000.00", rent: "6,000.00", depreciation: "5,000.00", not_deductible: "1,000.00" });
      expect(y.bookProfit).toBe("28,000.00");
      expect(y.taxableProfit).toBe("34,000.00"); // depreciation and the fine added back
      expect(y.estimate).toBe("5,100.00"); // at the 15% the estimate uses

      await incomeTax.setLine(client, { companyId, code: "5960", line: "not_deductible" });
      expect((await incomeTax.year(client, { companyId, year: 2025 })).taxableProfit).toBe("40,000.00");
      await expect(incomeTax.setLine(client, { companyId, code: "5960", line: "made_up" })).rejects.toThrow(/not a line/);
    }));
});

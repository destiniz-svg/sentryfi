/**
 * Dimensions: a line can say which branch, department or machine it belongs
 * to. The properties: tagged lines still verify on the hash chain, untagged
 * entries keep the exact seal they had, a tag from another company is
 * refused, and the split by a kind adds up to the whole profit and loss.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity, postEntry, canonicalBytes } from "../src/ledger/post";
import { verifyChain } from "../src/ledger/verify";
import { profitAndLoss, profitBy } from "../src/ledger/statements";

afterAll(closePool);

const tag = async (client, companyId, kind, name) =>
  (await client.query("INSERT INTO dimensions (company_id, kind, name) VALUES ($1,$2,$3) RETURNING id", [companyId, kind, name])).rows[0].id;

describe("the seal", () => {
  it("an entry with no dimensions hashes exactly as it did before they existed", () => {
    const entry = { company_id: "c", entry_no: 1n, entry_date: "2026-01-01", source: "bill", source_id: null, narrative: "n", reverses_id: null };
    const line = { account_id: "a", debit_laari: 1n, credit_laari: 0n, project_id: null, cost_code_id: null, counterparty_id: null, memo: null };
    const before = canonicalBytes(entry, [line], null).toString();
    expect(before.startsWith("v1")).toBe(true);
    expect(canonicalBytes(entry, [{ ...line, dimension_ids: null }], null).toString()).toBe(before);
    expect(canonicalBytes(entry, [{ ...line, dimension_ids: ["x"] }], null).toString().startsWith("v2")).toBe(true);
  });
});

describe("tagging lines", () => {
  it("posts, verifies, filters and splits", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await aCompanyWith(client);
      await assumeIdentity(client, { companyId, userId });
      const { rows: inc } = await client.query("INSERT INTO accounts (company_id, code, name, type) VALUES ($1,'4100','Work','income') RETURNING id", [companyId]);
      const male = await tag(client, companyId, "branch", "Malé");
      const addu = await tag(client, companyId, "branch", "Addu");

      const put = (date, amount, income, dims) =>
        postEntry(client, {
          companyId, userId, date, source: "adjustment", narrative: "x",
          lines: income
            ? [{ accountId: accounts.bank, debit: amount }, { accountId: inc[0].id, credit: amount, dimensionIds: dims }]
            : [{ accountId: accounts.expense, debit: amount, dimensionIds: dims }, { accountId: accounts.bank, credit: amount }],
        });
      await put("2026-02-01", "1,000.00", true, [male]);
      await put("2026-02-02", "400.00", false, [male]);
      await put("2026-02-03", "300.00", true, [addu]);
      await put("2026-02-04", "900.00", false, [addu]);
      await put("2026-02-05", "50.00", false, null);

      const chain = await verifyChain(client, { companyId, userId });
      expect(chain.ok).toBe(true);

      const onlyMale = await profitAndLoss(client, { companyId, from: "2026-01-01", to: "2026-12-31", dimensionId: male });
      expect(onlyMale.profit).toBe(60000n);

      const split = await profitBy(client, { companyId, from: "2026-01-01", to: "2026-12-31", kind: "branch" });
      const by = Object.fromEntries(split.map((r) => [r.name, r.profit]));
      expect(by).toEqual({ Addu: -60000n, "Malé": 60000n, "Not tagged": -5000n });
      const whole = await profitAndLoss(client, { companyId, from: "2026-01-01", to: "2026-12-31" });
      expect(split.reduce((s, r) => s + r.profit, 0n)).toBe(whole.profit);
    }));

  it("refuses a tag that is not in these books", () =>
    inRollback(async (client) => {
      const other = await aCompanyWith(client);
      const foreign = await tag(client, other.companyId, "machine", "Their boat");
      const { companyId, userId, accounts } = await aCompanyWith(client);
      await assumeIdentity(client, { companyId, userId });
      await expect(
        postEntry(client, {
          companyId, userId, date: "2026-02-01", source: "adjustment", narrative: "x",
          lines: [{ accountId: accounts.expense, debit: "1.00", dimensionIds: [foreign] }, { accountId: accounts.bank, credit: "1.00" }],
        })
      ).rejects.toThrow(/not in these books/);
    }));
});

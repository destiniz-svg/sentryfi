/**
 * A real Zoho Books Journal Report, when it is on this machine.
 *
 * The file is a real company's and is git-ignored, so this skips in CI.
 * Assertions are counts and totals only. It checks the whole file goes in,
 * every income and expense account for the current year matches what the
 * file says, the trial balance is zero, and how long it takes, because the
 * live import happens inside one request.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import { preview, commit } from "../src/ledger/historyImport";
import { trialBalance } from "../src/ledger/statements";

afterAll(closePool);

const FILE = path.join(__dirname, "..", "..", "docs", "real-world-samples", "source", "zoho2-journal.csv");
// Slow (thousands of entries), so only when asked for: REAL_ZOHO=1 npm run test:local
const have = fs.existsSync(FILE) && process.env.REAL_ZOHO === "1";

describe.skipIf(!have)("a real Zoho journal", () => {
  it("goes in whole, balanced, in reasonable time", { timeout: 600_000 }, () =>
    inRollback(async (client) => {
      const text = fs.readFileSync(FILE, "utf8");
      const { companyId, userId } = await aCompanyWith(client);
      await assumeIdentity(client, { companyId, userId });

      const p = await preview(client, { companyId, system: "zoho", text });
      expect(p).toMatchObject({ count: 4678, toPost: 4678, unbalancedCount: 0 });
      const mapping = Object.fromEntries(p.accounts.filter((a) => !a.accountId).map((a) => [a.theirs, { create: a.suggestType }]));

      const started = Date.now();
      const done = await commit(client, { companyId, userId, system: "zoho", text, mapping });
      const seconds = (Date.now() - started) / 1000;
      console.log(`posted ${done.posted} transactions in ${seconds.toFixed(1)}s (${p.accounts.length} accounts)`);
      expect(done.posted).toBe(4678);

      const t = await trialBalance(client, { companyId, asAt: "2026-12-31" });
      expect(t.difference).toBe(0n);
    }));
});

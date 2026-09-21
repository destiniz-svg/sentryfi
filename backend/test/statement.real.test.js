/**
 * The real nine-month Bank of Maldives export, when it is on this machine.
 *
 * The file is Altura's own and is git-ignored, so it is absent in CI and these
 * tests skip there. Assertions are totals only: nothing in a test may contain
 * a real person's name. The totals are the ones in
 * docs/real-world-samples/bml-csv-import.md, worked out from the file itself.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import { importStatement } from "../src/ledger/bank";
import { parse } from "../src/ledger/statement";

afterAll(closePool);

const FILE = path.join(__dirname, "..", "..", "docs", "real-world-samples", "source", "bml-statement-2026-01-01-to-2026-09-11.csv");
const have = fs.existsSync(FILE);

describe.skipIf(!have)("the real statement", () => {
  const text = have ? fs.readFileSync(FILE, "utf8") : "";

  it("reads every row and the file agrees with itself to the laari", () => {
    const r = parse(text);
    const sum = (k) => r.rows.reduce((s, x) => s + x[k], 0n);
    expect(r.rows).toHaveLength(1094);
    expect(r.skipped).toHaveLength(0);
    expect(r.rows.filter((x) => x.debitLaari > 0n)).toHaveLength(997);
    expect(r.rows.filter((x) => x.creditLaari > 0n)).toHaveLength(97);
    expect(sum("debitLaari")).toBe(374_216_572n);
    expect(sum("creditLaari")).toBe(381_927_443n);
    expect(r.balance).toMatchObject({ breaks: 0, opening: 2_040_523n, closing: 9_751_394n });
    // The two known malformed rows, and nothing else.
    expect(r.rows.filter((x) => x.flag)).toHaveLength(2);
    expect(new Set(r.rows.map((x) => x.hash)).size).toBe(1094);
  });

  it("stores all of it once, and again adds nothing", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await aCompanyWith(client);
      await assumeIdentity(client, { companyId, userId });
      const args = { companyId, userId, accountId: accounts.bank, text };
      expect(await importStatement(client, args)).toMatchObject({ read: 1094, added: 1094, alreadyHad: 0, flagged: 2 });
      expect(await importStatement(client, args)).toMatchObject({ added: 0, alreadyHad: 1094 });
    }));
});

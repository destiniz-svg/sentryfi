/**
 * Bringing history in, against a real Postgres.
 *
 * The file is shaped like a Zoho Books journal export: several lines per
 * journal, a journal number, day-first dates, amounts with thousands commas.
 * What matters: it goes in through postEntry as balanced entries, the trial
 * balance afterwards is what the file said, an unbalanced journal waits
 * instead of posting, and the same file again changes nothing.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import { read, money, guessType, preview, commit } from "../src/ledger/historyImport";
import { trialBalance } from "../src/ledger/statements";

afterAll(closePool);

const ZOHO = [
  '"Journal Date","Journal Number","Reference Number","Notes","Journal Type","Currency","Account","Description","Contact Name","Debit","Credit"',
  '"01/01/2025","OB-1","","Opening balances","both","MVR","Bank","","","150,000.00",""',
  '"01/01/2025","OB-1","","Opening balances","both","MVR","Owner\'s Capital","","","","150,000.00"',
  '"14/03/2025","JV-7","R-7","Excavator rental","both","MVR","Accounts Receivable","","Road Development Corporation","97,200.00",""',
  '"14/03/2025","JV-7","R-7","Excavator rental","both","MVR","Rental Income","","","","90,000.00"',
  '"14/03/2025","JV-7","R-7","Excavator rental","both","MVR","GST Payable","","","","7,200.00"',
  '"20/03/2025","JV-8","","Fuel","both","MVR","Fuel and Oil","","","1,000.00",""',
  '"20/03/2025","JV-8","","Fuel","both","MVR","Bank","","","","999.00"',
].join("\n");

describe("reading the file", () => {
  it("finds the columns by heading, groups lines into journals, reads day-first dates", () => {
    const r = read(ZOHO);
    expect(r.transactions.map((t) => [t.theirId, t.date, t.lines.length, t.balanced])).toEqual([
      ["OB-1", "2025-01-01", 2, true],
      ["JV-7", "2025-03-14", 3, true],
      ["JV-8", "2025-03-20", 2, false],
    ]);
  });

  it("reads the money the ways ledgers write it", () => {
    expect([money("1,234.50"), money("(1,234.50)"), money("-12"), money(""), money("abc")]).toEqual([123_450n, -123_450n, -1_200n, 0n, null]);
  });

  it("reads Zoho's Journal Report: entity ids, three-decimal amounts, the document number shown", () => {
    const r = read(
      [
        "date,entity_type,entity_id,number,account,account_code,debit,credit,contact_name,contact_id",
        "2024-01-01,expense,395321300000027,773,GST - Tax Payable,,7.110,0.000,,",
        "2024-01-01,expense,395321300000027,773,Transport Expenses,,4573.000,0.000,,",
        "2024-01-01,expense,395321300000027,773,Petty Cash,,0.000,4580.110,,",
      ].join("\n")
    );
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0]).toMatchObject({ theirId: "773", type: "expense", balanced: true, debit: 458_011n });
    expect(money("7.115")).toBe(712n);
  });

  it("says plainly when the file is a summary, not transactions", () => {
    expect(() => read("name,account_id,credit_total,debit_total,balance,is_debit\nSales,1,203750.00,0.00,-203750.00,false")).toThrow(/This is a summary/);
  });

  it("says which columns are missing, by name", () => {
    expect(() => read("Foo,Bar\n1,2")).toThrow(/needs columns for date, account, debit, credit/);
  });

  it("guesses what an unknown account is from its name", () => {
    expect([guessType("Accounts Receivable"), guessType("GST Payable"), guessType("Owner's Capital"), guessType("Rental Income"), guessType("Fuel and Oil")])
      .toEqual(["asset", "liability", "equity", "income", "expense"]);
    expect([guessType("KENGO PVT LTD C/A"), guessType("Bever Builders Current Account"), guessType("VILUDHOLHI BUILDING")]).toEqual(["asset", "asset", "asset"]);
  });
});

describe("bringing it in", () => {
  async function aBusiness(client) {
    const { companyId, userId, accounts } = await aCompanyWith(client);
    await assumeIdentity(client, { companyId, userId });
    return { companyId, userId, accounts, base: { companyId, userId, system: "zoho" } };
  }

  it("previews, then posts what balances, leaves what does not, and remembers the mapping", () =>
    inRollback(async (client) => {
      const b = await aBusiness(client);
      const p = await preview(client, { ...b.base, text: ZOHO });
      expect(p).toMatchObject({ count: 3, toPost: 2, unbalancedCount: 1, alreadyHad: 0, from: "2025-01-01", to: "2025-03-20" });
      // "Bank" matches the account already here by name; the rest are new.
      const bank = p.accounts.find((a) => a.theirs === "Bank");
      expect(bank).toMatchObject({ accountId: b.accounts.bank, how: "same name" });

      const mapping = Object.fromEntries(p.accounts.filter((a) => !a.accountId).map((a) => [a.theirs, { create: a.suggestType }]));
      const done = await commit(client, { ...b.base, text: ZOHO, mapping });
      expect(done).toEqual({ posted: 2, alreadyHad: 0, unbalanced: 1 });

      // The trial balance is what the file said for the journals that balanced.
      const t = await trialBalance(client, { companyId: b.companyId, asAt: "2025-12-31" });
      expect(t.difference).toBe(0n);
      expect(t.debit).toBe(24_720_000n);

      // The same file again: nothing new, and nothing asked twice.
      const again = await preview(client, { ...b.base, text: ZOHO });
      expect(again).toMatchObject({ alreadyHad: 2, toPost: 0 });
      expect(await commit(client, { ...b.base, text: ZOHO })).toEqual({ posted: 0, alreadyHad: 2, unbalanced: 1 });
      const { rows } = await client.query("SELECT count(*)::int AS n FROM journal_entries WHERE company_id = $1 AND source = 'import'", [b.companyId]);
      expect(rows[0].n).toBe(2);
    }));

  it("will not bring anything in while an account is unanswered", () =>
    inRollback(async (client) => {
      const b = await aBusiness(client);
      await expect(commit(client, { ...b.base, text: ZOHO })).rejects.toThrow(/Say what .* is/);
      const { rows } = await client.query("SELECT count(*)::int AS n FROM journal_entries WHERE company_id = $1", [b.companyId]);
      expect(rows[0].n).toBe(0);
    }));
});

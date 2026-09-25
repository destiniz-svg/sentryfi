/**
 * Money moving between the bank and the tins, against a real Postgres.
 *
 * The property that matters: a transfer changes two balances by the same
 * amount in opposite directions, the balances are only ever read from journal
 * lines, and a phone that sends the same transfer twice moves the money once.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity, postEntry } from "../src/ledger/post";
import { openBox } from "../src/ledger/cash";
import { places, openBank, setNumber, editBank, archiveBank, restoreBank, archivedBanks, transfer, importStatement } from "../src/ledger/bank";
import { recordRate } from "../src/ledger/fx";
import * as rec from "../src/ledger/reconcile";

afterAll(closePool);

/** A company whose bank holds MVR 10,000.00, with a tin and a second bank account. */
async function aBusiness(client) {
  const { companyId, userId, accounts } = await aCompanyWith(client);
  await assumeIdentity(client, { companyId, userId });

  await postEntry(client, {
    companyId,
    userId,
    date: "2026-09-01",
    source: "opening_balance",
    narrative: "Bank at the start",
    lines: [
      { accountId: accounts.bank, debit: "10,000.00" },
      { accountId: accounts.payable, credit: "10,000.00" },
    ],
  });
  const box = await openBox(client, { companyId, userId, name: "Maalhos Site" });
  const second = await openBank(client, { companyId, name: "BML USD" });
  return { companyId, userId, accounts, box, second };
}

const balanceOf = async (client, companyId, id) =>
  (await places(client, { companyId })).find((p) => p.id === id).balance;

describe("bank accounts and transfers", () => {
  it("reads a dollar statement in dollars, and posts each line at its day's rate", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await aBusiness(client);
      const usd = await openBank(client, { companyId, name: "Wise USD", currency: "USD" });
      await recordRate(client, { companyId, userId, currency: "USD", on: "2026-09-01", rate: "15.42" });
      const text = ["TransferWise ID,Date,Amount,Currency,Description,Running Balance", "T-1,02-09-2026,-1250.00,USD,Design fee,3750.00", "T-2,01-08-2026,-10.00,USD,Card fee,5000.00"].join(String.fromCharCode(10));
      await importStatement(client, { companyId, userId, accountId: usd.id, text });
      const { rows } = await client.query("SELECT id, debit_laari::text AS d FROM bank_statement_lines WHERE account_id = $1 ORDER BY posted_on DESC", [usd.id]);
      expect(rows[0].d).toBe("125000"); // kept in cents, as the statement says
      const done = await rec.post(client, { companyId, userId, lineId: rows[0].id, accountId: accounts.expense, note: "Design" });
      const { rows: lines } = await client.query("SELECT credit_laari::text AS c, trim(currency) AS cur, amount_fc::text AS fc FROM journal_lines WHERE entry_id = $1 AND account_id = $2", [done.entryId, usd.id]);
      expect(lines[0]).toEqual({ c: "1927500", cur: "USD", fc: "125000" }); // USD 1,250.00 at 15.42
      // Before any rate was recorded, it asks for one rather than guessing.
      await expect(rec.post(client, { companyId, userId, lineId: rows[1].id, accountId: accounts.expense })).rejects.toThrow(/no USD rate/);
    }));

  it("holds several accounts at one bank in one currency, told apart by number", () =>
    inRollback(async (client) => {
      const { companyId } = await aBusiness(client);
      const a = await openBank(client, { companyId, name: "BML MVR", accountNo: "7730 0000 1111" });
      const b = await openBank(client, { companyId, name: "BML MVR", accountNo: "7730000022 22" });
      expect([a.name, b.name]).toEqual(["BML MVR", "BML MVR ··2222"]);
      expect((await openBank(client, { companyId, name: "BML MVR" })).name).toBe("BML MVR 2");
      expect((await openBank(client, { companyId, name: "bml mvr" })).name).toBe("bml mvr 3");
      await openBank(client, { companyId, name: "MIB" });
      expect((await openBank(client, { companyId, name: "MIB", currency: "USD" })).name).toBe("MIB USD");
      expect((await openBank(client, { companyId, name: "MIB", currency: "USD" })).name).toBe("MIB USD 2");
      await expect(openBank(client, { companyId, name: "Payroll", accountNo: "773000001111" })).rejects.toThrow(/already here/);
      expect((await places(client, { companyId })).find((p) => p.id === b.id).bank_account_no).toBe("773000002222");
    }));

  it("archives an empty bank account, keeps one with money, and brings it back", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts, second } = await aBusiness(client);
      await expect(archiveBank(client, { companyId, accountId: accounts.bank })).rejects.toThrow(/stays/);
      await transfer(client, { companyId, userId, fromId: accounts.bank, toId: second.id, amount: "100.00", on: "2026-09-02" });
      await expect(archiveBank(client, { companyId, accountId: second.id })).rejects.toThrow(/still has money/);
      await transfer(client, { companyId, userId, fromId: second.id, toId: accounts.bank, amount: "100.00", on: "2026-09-03" });
      await archiveBank(client, { companyId, accountId: second.id });
      expect((await places(client, { companyId })).some((p) => p.id === second.id)).toBe(false);
      expect((await archivedBanks(client, { companyId })).map((a) => a.id)).toEqual([second.id]);
      await restoreBank(client, { companyId, accountId: second.id });
      expect((await places(client, { companyId })).some((p) => p.id === second.id)).toBe(true);
    }));

  it("edits an account only while nothing is recorded in it", () =>
    inRollback(async (client) => {
      const { companyId, accounts } = await aBusiness(client);
      const typo = await openBank(client, { companyId, name: "BML MVR", accountNo: "7730000011111" });
      const fixed = await editBank(client, { companyId, accountId: typo.id, name: "BML USD ··1112", currency: "usd", accountNo: "7730000011112" });
      expect(fixed).toMatchObject({ name: "BML USD ··1112", currency: "USD", accountNo: "7730000011112" });
      expect((await places(client, { companyId })).find((p) => p.id === typo.id).untouched).toBe(true);
      // The opening entry put money in this one, so it stays as it is.
      await expect(editBank(client, { companyId, accountId: accounts.bank, name: "Renamed", accountNo: "7730000099999" })).rejects.toThrow(/has records/);
    }));

  it("gives an account opened without a number its number, once", () =>
    inRollback(async (client) => {
      const { companyId, second } = await aBusiness(client);
      await setNumber(client, { companyId, accountId: second.id, accountNo: "7730-0000-99999" });
      expect((await places(client, { companyId })).find((p) => p.id === second.id).bank_account_no).toBe("7730000099999");
      await expect(openBank(client, { companyId, name: "Other", accountNo: "773000009999 9" })).rejects.toThrow(/already here/);
      await expect(setNumber(client, { companyId, accountId: second.id, accountNo: " " })).rejects.toThrow(/account number/);
    }));

  it("opens a second bank account under 11xx, at nothing", () =>
    inRollback(async (client) => {
      const { companyId, second } = await aBusiness(client);
      expect(second.code).toBe("1111");
      expect(await balanceOf(client, companyId, second.id)).toBe(0n);
    }));

  it("moves money bank to tin and back, and the two balances always sum the same", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts, box } = await aBusiness(client);
      const args = { companyId, userId, fromId: accounts.bank, toId: box.account_id };

      await transfer(client, { ...args, amount: "2,500.00", note: "Sand and labour" });
      expect(await balanceOf(client, companyId, accounts.bank)).toBe(750_000n);
      expect(await balanceOf(client, companyId, box.account_id)).toBe(250_000n);

      await transfer(client, { ...args, fromId: box.account_id, toId: accounts.bank, amount: "500.50" });
      expect(await balanceOf(client, companyId, accounts.bank)).toBe(800_050n);
      expect(await balanceOf(client, companyId, box.account_id)).toBe(199_950n);
    }));

  it("moves the money once when the same attempt arrives twice", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts, box } = await aBusiness(client);
      const ref = "5b1a7c1e-4b0e-4f57-9f0e-2a4d5c6b7a89";
      const args = { companyId, userId, fromId: accounts.bank, toId: box.account_id, amount: "100", clientRef: ref };

      const first = await transfer(client, args);
      const again = await transfer(client, args);
      expect(first.alreadyHad).toBe(false);
      expect(again.alreadyHad).toBe(true);
      expect(again.entry.id).toBe(first.entry.id);
      expect(await balanceOf(client, companyId, box.account_id)).toBe(10_000n);
    }));

  it("refuses the same place twice, nothing, and accounts that are not cash", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts, box } = await aBusiness(client);
      const base = { companyId, userId, fromId: accounts.bank, toId: box.account_id, amount: "10" };

      await expect(transfer(client, { ...base, toId: accounts.bank })).rejects.toThrow(/same place/);
      await expect(transfer(client, { ...base, amount: "0" })).rejects.toThrow(/How much/);
      await expect(transfer(client, { ...base, toId: accounts.expense })).rejects.toThrow(/only be moved between/);
    }));
});

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
import { places, openBank, transfer, importStatement } from "../src/ledger/bank";

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
  it("will not read a statement into a dollar account as rufiyaa", () =>
    inRollback(async (client) => {
      const { companyId, userId } = await aBusiness(client);
      const usd = await openBank(client, { companyId, name: "BML USD current", currency: "USD" });
      await expect(importStatement(client, { companyId, userId, accountId: usd.id, text: "anything" })).rejects.toThrow(/USD account cannot be read yet/);
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

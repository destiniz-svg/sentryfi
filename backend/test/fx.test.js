/**
 * Another currency, against a real Postgres.
 *
 * The properties that matter: every line still balances in rufiyaa, a line in
 * dollars keeps the dollars and the rate it was recorded at, and a rate
 * recorded later never moves a figure already in the books.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity, postEntry, reverseEntry } from "../src/ledger/post";
import { exposures } from "../src/ledger/revalue";
import { postBill } from "../src/ledger/bills";
import { places, openBank, transfer } from "../src/ledger/bank";
import { toBase, rateBetween, rateOn, recordRate } from "../src/ledger/fx";

afterAll(closePool);

describe("conversion", () => {
  it("converts exactly and rounds half up once", () => {
    expect(toBase(10_000n, "15.42")).toBe(154_200n); // USD 100.00 -> MVR 1,542.00
    expect(toBase(1n, "15.425")).toBe(15n); // 15.425 -> 15
    expect(toBase(3n, "15.425")).toBe(46n); // 46.275 -> 46
    expect(rateBetween(154_200n, 10_000n)).toBe("15.42000000");
    expect(() => toBase(1n, "abc")).toThrow();
  });
});

async function aBusiness(client) {
  const { companyId, userId, accounts } = await aCompanyWith(client);
  await assumeIdentity(client, { companyId, userId });
  await postEntry(client, {
    companyId, userId, date: "2026-09-01", source: "opening_balance", narrative: "Bank at the start",
    lines: [
      { accountId: accounts.bank, debit: "100,000.00" },
      { accountId: accounts.payable, credit: "100,000.00" },
    ],
  });
  return { companyId, userId, accounts };
}

describe("a bill in dollars", () => {
  it("posts rufiyaa that balance, keeps the dollars, and does not move when a new rate arrives", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await aBusiness(client);
      const { rows: party } = await client.query(
        `INSERT INTO counterparties (company_id, name, kind) VALUES ($1,'Overseas Supplier','{supplier}') RETURNING id`,
        [companyId]
      );
      // USD 1,000.00 + 8% at 15.42: net 15,420.00, tax 1,233.60, gross 16,653.60.
      const { rows } = await client.query(
        `INSERT INTO bills (company_id, counterparty_id, bill_no, issue_date, net_laari, tax_laari, gross_laari,
                            gst_treatment, gst_rate_bp, status, currency, fx_rate, fc_net, fc_tax, fc_gross)
         VALUES ($1,$2,'US-1','2026-09-10',1542000,123360,1665360,'exclusive',800,'draft','USD','15.42',100000,8000,108000)
         RETURNING id`,
        [companyId, party[0].id]
      );
      const done = await postBill(client, {
        companyId, userId, billId: rows[0].id,
        accounts: { expense: accounts.expense, payable: accounts.payable, taxReclaimable: accounts.taxReclaimable },
      });

      const read = async () =>
        (await client.query(
          `SELECT debit_laari::bigint AS d, credit_laari::bigint AS c, trim(currency) AS cur, amount_fc::bigint AS fc, fx_rate::text AS rate
             FROM journal_lines WHERE entry_id = $1 ORDER BY debit_laari DESC, credit_laari DESC`,
          [done.entry.id]
        )).rows;
      const lines = await read();
      const debits = lines.reduce((s, l) => s + BigInt(l.d), 0n);
      const credits = lines.reduce((s, l) => s + BigInt(l.c), 0n);
      expect(debits).toBe(credits);
      expect(credits).toBe(1_665_360n);
      expect(lines.every((l) => l.cur === "USD" && Number(l.rate) === 15.42)).toBe(true);
      expect(lines.map((l) => String(l.fc)).sort()).toEqual(["100000", "108000", "8000"]);

      await recordRate(client, { companyId, userId, currency: "USD", on: "2026-09-11", rate: "15.50" });
      expect((await rateOn(client, { companyId, currency: "USD", on: "2026-09-30" })).rate).toBe("15.5");
      expect(await rateOn(client, { companyId, currency: "USD", on: "2026-09-10" })).toBe(null);
      expect(await read()).toEqual(lines);

      // Reversed, it is owed in dollars no more: nothing left to revalue.
      await reverseEntry(client, { companyId, userId, entryId: done.entry.id, reason: "entered twice", date: "2026-09-12" });
      const left = await exposures(client, { companyId, on: "2026-09-30" });
      expect(left.every((x) => x.fc === 0n && x.carried === 0n)).toBe(true);
    }));
});

describe("a dollar bank account", () => {
  it("moves rufiyaa and dollars together and reads both balances", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await aBusiness(client);
      const usd = await openBank(client, { companyId, name: "BML USD", currency: "usd" });
      expect(usd.currency.trim()).toBe("USD");

      await transfer(client, { companyId, userId, fromId: accounts.bank, toId: usd.id, amount: "15,420.00", amountFc: "1,000.00", on: "2026-09-10" });
      await transfer(client, { companyId, userId, fromId: usd.id, toId: accounts.bank, amount: "3,100.00", amountFc: "200.00", on: "2026-09-11" });

      expect((await rateOn(client, { companyId, currency: "USD" })).rate).toBe("15.5");
      const usdNow = (await places(client, { companyId })).find((p) => p.id === usd.id);
      expect(usdNow.foreign).toBe(true);
      expect(usdNow.balanceFc).toBe(80_000n);
      expect(usdNow.balance).toBe(1_232_000n);

      await expect(transfer(client, { companyId, userId, fromId: accounts.bank, toId: usd.id, amount: "10" }))
        .rejects.toThrow(/How much in USD/);
      const eur = await openBank(client, { companyId, name: "Euro account", currency: "EUR" });
      await expect(transfer(client, { companyId, userId, fromId: usd.id, toId: eur.id, amount: "10", amountFc: "1" }))
        .rejects.toThrow(/one step at a time/);
    }));
});

/**
 * A tin with a float, against a real Postgres.
 *
 * The property that matters: what the office puts back is exactly what was
 * spent, so after reimbursing the tin holds its float again, and a request
 * the holder had open is answered by that payment rather than paid twice.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity, postEntry } from "../src/ledger/post";
import { openBox, spend, askTopup, give, receive, boxBalance } from "../src/ledger/cash";

afterAll(closePool);

describe("a tin with a float", () => {
  it("is put back to its float by reimbursing exactly what was spent", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await aCompanyWith(client);
      await assumeIdentity(client, { companyId, userId });
      await postEntry(client, {
        companyId, userId, date: "2026-09-01", source: "opening_balance", narrative: "Bank",
        lines: [
          { accountId: accounts.bank, debit: "50,000.00" },
          { accountId: accounts.payable, credit: "50,000.00" },
        ],
      });

      const box = await openBox(client, { companyId, userId, name: "Maalhos site", float: "5,000.00" });
      expect(String(box.float_laari)).toBe("500000");
      const first = await give(client, { companyId, userId, boxId: box.id, amount: "5,000.00", fromAccountId: accounts.bank });
      // Handed over is not in the tin until the holder says they have it.
      expect(await boxBalance(client, { companyId, accountId: box.account_id })).toBe(0n);
      await expect(receive(client, { companyId, userId, topupId: first.topup.id, received: "4,900.00" }))
        .rejects.toThrow(/why it was different/);
      await receive(client, { companyId, userId, topupId: first.topup.id });
      expect(await boxBalance(client, { companyId, accountId: box.account_id })).toBe(500_000n);
      await expect(receive(client, { companyId, userId, topupId: first.topup.id })).rejects.toThrow(/already confirmed/);

      await spend(client, { companyId, userId, boxId: box.id, amount: "1,200.00", what: "Sand", accountId: accounts.expense });
      const held = await boxBalance(client, { companyId, accountId: box.account_id });
      expect(held).toBe(380_000n);
      const owed = BigInt(box.float_laari) - held;
      expect(owed).toBe(120_000n);

      await askTopup(client, { companyId, userId, boxId: box.id, amount: "1,000.00" });
      const back = await give(client, { companyId, userId, boxId: box.id, amount: "1,200.00", fromAccountId: accounts.bank });
      await receive(client, { companyId, userId, topupId: back.topup.id });
      expect(await boxBalance(client, { companyId, accountId: box.account_id })).toBe(500_000n);
      const { rows } = await client.query(
        "SELECT count(*)::int AS n FROM cash_topups WHERE box_id = $1 AND status = 'asked'", [box.id]
      );
      expect(rows[0].n).toBe(0);
    }));

  it("goes below zero when the holder pays out of their own pocket", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await aCompanyWith(client);
      await assumeIdentity(client, { companyId, userId });
      const box = await openBox(client, { companyId, userId, name: "Empty tin", float: "1,000.00" });
      await spend(client, { companyId, userId, boxId: box.id, amount: "350.00", what: "Boat fare", accountId: accounts.expense });
      const held = await boxBalance(client, { companyId, accountId: box.account_id });
      expect(held).toBe(-35_000n);
      // Owed back: the float, plus what they paid themselves.
      expect(BigInt(box.float_laari) - held).toBe(135_000n);
    }));
});

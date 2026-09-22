/**
 * Money borrowed. The properties: every schedule clears the loan to the laari;
 * a flat rate is shown for what it really costs; a repayment always splits
 * into what reduced the debt and what it cost; and the lender's own figure for
 * the interest wins when a person gives it.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity, postEntry } from "../src/ledger/post";
import { schedule, effectiveRate, create, repay, list } from "../src/ledger/loans";
import { register } from "../src/ledger/assets";
import { balanceSheet, profitAndLoss } from "../src/ledger/statements";

afterAll(closePool);

const bankLoan = { principal_laari: "12000000", rate_bp: 1200, rate_basis: "reducing", method: "annuity", term_months: 12, first_due: "2026-02-01" };

describe("a schedule", () => {
  it("equal instalments: the first is mostly interest, and it clears to the laari", () => {
    const s = schedule(bankLoan);
    expect(s).toHaveLength(12);
    expect(s[0].interest).toBe(120000n); // 1% of 120,000.00
    expect(s[0].due).toBe("2026-02-01");
    expect(s[11].due).toBe("2027-01-01");
    expect(s.reduce((t, r) => t + r.principal, 0n)).toBe(12000000n);
    expect(s[11].closing).toBe(0n);
    // Every instalment but the last is the same.
    expect(new Set(s.slice(0, 11).map((r) => r.payment)).size).toBe(1);
    expect(s[11].interest).toBeLessThan(s[0].interest);
  });

  it("equal principal: the same off the debt each month, falling instalments", () => {
    const s = schedule({ ...bankLoan, method: "equal_principal" });
    expect(s[0].principal).toBe(1000000n);
    expect(s[0].payment).toBe(1120000n);
    expect(s[11].payment).toBe(1010000n);
    expect(s.reduce((t, r) => t + r.principal, 0n)).toBe(12000000n);
  });

  it("a flat rate: interest on the whole sum, and what it really costs is said", () => {
    const flat = { principal_laari: "10000000", rate_bp: 600, rate_basis: "flat", method: "annuity", term_months: 36, first_due: "2026-02-01" };
    const s = schedule(flat);
    expect(s.reduce((t, r) => t + r.interest, 0n)).toBe(1800000n); // 6% x 3 years on 100,000.00
    expect(s.reduce((t, r) => t + r.principal, 0n)).toBe(10000000n);
    const eff = effectiveRate(flat);
    expect(eff).toBeGreaterThan(10.5);
    expect(eff).toBeLessThan(11.5);
  });

  it("a director loan with no terms has no schedule", () => {
    expect(schedule({ principal_laari: "500000", method: "none" })).toEqual([]);
  });

  it("the end of a month rolls to the end of a shorter one", () => {
    const s = schedule({ ...bankLoan, first_due: "2026-01-31", term_months: 3 });
    expect(s.map((r) => r.due)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });
});

async function books(client) {
  const c = await aCompanyWith(client);
  await assumeIdentity(client, { companyId: c.companyId, userId: c.userId });
  return c;
}

describe("borrowing, against the books", () => {
  it("draws down net of the fee, and each repayment splits interest from the debt", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await books(client);
      const loan = await create(client, {
        companyId, userId, name: "BML term loan", kind: "bank_term", principal: "120,000.00", ratePct: 12,
        rateBasis: "reducing", method: "annuity", termMonths: 12, startsOn: "2026-01-01", fee: "1,000.00", intoAccountId: accounts.bank,
      });
      expect(loan.account.code).toBe("2411");

      // Thirty-one days on 120,000.00 at 12% is 1,223.01 of interest.
      const first = await repay(client, { companyId, userId, loanId: loan.id, on: "2026-02-01", amount: "10,661.85", fromAccountId: accounts.bank });
      expect(first.cost).toBe(122301n);
      expect(first.principal).toBe(1066185n - 122301n);

      // The bank's statement says otherwise; it wins.
      const second = await repay(client, { companyId, userId, loanId: loan.id, on: "2026-03-01", amount: "10,661.85", fromAccountId: accounts.bank, interest: "1,100.00" });
      expect(second.cost).toBe(110000n);

      const [row] = await list(client, { companyId });
      expect(row.payments).toBe(2);
      expect(row.paidInterest).toBe("2,323.01");

      const pl = await profitAndLoss(client, { companyId, from: "2026-01-01", to: "2026-12-31" });
      expect(pl.totalExpenses).toBe(100000n + 122301n + 110000n); // the fee and the two interests, never the debt
      const bs = await balanceSheet(client, { companyId, asAt: "2026-12-31" });
      expect(bs.difference).toBe(0n);
      const owed = bs.liabilities.find((l) => l.code === "2411");
      expect(owed.amount).toBe(12000000n - (1066185n - 122301n) - (1066185n - 110000n));

      await expect(repay(client, { companyId, userId, loanId: loan.id, on: "2026-04-01", amount: "200,000.00", fromAccountId: accounts.bank, interest: "0" }))
        .rejects.toThrow(/more than is still owed/);
    }));

  it("hire purchase: the asset is paid for by the loan, and the loan is what is owed", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await books(client);
      const hp = await create(client, {
        companyId, userId, name: "Pickup on HP", kind: "hire_purchase", principal: "60,000.00", ratePct: 8,
        rateBasis: "flat", method: "annuity", termMonths: 24, startsOn: "2026-01-15",
      });
      expect(hp.entryNo).toBeNull();
      await register(client, {
        companyId, userId, name: "Pickup", category: "vehicles", cost: "60,000.00", acquiredOn: "2026-01-15",
        lifeYears: 5, fromAccountId: hp.account.id,
      });
      const [row] = await list(client, { companyId });
      expect(row.owed).toBe("60,000.00");
      expect(row.effectivePct).toBeGreaterThan(14);
      // A flat loan's interest per instalment is fixed when it is made.
      const paid = await repay(client, { companyId, userId, loanId: hp.id, on: "2026-02-15", amount: row.next.payment, fromAccountId: accounts.bank });
      expect(paid.cost).toBe(40000n); // 60,000.00 x 8% x 2 years / 24
    }));

  it("a director who owes the business: repaying is money in, not income", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await books(client);
      await postEntry(client, {
        companyId, userId, date: "2026-01-01", source: "opening_balance", narrative: "Bank",
        lines: [{ accountId: accounts.bank, debit: "50,000.00" }, { accountId: accounts.payable, credit: "50,000.00" }],
      });
      const out = await create(client, {
        companyId, userId, name: "Director Ahmed", kind: "director_out", principal: "20,000.00", method: "none", startsOn: "2026-01-10", intoAccountId: accounts.bank,
      });
      expect(out.account.code).toBe("1611");
      const back = await repay(client, { companyId, userId, loanId: out.id, on: "2026-03-01", amount: "5,000.00", fromAccountId: accounts.bank });
      expect(back.cost).toBe(0n);
      expect(back.owedAfter).toBe(1500000n);
      const pl = await profitAndLoss(client, { companyId, from: "2026-01-01", to: "2026-12-31" });
      expect(pl.totalIncome).toBe(0n);
    }));
});

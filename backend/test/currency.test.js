/**
 * Invoices in dollars, dollars received, and month-end revaluation.
 *
 * The properties: a dollar invoice is carried at its own rate; paid at a
 * better rate, the difference is an exchange gain on its own line and the
 * invoice is settled exactly; what is still open at a month end is restated at
 * that month's rate, once; the GST owed never moves with the rate; and the
 * books balance throughout.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import * as sales from "../src/ledger/sales";
import { preview, revalue } from "../src/ledger/revalue";
import { balanceSheet, profitAndLoss } from "../src/ledger/statements";

afterAll(closePool);

async function books(client) {
  const c = await aCompanyWith(client);
  await assumeIdentity(client, { companyId: c.companyId, userId: c.userId });
  const add = async (code, name, type, currency = "MVR") =>
    (await client.query("INSERT INTO accounts (company_id, code, name, type, currency) VALUES ($1,$2,$3,$4,$5) RETURNING id", [c.companyId, code, name, type, currency])).rows[0].id;
  c.accounts.receivable = await add("1300", "Money owed to us", "asset");
  c.accounts.gst = await add("2200", "GST we owe", "liability");
  c.accounts.work = await add("4100", "Work invoiced", "income");
  c.accounts.usd = await add("1111", "BML USD", "asset", "USD");
  const { rows } = await client.query("INSERT INTO counterparties (company_id, name, kind) VALUES ($1,'Resort Pvt Ltd','{customer}') RETURNING id", [c.companyId]);
  c.customer = rows[0].id;
  return c;
}

describe("a dollar invoice", () => {
  it("is carried at its rate, and paid at a better one the gain is said", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts, customer } = await books(client);
      const { invoice } = await sales.raise(client, {
        companyId, userId, counterpartyId: customer, issueDate: "2026-03-10", gstTreatment: "exclusive", gstRateBp: 800,
        currency: "USD", fxRate: "15.40", lines: [{ description: "Survey", amount: "1,000.00" }],
      });
      expect(invoice.fc_gross).toBe("108000"); // USD 1,080.00 with 8% GST
      expect(invoice.gross_laari).toBe("1663200"); // MVR 16,632.00 at 15.40
      await sales.post(client, { companyId, userId, invoiceId: invoice.id });

      // Paid in full on a day the dollar bought 15.42.
      const r = await sales.receive(client, {
        companyId, userId, counterpartyId: customer, accountId: accounts.usd, receivedOn: "2026-04-05",
        currency: "USD", amountFc: "1,080.00", rate: "15.42", allocations: [{ invoiceId: invoice.id, amountFc: "1,080.00" }],
      });
      expect(r.exchange).toBe(2160n); // 1,080 x 0.02 = MVR 21.60
      const pl = await profitAndLoss(client, { companyId, from: "2026-01-01", to: "2026-12-31" });
      expect(pl.income.find((i) => i.code === "4920").amount).toBe(2160n);
      expect(pl.income.find((i) => i.code === "4100").amount).toBe(1540000n); // the work stays at its own rate

      const bs = await balanceSheet(client, { companyId, asAt: "2026-12-31" });
      expect(bs.difference).toBe(0n);
      expect(bs.assets.find((a) => a.code === "1300")).toBeUndefined(); // settled exactly
      expect(bs.liabilities.find((l) => l.code === "2200").amount).toBe(123200n); // GST at the invoice rate, untouched

      await expect(
        sales.receive(client, { companyId, userId, accountId: accounts.usd, currency: "USD", amountFc: "10.00", rate: "15.42", allocations: [{ invoiceId: invoice.id, amountFc: "10.00" }] })
      ).rejects.toThrow(/more than/);
    }));

  it("can not be settled in rufiyaa without saying the dollars", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts, customer } = await books(client);
      const { invoice } = await sales.raise(client, {
        companyId, userId, counterpartyId: customer, issueDate: "2026-03-10", gstTreatment: "none_unregistered",
        currency: "USD", fxRate: "15.40", lines: [{ description: "Survey", amount: "100.00" }],
      });
      await sales.post(client, { companyId, userId, invoiceId: invoice.id });
      await expect(
        sales.receive(client, { companyId, userId, accountId: accounts.bank, amount: "1,540.00", allocations: [{ invoiceId: invoice.id, amount: "1,540.00" }] })
      ).rejects.toThrow(/is in USD/);
    }));
});

describe("month-end revaluation", () => {
  it("restates what is still open at the month's rate, once", () =>
    inRollback(async (client) => {
      const { companyId, userId, customer } = await books(client);
      const { invoice } = await sales.raise(client, {
        companyId, userId, counterpartyId: customer, issueDate: "2026-03-10", gstTreatment: "none_unregistered",
        currency: "USD", fxRate: "15.40", lines: [{ description: "Survey", amount: "1,000.00" }],
      });
      await sales.post(client, { companyId, userId, invoiceId: invoice.id });

      const before = await preview(client, { companyId, through: "2026-03-31" });
      expect(before.missing).toEqual(["USD"]);

      const r = await revalue(client, { companyId, userId, through: "2026-03-15", rates: { USD: "15.45" } });
      expect(r.on).toBe("2026-03-31");
      expect(r.net).toBe(5000n); // USD 1,000 owed to us is worth MVR 50.00 more

      const again = await revalue(client, { companyId, userId, through: "2026-03-31" });
      expect(again.entryNo).toBeNull();

      // April, the dollar weakens: the gain comes back out.
      const april = await revalue(client, { companyId, userId, through: "2026-04-30", rates: { USD: "15.38" } });
      expect(april.net).toBe(-7000n);

      const bs = await balanceSheet(client, { companyId, asAt: "2026-04-30" });
      expect(bs.difference).toBe(0n);
      expect(bs.assets.find((a) => a.code === "1300").amount).toBe(1538000n);
    }));
});

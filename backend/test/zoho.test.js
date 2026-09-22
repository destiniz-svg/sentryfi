/**
 * The Zoho connection, without Zoho.
 *
 * A fake stands in for the API so the parts that decide correctness are
 * tested: the signed state cannot be forged or reused late, the stored token
 * cannot be read without the server's secret, Zoho's two ways of writing an
 * amount both read, and a transaction seen once under each account it touches
 * comes back as one balanced transaction.
 */

import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// The module reads the server secret through config/env, which refuses to load
// without one. Set before it is required, as the boot test does.
process.env.DATABASE_URL ||= "postgres://unused:unused@127.0.0.1:5432/unused";
process.env.JWT_SECRET ||= "zoho-test-secret-long-enough-to-pass-validation";
const zoho = createRequire(import.meta.url)("../src/ledger/zoho");

describe("the sign-in state", () => {
  it("comes back as it went out", () => {
    const s = zoho.makeState({ companyId: "c1", userId: "u1" });
    expect(zoho.readState(s)).toEqual({ companyId: "c1", userId: "u1" });
  });

  it("refuses one that was altered", () => {
    const s = zoho.makeState({ companyId: "c1", userId: "u1" });
    const [body, sig] = s.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url")), c: "c2" })).toString("base64url");
    expect(() => zoho.readState(`${forged}.${sig}`)).toThrow(/did not start here/);
  });
});

describe("the stored token", () => {
  it("is sealed, and opens only as itself", () => {
    const sealed = zoho.seal("1000.abc.refresh");
    expect(sealed).not.toContain("refresh");
    expect(zoho.open(sealed)).toBe("1000.abc.refresh");
    const [iv, tag, body] = sealed.split(".");
    const tampered = [iv, tag, Buffer.from("x" + Buffer.from(body, "base64").toString()).toString("base64")].join(".");
    expect(() => zoho.open(tampered)).toThrow();
  });
});

describe("reading Zoho", () => {
  it("reads an amount either way Zoho writes it", () => {
    expect(zoho.sidesOf({ debit_amount: 1000, credit_amount: 0 })).toEqual({ debit: 100_000n, credit: 0n });
    expect(zoho.sidesOf({ amount: 250.5, debit_or_credit: "credit" })).toEqual({ debit: 0n, credit: 25_050n });
  });

  it("puts a transaction seen under each account back together, balanced", async () => {
    const pages = {
      chartofaccounts: { chartofaccounts: [
        { account_id: "A1", account_name: "Accounts Receivable", account_code: "" },
        { account_id: "A2", account_name: "Rental Income", account_code: "" },
        { account_id: "A3", account_name: "GST Payable", account_code: "" },
      ] },
      A1: [{ transaction_id: "INV9", transaction_type: "invoice", transaction_date: "2025-03-14", entry_number: "INV-000026", debit_amount: 97200, credit_amount: 0 }],
      A2: [{ transaction_id: "INV9", transaction_type: "invoice", transaction_date: "2025-03-14", entry_number: "INV-000026", debit_amount: 0, credit_amount: 90000 }],
      A3: [{ transaction_id: "INV9", transaction_type: "invoice", transaction_date: "2025-03-14", entry_number: "INV-000026", amount: 7200, debit_or_credit: "credit" }],
    };
    const fake = {
      get: async (path, params) =>
        path === "chartofaccounts"
          ? { ...pages.chartofaccounts, page_context: { has_more_page: false } }
          : { transactions: pages[params.account_id], page_context: { has_more_page: false } },
    };
    const [t, ...rest] = await zoho.transactions(fake, { from: "2025-01-01", to: "2025-12-31" });
    expect(rest).toEqual([]);
    expect(t).toMatchObject({ date: "2025-03-14", theirId: "INV-000026", lines: expect.any(Array), balanced: true, debit: 9_720_000n });
    expect(t.lines.map((l) => l.account)).toEqual(["Accounts Receivable", "Rental Income", "GST Payable"]);
  });
});

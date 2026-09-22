/**
 * The tax engine, against a real Postgres.
 *
 * What matters: a document gets the rate in force on its own date, the rate
 * it got is kept on it, and changing a rate from a date touches nothing dated
 * before. A second pack exists and runs on the same arithmetic.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import { rateOn, rateForDocument, setRate, overview } from "../src/ledger/tax";
import { raise } from "../src/ledger/sales";
import { splitTax } from "../src/ledger/bills";

afterAll(closePool);

async function aSeller(client, { pack } = {}) {
  const { companyId, userId } = await aCompanyWith(client);
  if (pack) await client.query("UPDATE companies SET tax_pack = $2 WHERE id = $1", [companyId, pack]);
  await client.query(
    `INSERT INTO accounts (company_id, code, name, type) VALUES
       ($1,'1300','Money owed to us','asset'), ($1,'2200','GST we owe','liability'), ($1,'4100','Work invoiced','income')`,
    [companyId]
  );
  await assumeIdentity(client, { companyId, userId });
  const invoice = (issueDate, extra = {}) =>
    raise(client, {
      companyId, userId, issueDate, gstTreatment: "exclusive",
      lines: [{ description: "Excavator, one day", quantity: 1, unitPrice: "1000.00" }],
      ...extra,
    });
  return { companyId, userId, base: { companyId, userId }, invoice };
}

describe("the Maldives pack", () => {
  it("knows the general rate on either side of the 2023 change", () =>
    inRollback(async (client) => {
      const s = await aSeller(client);
      expect((await rateOn(client, { ...s.base, on: "2022-12-31" })).bp).toBe(600);
      expect((await rateOn(client, { ...s.base, on: "2023-01-01" })).bp).toBe(800);
    }));

  it("knows tourism GST went to 17% on 1 July 2025", () =>
    inRollback(async (client) => {
      const s = await aSeller(client);
      expect((await rateOn(client, { ...s.base, on: "2025-06-30", rate: "tourism" })).bp).toBe(1600);
      expect((await rateOn(client, { ...s.base, on: "2025-07-01", rate: "tourism" })).bp).toBe(1700);
    }));

  it("says so when no rate is known, rather than using zero", () =>
    inRollback(async (client) => {
      const s = await aSeller(client);
      await expect(rateOn(client, { ...s.base, on: "2010-01-01" })).rejects.toThrow(/No general gst rate is known/i);
    }));

  it("gives an invoice the rate of its own date, and keeps it on the invoice", () =>
    inRollback(async (client) => {
      const s = await aSeller(client);
      const old = await s.invoice("2022-06-01");
      const now = await s.invoice("2026-06-01");
      expect([old.invoice.gst_rate_bp, BigInt(old.invoice.tax_laari)]).toEqual([600, 6_000n]);
      expect([now.invoice.gst_rate_bp, BigInt(now.invoice.tax_laari)]).toEqual([800, 8_000n]);
    }));

  it("takes the rate printed on the paper over the table", () =>
    inRollback(async (client) => {
      const s = await aSeller(client);
      expect(await rateForDocument(client, { ...s.base, on: "2026-06-01", treatment: "exclusive", printedBp: 1700 })).toBe(1700);
      expect(await rateForDocument(client, { ...s.base, on: "2026-06-01", treatment: "none_unregistered" })).toBeNull();
    }));
});

describe("changing a rate from a date", () => {
  it("applies from that date on and leaves every earlier document as it was", () =>
    inRollback(async (client) => {
      const s = await aSeller(client);
      const before = await s.invoice("2026-06-01");

      await setRate(client, { ...s.base, bp: 1000, from: "2026-08-01", reason: "The law changed" });

      const after = await s.invoice("2026-08-15");
      const stillOld = await s.invoice("2026-07-31");
      expect(after.invoice.gst_rate_bp).toBe(1000);
      expect(stillOld.invoice.gst_rate_bp).toBe(800);

      const { rows } = await client.query("SELECT gst_rate_bp, tax_laari FROM sales_invoices WHERE id = $1", [before.invoice.id]);
      expect(rows[0]).toEqual({ gst_rate_bp: 800, tax_laari: "8000" });
    }));

  it("will not let a rate row be edited afterwards", () =>
    inRollback(async (client) => {
      const s = await aSeller(client);
      await setRate(client, { ...s.base, bp: 1000, from: "2026-08-01", reason: "x" });
      await expect(client.query("UPDATE tax_rates SET rate_bp = 1")).rejects.toThrow(/permission denied/);
    }));
});

describe("the generic pack", () => {
  it("has no rate until the company states one, then uses it the same way", () =>
    inRollback(async (client) => {
      const s = await aSeller(client, { pack: "GENERIC" });
      await expect(s.invoice("2026-06-01")).rejects.toThrow(/No standard rate rate is known|No standard rate/i);

      await setRate(client, { ...s.base, bp: 1250, from: "2026-01-01", reason: "Our VAT" });
      const inv = await s.invoice("2026-06-01");
      expect([inv.invoice.gst_rate_bp, BigInt(inv.invoice.tax_laari)]).toEqual([1250, 12_500n]);

      const o = await overview(client, { ...s.base, on: "2026-06-01" });
      expect(o.pack.code).toBe("GENERIC");
      expect(o.rates[0]).toMatchObject({ code: "standard", bp: 1250, source: "company" });
    }));
});

describe("the arithmetic", () => {
  it("is exact at a fractional rate", () => {
    expect(splitTax("1000.00", "exclusive", 850).tax).toBe(8_500n);
    expect(splitTax("1085.00", "inclusive", 850)).toEqual({ net: 100_000n, tax: 8_500n, gross: 108_500n });
  });
});

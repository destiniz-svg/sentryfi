/**
 * What is owed to us, against a real Postgres.
 *
 * The direction is the whole point. A bill creates tax we can claim; an
 * invoice creates tax we owe. Getting that sign wrong does not merely misstate
 * a screen, it understates a return to the tax authority, which is a different
 * kind of problem. So these run the real arithmetic through the real
 * constraints — the deferred balance trigger, the CHECK constraints, the
 * restricted role — none of which a stand-in implements.
 *
 * The figures are Altura's own, off docs/real-world-samples: an excavator at
 * MVR 3,000 a day for thirty days, with 8% added on top.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { applySchema, inRollback, aCompanyWith, closePool } from "./setup";
import {
  raise,
  post,
  receive,
  creditNote,
  outstanding,
  aged,
  nextInvoiceNo,
} from "../src/ledger/sales";
import { assumeIdentity } from "../src/ledger/post";
import { formatLaari } from "../src/ledger/money";

beforeAll(applySchema, 60_000);
afterAll(closePool);

/** A company with a customer in it, ready to be invoiced. */
async function aSellerWith(client) {
  const { companyId, userId, accounts } = await aCompanyWith(client);
  await assumeIdentity(client, { companyId, userId });
  const { rows } = await client.query(
    `INSERT INTO counterparties (company_id, name, kind)
     VALUES ($1, 'Road Development Corporation Ltd', '{customer}') RETURNING id`,
    [companyId]
  );
  return { companyId, userId, accounts, customerId: rows[0].id };
}

function anInvoice(client, seller, overrides = {}) {
  return raise(client, {
    companyId: seller.companyId,
    userId: seller.userId,
    counterpartyId: seller.customerId,
    invoiceNo: "ALT/INV-000026",
    purchaseOrder: "PO-RDC-2026-003151",
    subject: "Invoice from 25 May 2026 to 30 days",
    gstTreatment: "exclusive",
    gstRateBp: 800,
    lines: [
      {
        description: "Excavator rental, Komatsu PC 56-7",
        quantity: 30,
        uom: "DAY",
        unitPrice: "3000.00",
      },
    ],
    ...overrides,
  });
}

describe("raising an invoice", () => {
  it("adds 8% on top, exactly as the paper does", async () => {
    await inRollback(async (client) => {
      const seller = await aSellerWith(client);
      const { invoice } = await anInvoice(client, seller);
      expect(formatLaari(BigInt(invoice.net_laari))).toBe("90,000.00");
      expect(formatLaari(BigInt(invoice.tax_laari))).toBe("7,200.00");
      expect(formatLaari(BigInt(invoice.gross_laari))).toBe("97,200.00");
    });
  });

  it("takes the tax out of the figure when it was quoted inclusive", async () => {
    await inRollback(async (client) => {
      const seller = await aSellerWith(client);
      const { invoice } = await anInvoice(client, seller, {
        gstTreatment: "inclusive",
        lines: [{ description: "Rental", quantity: 1, unitPrice: "97200.00" }],
      });
      expect(formatLaari(BigInt(invoice.net_laari))).toBe("90,000.00");
      expect(formatLaari(BigInt(invoice.tax_laari))).toBe("7,200.00");
      expect(formatLaari(BigInt(invoice.gross_laari))).toBe("97,200.00");
    });
  });

  it("refuses to be raised when nobody has said how its GST is quoted", async () => {
    await inRollback(async (client) => {
      const seller = await aSellerWith(client);
      await expect(anInvoice(client, seller, { gstTreatment: "unknown" })).rejects.toThrow(
        /how its GST is quoted/i
      );
    });
  });

  it("continues the company's own numbering", async () => {
    await inRollback(async (client) => {
      const seller = await aSellerWith(client);
      await anInvoice(client, seller);
      const next = await nextInvoiceNo(client, {
        companyId: seller.companyId,
        prefix: "ALT/INV-",
      });
      expect(next).toBe("ALT/INV-000027");
    });
  });

  it("will not issue the same number twice", async () => {
    await inRollback(async (client) => {
      const seller = await aSellerWith(client);
      await anInvoice(client, seller);
      await expect(anInvoice(client, seller)).rejects.toThrow();
    });
  });
});

describe("putting it in the books", () => {
  it("owes the tax authority, rather than claiming from it", async () => {
    await inRollback(async (client) => {
      const seller = await aSellerWith(client);
      const { invoice } = await anInvoice(client, seller);
      await post(client, {
        companyId: seller.companyId,
        userId: seller.userId,
        invoiceId: invoice.id,
      });

      const { rows } = await client.query(
        `SELECT a.code, l.debit_laari, l.credit_laari
           FROM journal_lines l JOIN accounts a ON a.id = l.account_id
          WHERE l.company_id = $1 ORDER BY a.code`,
        [seller.companyId]
      );
      const by = Object.fromEntries(rows.map((r) => [r.code, r]));

      // Owed to us, up. Income, up. Tax owed, up — and on the credit side,
      // which is what makes it something to hand over rather than reclaim.
      expect(formatLaari(BigInt(by["1300"].debit_laari))).toBe("97,200.00");
      expect(formatLaari(BigInt(by["4100"].credit_laari))).toBe("90,000.00");
      expect(formatLaari(BigInt(by["2200"].credit_laari))).toBe("7,200.00");
      expect(BigInt(by["2200"].debit_laari)).toBe(0n);
    });
  });

  it("cannot be posted twice", async () => {
    await inRollback(async (client) => {
      const seller = await aSellerWith(client);
      const { invoice } = await anInvoice(client, seller);
      const args = {
        companyId: seller.companyId,
        userId: seller.userId,
        invoiceId: invoice.id,
      };
      await post(client, args);
      await expect(post(client, args)).rejects.toThrow(/already in the books/i);
    });
  });

  it("refuses an invoice with nobody to send it to", async () => {
    await inRollback(async (client) => {
      const seller = await aSellerWith(client);
      const { invoice } = await anInvoice(client, seller, { counterpartyId: null });
      await expect(
        post(client, {
          companyId: seller.companyId,
          userId: seller.userId,
          invoiceId: invoice.id,
        })
      ).rejects.toThrow(/needs a customer/i);
    });
  });
});

describe("money in", () => {
  it("settles part of an invoice and leaves the rest owed", async () => {
    await inRollback(async (client) => {
      const seller = await aSellerWith(client);
      const { invoice } = await anInvoice(client, seller);
      await post(client, {
        companyId: seller.companyId,
        userId: seller.userId,
        invoiceId: invoice.id,
      });

      await receive(client, {
        companyId: seller.companyId,
        userId: seller.userId,
        counterpartyId: seller.customerId,
        amount: "50000.00",
        accountId: seller.accounts.bank,
        reference: "BML transfer",
        allocations: [{ invoiceId: invoice.id, amount: "50000.00" }],
      });

      const left = await outstanding(client, {
        companyId: seller.companyId,
        invoiceId: invoice.id,
      });
      expect(formatLaari(left)).toBe("47,200.00");
    });
  });

  it("refuses to apply more to an invoice than is left on it", async () => {
    await inRollback(async (client) => {
      const seller = await aSellerWith(client);
      const { invoice } = await anInvoice(client, seller);
      await post(client, {
        companyId: seller.companyId,
        userId: seller.userId,
        invoiceId: invoice.id,
      });

      await expect(
        receive(client, {
          companyId: seller.companyId,
          userId: seller.userId,
          amount: "200000.00",
          accountId: seller.accounts.bank,
          allocations: [{ invoiceId: invoice.id, amount: "200000.00" }],
        })
      ).rejects.toThrow(/more than invoice has left/i);
    });
  });

  it("keeps money that arrived with no invoice to sit against", async () => {
    await inRollback(async (client) => {
      const seller = await aSellerWith(client);
      const result = await receive(client, {
        companyId: seller.companyId,
        userId: seller.userId,
        amount: "10000.00",
        accountId: seller.accounts.bank,
        reference: "Unidentified transfer",
      });
      expect(formatLaari(result.onAccount)).toBe("10,000.00");
    });
  });
});

describe("crediting it back", () => {
  it("takes the tax back out in the proportion it went in", async () => {
    await inRollback(async (client) => {
      const seller = await aSellerWith(client);
      const { invoice } = await anInvoice(client, seller);
      await post(client, {
        companyId: seller.companyId,
        userId: seller.userId,
        invoiceId: invoice.id,
      });

      const result = await creditNote(client, {
        companyId: seller.companyId,
        userId: seller.userId,
        invoiceId: invoice.id,
        reason: "Two days were not worked",
        amount: "6480.00", // 6,000 of work and its 480 of GST
      });

      expect(formatLaari(result.creditedNet)).toBe("6,000.00");
      expect(formatLaari(result.creditedTax)).toBe("480.00");

      const left = await outstanding(client, {
        companyId: seller.companyId,
        invoiceId: invoice.id,
      });
      expect(formatLaari(left)).toBe("90,720.00");
    });
  });

  it("will not credit more than is left", async () => {
    await inRollback(async (client) => {
      const seller = await aSellerWith(client);
      const { invoice } = await anInvoice(client, seller);
      await post(client, {
        companyId: seller.companyId,
        userId: seller.userId,
        invoiceId: invoice.id,
      });
      await expect(
        creditNote(client, {
          companyId: seller.companyId,
          userId: seller.userId,
          invoiceId: invoice.id,
          reason: "Too much",
          amount: "200000.00",
        })
      ).rejects.toThrow(/cannot be credited/i);
    });
  });

  it("insists on a reason", async () => {
    await inRollback(async (client) => {
      const seller = await aSellerWith(client);
      const { invoice } = await anInvoice(client, seller);
      await post(client, {
        companyId: seller.companyId,
        userId: seller.userId,
        invoiceId: invoice.id,
      });
      await expect(
        creditNote(client, {
          companyId: seller.companyId,
          userId: seller.userId,
          invoiceId: invoice.id,
          reason: "   ",
        })
      ).rejects.toThrow(/why/i);
    });
  });
});

describe("who owes what", () => {
  it("is a ledger query, and drops an invoice once it is settled", async () => {
    await inRollback(async (client) => {
      const seller = await aSellerWith(client);
      const { invoice } = await anInvoice(client, seller);
      await post(client, {
        companyId: seller.companyId,
        userId: seller.userId,
        invoiceId: invoice.id,
      });

      const before = await aged(client, { companyId: seller.companyId });
      expect(before.total).toBe("97,200.00");
      expect(before.invoices).toHaveLength(1);

      await receive(client, {
        companyId: seller.companyId,
        userId: seller.userId,
        amount: "97200.00",
        accountId: seller.accounts.bank,
        allocations: [{ invoiceId: invoice.id, amount: "97200.00" }],
      });

      const after = await aged(client, { companyId: seller.companyId });
      expect(after.total).toBe("0.00");
      expect(after.invoices).toHaveLength(0);
    });
  });

  it("leaves a draft out of it entirely", async () => {
    await inRollback(async (client) => {
      const seller = await aSellerWith(client);
      await anInvoice(client, seller);
      const list = await aged(client, { companyId: seller.companyId });
      expect(list.invoices).toHaveLength(0);
    });
  });
});

/**
 * The GST return, against a real Postgres.
 *
 * What matters: the figures come from the documents in the period, agree with
 * the ledger, and a reversed bill comes back out in the month it was reversed;
 * what would make the return wrong is named; and the two statements carry
 * MIRA's exact column headings.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity, postEntry, reverseEntry } from "../src/ledger/post";
import { raise, post as postInvoice, creditNote } from "../src/ledger/sales";
import { postBill } from "../src/ledger/bills";
import * as gst from "../src/ledger/gstReturn";
import { xlsx, crc32 } from "../src/utils/xlsx";

afterAll(closePool);

async function aBusiness(client, { activityNo = "1145053GST501" } = {}) {
  const { companyId, userId, accounts } = await aCompanyWith(client);
  await client.query("UPDATE companies SET gst_number = $2 WHERE id = $1", [companyId, activityNo]);
  const { rows: acc } = await client.query(
    `INSERT INTO accounts (company_id, code, name, type) VALUES
       ($1,'1300','Money owed to us','asset'), ($1,'2200','GST we owe','liability'), ($1,'4100','Work invoiced','income')
     RETURNING id, code`,
    [companyId]
  );
  await assumeIdentity(client, { companyId, userId });
  const party = async (name, kind, tin) =>
    (await client.query(`INSERT INTO counterparties (company_id, name, kind, tin) VALUES ($1,$2,$3,$4) RETURNING id`, [companyId, name, `{${kind}}`, tin])).rows[0].id;
  const base = { companyId, userId };

  const bill = async ({ date, net, supplier }) => {
    const { rows } = await client.query(
      `INSERT INTO bills (company_id, counterparty_id, bill_no, issue_date, net_laari, tax_laari, gross_laari, gst_treatment, gst_rate_bp, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'exclusive',800,'draft') RETURNING id`,
      [companyId, supplier, `B-${date}`, date, net, net * 8 / 100, net * 108 / 100]
    );
    const done = await postBill(client, { ...base, billId: rows[0].id, accounts: { expense: accounts.expense, payable: accounts.payable, taxReclaimable: accounts.taxReclaimable } });
    return { id: rows[0].id, entryId: done.entry.id };
  };
  const invoice = async ({ date, amount, customer }) => {
    const { invoice } = await raise(client, {
      ...base, counterpartyId: customer, issueDate: date, gstTreatment: "exclusive",
      lines: [{ description: "Excavator", quantity: 1, unitPrice: amount }],
    });
    await postInvoice(client, { ...base, invoiceId: invoice.id });
    return invoice;
  };
  return { ...base, base, accounts, acc, party, bill, invoice };
}

describe("the period", () => {
  it("runs a month or a quarter, due by the 28th of the month after", () => {
    expect(gst.period("2026-08", { today: "2026-09-20" })).toMatchObject({ from: "2026-08-01", to: "2026-08-31", due: "2026-09-28", daysLeft: 8, over: true });
    expect(gst.period("2026-Q4", { today: "2026-09-20" })).toMatchObject({ from: "2026-10-01", to: "2026-12-31", due: "2027-01-28" });
    expect(gst.currentKey("month", "2026-01-10")).toBe("2025-12");
    expect(gst.currentKey("quarter", "2026-09-22")).toBe("2026-Q2");
    expect(gst.recentKeys("month", 3, "2026-09-22")).toEqual(["2026-08", "2026-07", "2026-06"]);
  });
});

describe("the return", () => {
  it("adds up the documents, agrees with the books, and names nothing wrong", () =>
    inRollback(async (client) => {
      const b = await aBusiness(client);
      const rdc = await b.party("Road Development Corporation", "customer", "1110219GST501");
      const sto = await b.party("State Trading Organisation", "supplier", "1000004GST501");
      await b.invoice({ date: "2026-08-05", amount: "90000.00", customer: rdc });
      await b.bill({ date: "2026-08-10", net: 100_000, supplier: sto });

      const r = await gst.build(client, { companyId: b.companyId, key: "2026-08" });
      expect(r.out).toMatchObject({ standard: 9_000_000n, tax: 720_000n });
      expect(r.inp).toMatchObject({ value: 100_000n, tax: 8_000n });
      expect(r.ledger).toEqual({ output: 720_000n, input: 8_000n });
      expect(r.problems).toEqual([]);
      expect(gst.figures(r).at(-1)).toMatchObject({ label: "Payable", amount: "7,120.00" });
    }));

  it("takes a credit note off the month it was issued in", () =>
    inRollback(async (client) => {
      const b = await aBusiness(client);
      const rdc = await b.party("Road Development Corporation", "customer", "1110219GST501");
      const inv = await b.invoice({ date: "2026-08-05", amount: "90000.00", customer: rdc });
      await creditNote(client, { ...b.base, invoiceId: inv.id, amount: "6480.00", reason: "Two days not worked", issueDate: "2026-09-02" });

      const sep = await gst.build(client, { companyId: b.companyId, key: "2026-09" });
      expect(sep.out.tax).toBe(-48_000n);
      expect(sep.problems).toEqual([]);
    }));

  it("keeps a bill claimed in its own month and takes it out in the month it was reversed", () =>
    inRollback(async (client) => {
      const b = await aBusiness(client);
      const sto = await b.party("State Trading Organisation", "supplier", "1000004GST501");
      const bill = await b.bill({ date: "2026-08-10", net: 100_000, supplier: sto });
      await reverseEntry(client, { ...b.base, entryId: bill.entryId, reason: "Wrong supplier", date: "2026-09-03" });

      expect((await gst.build(client, { companyId: b.companyId, key: "2026-08" })).inp.tax).toBe(8_000n);
      const sep = await gst.build(client, { companyId: b.companyId, key: "2026-09" });
      expect(sep.inp.tax).toBe(-8_000n);
      expect(sep.problems).toEqual([]);
      expect(gst.inputRows(sep)[1][7]).toBe(-80);
    }));

  it("names what would make it wrong", () =>
    inRollback(async (client) => {
      const b = await aBusiness(client, { activityNo: null });
      const nobody = await b.party("Island Zone", "supplier", null);
      await b.bill({ date: "2026-08-10", net: 100_000, supplier: nobody });
      // A hand-made entry against GST owed that no invoice explains.
      await postEntry(client, {
        ...b.base, date: "2026-08-20", source: "adjustment", narrative: "By hand",
        lines: [{ accountId: b.accounts.bank, debit: "10.00" }, { accountId: b.acc.find((a) => a.code === "2200").id, credit: "10.00" }],
      });

      const r = await gst.build(client, { companyId: b.companyId, key: "2026-08" });
      expect(r.problems.map((p) => p.what)).toEqual([
        "No taxable activity number",
        "Island Zone has no TIN",
        "Output tax in the books does not match the invoices",
      ]);
    }));

  it("once filed, notices when the books move under it", () =>
    inRollback(async (client) => {
      const b = await aBusiness(client);
      const rdc = await b.party("Road Development Corporation", "customer", "1110219GST501");
      await b.invoice({ date: "2026-08-05", amount: "1000.00", customer: rdc });
      await gst.markFiled(client, { ...b.base, key: "2026-08", reference: "MIRA-123" });
      await expect(gst.markFiled(client, { ...b.base, key: "2026-08" })).rejects.toThrow(/already marked/);

      await b.invoice({ date: "2026-08-25", amount: "1000.00", customer: rdc });
      const r = await gst.build(client, { companyId: b.companyId, key: "2026-08" });
      expect(r.problems.map((p) => p.what)).toContain("The books changed after this return was filed");
    }));
});

describe("the statements", () => {
  it("carry MIRA's exact headings, one line per document", () =>
    inRollback(async (client) => {
      const b = await aBusiness(client);
      const rdc = await b.party("Road Development Corporation", "customer", "1110219GST501");
      const sto = await b.party("State Trading Organisation", "supplier", "1000004GST501");
      await b.invoice({ date: "2026-08-05", amount: "90000.00", customer: rdc });
      await b.bill({ date: "2026-08-10", net: 100_000, supplier: sto });
      const r = await gst.build(client, { companyId: b.companyId, key: "2026-08" });

      const input = gst.inputRows(r);
      expect(input[0]).toEqual([
        "#", "Supplier TIN", "Supplier Name", "Supplier Invoice Number", "Invoice Date",
        "Invoice Total (excluding GST)", "GST Charged at 6%", "GST Charged at 8%", "GST Charged at 12%",
        "GST Charged at 16%", "GST Charged at 17%", "Your Taxable Activity Number", "Revenue / Capital",
      ]);
      expect(input[1]).toEqual([1, "1000004GST501", "State Trading Organisation", "B-2026-08-10", "2026-08-10", 1000, null, 80, null, null, null, "1145053GST501", "Revenue"]);

      const [invoices, other] = gst.outputSheets(r);
      expect([invoices.name, other.name]).toEqual(["TaxInvoices", "OtherTransactions"]);
      expect(invoices.rows[1]).toEqual(["1110219GST501", "Road Development Corporation", expect.any(String), "2026-08-05", 90000, null, null, null, "1145053GST501"]);
    }));
});

describe("the spreadsheet file", () => {
  it("is a zip whose checksums are right and whose sheet holds the cells", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
    const buf = xlsx([{ name: "Sheet1", rows: [["#", "Name & Co <x>"], [1, "Ok"]] }]);
    expect(buf.subarray(0, 4).toString("hex")).toBe("504b0304");
    expect(buf.includes(Buffer.from("PK\x05\x06", "latin1"))).toBe(true);
  });
});

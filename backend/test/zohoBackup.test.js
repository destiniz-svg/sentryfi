/**
 * A Zoho Books backup into balanced transactions. Made-up names and figures in
 * the shape of a real export: one row per line with its header repeated, the
 * tax on a journal line rather than a line of its own, a payment left
 * unapplied, a dollar invoice paid at a different rate.
 */
import { describe, it, expect } from "vitest";
import { convert, laari, AR, AP, GST_IN, GST_OUT } from "../src/ledger/zohoBackup";

const csv = (rows) => rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");

const files = {
  "Chart_of_Accounts.csv": csv([
    ["Account ID", "Account Name", "Account Type", "Currency"],
    ["1", "Sales", "Income", "MVR"],
    ["2", "Office Supplies", "Expense", "MVR"],
    ["3", "Current Account", "Bank", "MVR"],
    ["4", "Dollar Account", "Bank", "USD"],
    ["5", "Petty Cash", "Cash", "MVR"],
  ]),
  "Invoice.csv": csv([
    ["Invoice ID", "Invoice Number", "Invoice Date", "Invoice Status", "Customer Name", "Currency Code", "Exchange Rate", "Total", "Balance", "Adjustment", "Round Off", "Shipping Charge", "Entity Discount Amount", "Item Total", "Item Tax Amount", "Account", "Item Name"],
    ["I1", "INV-1", "2026-01-05", "Closed", "Harbour Cafe", "USD", "15.420000000000", "108.000", "0.000", "0", "0", "0", "0", "100.000", "8.000", "Sales", "Service"],
    ["I2", "INV-2", "2026-01-06", "Overdue", "Island Builder", "MVR", "1", "1000.50", "1000.50", "0", "0.50", "0", "0", "600.000", "0", "Sales", "Part one"],
    ["I2", "INV-2", "2026-01-06", "Overdue", "Island Builder", "MVR", "1", "1000.50", "1000.50", "0", "0.50", "0", "0", "400.000", "0", "Sales", "Part two"],
    ["I3", "INV-3", "2026-01-07", "Void", "Island Builder", "MVR", "1", "50", "0", "0", "0", "0", "0", "50", "0", "Sales", "Void one"],
  ]),
  "Customer_Payment.csv": csv([
    ["CustomerPayment ID", "Payment Number", "Date", "Customer Name", "Currency Code", "Exchange Rate", "Amount", "Unused Amount", "Bank Charges", "Deposit To", "Amount Applied to Invoice", "Invoice Number"],
    ["P1", "1", "2026-01-20", "Harbour Cafe", "USD", "15.500000", "108.00", "0", "0", "Dollar Account", "108.00", "INV-1"],
  ]),
  "Bill.csv": csv([
    ["Bill ID", "Bill Number", "Bill Date", "Bill Status", "Vendor Name", "Currency Code", "Exchange Rate", "Total", "Balance", "Adjustment", "Entity Discount Amount", "Item Total", "Tax Amount", "Account", "Item Name"],
    ["B1", "S-9", "2026-01-08", "Overdue", "Paper Supplier", "MVR", "1", "540.00", "540.00", "0", "0", "500.00", "40.00", "Office Supplies", "Paper"],
  ]),
  "Vendor_Payment.csv": csv([
    ["VendorPayment ID", "Payment Number", "Date", "Vendor Name", "Currency Code", "Exchange Rate", "Amount", "Unused Amount", "Bank Charges", "Paid Through", "Bill ID", "Bill Amount", "Bill Number", "Payment Status"],
    ["V2", "2", "2026-01-26", "Paper Supplier", "MVR", "1", "540.000", "0", "0", "Current Account", "B1", "540.00", "S-9", "Draft"],
    ["V1", "1", "2026-01-25", "Paper Supplier", "MVR", "1", "540.000", "540.000", "0", "Current Account", "B1", "540.00", "S-9"],
  ]),
  "Expense.csv": csv([
    ["Expense Reference ID", "Entry Number", "Expense Date", "Expense Account", "Paid Through", "Currency Code", "Exchange Rate", "Is Inclusive Tax", "Tax Amount", "Expense Amount", "Total", "Reference#", "Vendor", "Expense Description"],
    ["E1", "1", "2026-01-10", "Office Supplies", "Petty Cash", "MVR", "1", "true", "8.00", "108.00", "108.00", "R1", "Corner Shop", "Pens"],
  ]),
  "Journal.csv": csv([
    ["Journal ID", "Journal Number", "Journal Number Suffix", "Journal Date", "Status", "Currency", "Exchange Rate", "Debit", "Credit", "Account", "Tax Amount", "Contact Name", "Description", "Notes"],
    ["J1", "JV-", "1", "2026-01-12", "Published", "MVR", "1", "100.00", "0", "Office Supplies", "8.00", "", "Taxed line", "A taxed journal"],
    ["J1", "JV-", "1", "2026-01-12", "Published", "MVR", "1", "0", "108.00", "Current Account", "0", "", "", "A taxed journal"],
  ]),
  "Transfer_Fund.csv": csv([
    ["Transaction Date", "Transaction Type", "From Account", "To Account", "Reference", "Description", "Currency Code", "Exchange Rate", "Total"],
    ["2026-01-15", "Funds Transfer", "Current Account", "Petty Cash", "T1", "Float", "MVR", "1", "200.00"],
  ]),
};

const by = (r, type) => r.transactions.filter((t) => t.type === type);
const at = (t, account) => t.lines.filter((l) => l.account === account);

describe("a Zoho Books backup", () => {
  const r = convert(files);

  it("balances every transaction, skips void ones, and finds nothing wrong", () => {
    expect(r.problems).toEqual([]);
    expect(r.transactions.every((t) => t.balanced)).toBe(true);
    expect(by(r, "Invoice").map((t) => t.theirId)).toEqual(["INV-1", "INV-2"]);
    expect(new Set(r.transactions.map((t) => t.key)).size).toBe(r.transactions.length);
  });

  it("puts a dollar invoice in rufiyaa at its rate, keeps the dollars, and books the rate's move on payment", () => {
    const inv = by(r, "Invoice")[0];
    expect(at(inv, AR)[0]).toMatchObject({ debit: 166536n, fc: { currency: "USD", amount: 10800n, rate: "15.42" }, party: { name: "Harbour Cafe", kind: "customer" } });
    expect(at(inv, GST_OUT)[0].credit).toBe(12336n);
    const pay = by(r, "Customer payment")[0];
    expect(at(pay, "Dollar Account")[0].debit).toBe(167400n); // USD 108.00 at 15.50
    expect(at(pay, AR)[0].credit).toBe(166536n); // off the receivable at the invoice's own rate
    expect(at(pay, "Exchange Gain or Loss")[0].credit).toBe(864n); // the rate moved in our favour
  });

  it("carries an invoice's round-off, and a bill's GST to the claimable side", () => {
    expect(at(by(r, "Invoice")[1], "Other Charges")[0].credit).toBe(50n);
    const bill = by(r, "Bill")[0];
    expect(at(bill, GST_IN)[0].debit).toBe(4000n);
    expect(at(bill, AP)[0]).toMatchObject({ credit: 54000n, party: { name: "Paper Supplier", kind: "supplier" } });
  });

  it("leaves a payment not applied with the supplier as an advance, even where the export lists it against a bill", () => {
    const pay = by(r, "Vendor payment")[0];
    expect(at(pay, AP).map((l) => l.memo)).toEqual(["Paid in advance"]);
  });

  it("takes GST out of an expense that included it, and puts back the GST line a taxed journal line implies", () => {
    const ex = by(r, "Expense")[0];
    expect(at(ex, "Office Supplies")[0].debit).toBe(10000n);
    expect(at(ex, GST_IN)[0].debit).toBe(800n);
    const jr = by(r, "Journal")[0];
    expect(jr.theirId).toBe("JV-1");
    expect(at(jr, GST_IN)[0].debit).toBe(800n);
  });

  it("keeps a line's reporting tags and project, and reads contacts, estimates and orders as records", () => {
    const tagged = convert({
      ...files,
      "Expense.csv": csv([
        ["Expense Reference ID", "Entry Number", "Expense Date", "Expense Account", "Paid Through", "Currency Code", "Exchange Rate", "Is Inclusive Tax", "Tax Amount", "Expense Amount", "Total", "Reference#", "Vendor", "Expense Description", "Project Name", "BOAT"],
        ["E1", "1", "2026-01-10", "Office Supplies", "Petty Cash", "MVR", "1", "false", "0", "50.00", "50.00", "R1", "Corner Shop", "Rope", "Jetty works", "BOAT"],
      ]),
      "Contacts.csv": csv([["Display Name", "Company Name", "EmailID", "MobilePhone", "Billing Address", "Billing City", "Payment Terms", "Credit Limit", "Status"], ["Harbour Cafe", "Harbour Cafe Pvt Ltd", "hello@example.test", "7000000", "1 Harbour Road", "Male", "30", "5000", "Active"]]),
      "Estimate.csv": csv([["Estimate ID", "Estimate Number", "Estimate Date", "Estimate Status", "Customer Name", "Item Name", "Quantity", "Item Price", "Account"], ["Q1", "QT-9", "2026-01-02", "accepted", "Harbour Cafe", "Service", "2", "40.00", "Sales"]]),
      "Purchase_Order.csv": csv([["Purchase Order ID", "Purchase Order Number", "Purchase Order Date", "Purchase Order Status", "Vendor Name", "Item Name", "QuantityOrdered", "Item Price", "Account"], ["PO1", "PO-7", "2026-01-03", "billed", "Paper Supplier", "Paper", "5", "100.00", "Office Supplies"]]),
    });
    const ex = by(tagged, "Expense")[0];
    expect(at(ex, "Office Supplies")[0]).toMatchObject({ dims: ["BOAT"], project: "Jetty works" });
    expect(tagged.records.tags).toEqual(["BOAT"]);
    expect(tagged.records.contacts[0]).toMatchObject({ name: "Harbour Cafe", email: "hello@example.test", phone: "7000000", address: "1 Harbour Road, Male", paymentTermsDays: 30, creditLimit: 500000n });
    expect(tagged.records.quotes[0]).toMatchObject({ number: "QT-9", status: "accepted", lines: [{ quantity: "2", unitPrice: 4000n }] });
    expect(tagged.records.purchaseOrders[0]).toMatchObject({ number: "PO-7", status: "billed" });
  });

  it("reads invoices, bills and payments as documents, each keyed to its own transaction", () => {
    const keys = new Set(r.transactions.map((t) => t.key));
    const { invoices, bills, customerPayments, vendorPayments } = r.records;
    expect(invoices.map((i) => i.number)).toEqual(["INV-1", "INV-2"]);
    expect(invoices[0]).toMatchObject({ currency: "USD", gross: 166536n, tax: 12336n, fcGross: 10800n });
    expect(bills[0]).toMatchObject({ number: "S-9", gross: 54000n, tax: 4000n });
    expect(customerPayments[0].applied).toEqual([{ invoice: "INV-1", amount: 166536n }]);
    expect(vendorPayments.map((p) => p.number)).toEqual(["1"]); // the draft never reached Zoho's books
    expect(by(r, "Vendor payment")).toHaveLength(1);
    expect(vendorPayments[0].applied).toEqual([]); // all of it left unused, so nothing paid against the bill
    expect([...invoices, ...bills, ...customerPayments, ...vendorPayments].every((d) => keys.has(d.key))).toBe(true);
  });

  it("reads Zoho's three decimal places", () => {
    expect([laari("1689.330"), laari("-12.5"), laari("0.005"), laari("")]).toEqual([168933n, -1250n, 1n, 0n]);
  });
});

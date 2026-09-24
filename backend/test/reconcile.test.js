/**
 * The bank agrees with the books, against a real Postgres.
 *
 * The rule under test is that nothing posts on its own. Linking a line to
 * something already recorded changes nothing in the books; anything that would
 * write an entry waits for a person, and every answer can be taken back
 * without losing the record that it was given.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity, postEntry } from "../src/ledger/post";
import { openBox } from "../src/ledger/cash";
import { transfer, importStatement, places, openBank } from "../src/ledger/bank";
import { raise, post as postInvoice, receive, outstanding } from "../src/ledger/sales";
import * as rec from "../src/ledger/reconcile";
import { doubtsFor } from "../src/ledger/periods";

afterAll(closePool);

const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
const xl = (v) => q(`="${v}"`);
const row = (on, ref, who, debit, credit, balance) =>
  [q(on), q(on), q("Transfer"), xl(ref), xl("FT1"), q("01-01-2026 01-01-01"), xl(who), q("Internet Banking"), q(debit), q(credit), q(balance)].join(",");

/** A company with MVR 10,000.00 in the bank and a statement on the way. */
async function aStatement(client, lines) {
  const { companyId, userId, accounts } = await aCompanyWith(client);
  await assumeIdentity(client, { companyId, userId });
  await postEntry(client, {
    companyId, userId, date: "2025-12-31", source: "opening_balance", narrative: "Start",
    lines: [{ accountId: accounts.bank, debit: "10,000.00" }, { accountId: accounts.payable, credit: "10,000.00" }],
  });
  // The shared helper opens a buying chart. Receiving money needs what is owed to us.
  await client.query(
    `INSERT INTO accounts (company_id, code, name, type) VALUES
       ($1,'1300','Money owed to us','asset'), ($1,'2200','GST we owe','liability'), ($1,'4100','Work invoiced','income')`,
    [companyId]
  );
  await importStatement(client, { companyId, userId, accountId: accounts.bank, text: lines.join("\n") });
  const { rows } = await client.query(
    `SELECT * FROM bank_statement_lines WHERE company_id = $1 ORDER BY posted_on, id`,
    [companyId]
  );
  return { companyId, userId, accounts, lines: rows, base: { companyId, userId } };
}

const entryCount = async (client, companyId) =>
  (await client.query("SELECT count(*)::int AS n FROM journal_entries WHERE company_id = $1", [companyId])).rows[0].n;
const bankBalance = async (client, companyId, id) =>
  (await places(client, { companyId })).find((p) => p.id === id).balance;

describe("what the books already know", () => {
  it("offers an entry already recorded for the same amount, and linking it writes nothing", () =>
    inRollback(async (client) => {
      const s = await aStatement(client, [row("2026/01/03", "BLAZ100000000001", "TIN TOPUP", "100", "", "9900.00")]);
      const box = await openBox(client, { companyId: s.companyId, userId: s.userId, name: "Site" });
      const t = await transfer(client, { ...s.base, fromId: s.accounts.bank, toId: box.account_id, amount: "100", on: "2026-01-02" });

      const ideas = await rec.suggest(client, { companyId: s.companyId, lines: s.lines });
      expect(ideas.get(s.lines[0].id).entries.map((e) => e.entryId)).toEqual([t.entry.id]);

      const before = await entryCount(client, s.companyId);
      await rec.link(client, { ...s.base, lineId: s.lines[0].id, entryId: t.entry.id });
      expect(await entryCount(client, s.companyId)).toBe(before);
      expect((await client.query("SELECT status FROM bank_statement_lines WHERE id = $1", [s.lines[0].id])).rows[0].status).toBe("matched");
    }));

  it("lets each side of a move between our own banks answer its own statement", () =>
    inRollback(async (client) => {
      const s = await aStatement(client, [row("2026/01/03", "BLAZ100000000001", "TO SAVINGS", "100", "", "9900.00")]);
      const savings = await openBank(client, { companyId: s.companyId, name: "BML Savings" });
      const t = await transfer(client, { ...s.base, fromId: s.accounts.bank, toId: savings.id, amount: "100", on: "2026-01-03" });
      await rec.link(client, { ...s.base, lineId: s.lines[0].id, entryId: t.entry.id });
      await importStatement(client, { ...s.base, accountId: savings.id, text: row("2026/01/03", "BLAZ100000000009", "FROM CURRENT", "", "100", "100.00") });
      const { rows: other } = await client.query("SELECT * FROM bank_statement_lines WHERE account_id = $1", [savings.id]);
      const ideas = await rec.suggest(client, { companyId: s.companyId, lines: other });
      expect(ideas.get(other[0].id).entries.map((e) => e.entryId)).toEqual([t.entry.id]);
      await rec.link(client, { ...s.base, lineId: other[0].id, entryId: t.entry.id });
    }));

  it("reads the day's closing balance whatever order the lines came in", () =>
    inRollback(async (client) => {
      // Printed newest first, with the same time on each: 100 out, then 50 in, closing at 9,950.
      const s = await aStatement(client, [
        row("2026/01/03", "BLAZ100000000002", "B", "", "50", "9950.00"),
        row("2026/01/03", "BLAZ100000000001", "A", "100", "", "9900.00"),
      ]);
      const d = await doubtsFor(client, { companyId: s.companyId, through: "2026-01-31" });
      expect(d.unbalanced).toEqual([expect.objectContaining({ bank: "9,950.00", books: "10,000.00" })]);
    }));

  it("will not undo a posting that the other bank's statement also answers with", () =>
    inRollback(async (client) => {
      const s = await aStatement(client, [row("2026/01/03", "BLAZ100000000001", "TO SAVINGS", "100", "", "9900.00")]);
      const savings = await openBank(client, { companyId: s.companyId, name: "BML Savings" });
      const done = await rec.post(client, { ...s.base, lineId: s.lines[0].id, accountId: savings.id, note: "To savings" });
      await importStatement(client, { ...s.base, accountId: savings.id, text: row("2026/01/03", "BLAZ100000000009", "FROM CURRENT", "", "100", "100.00") });
      const { rows: other } = await client.query("SELECT id FROM bank_statement_lines WHERE account_id = $1", [savings.id]);
      await rec.link(client, { ...s.base, lineId: other[0].id, entryId: done.entryId });
      await expect(rec.undo(client, { ...s.base, lineId: s.lines[0].id })).rejects.toThrow(/Take that answer back first/);
      await rec.undo(client, { ...s.base, lineId: other[0].id });
      await rec.undo(client, { ...s.base, lineId: s.lines[0].id });
      await expect(rec.link(client, { ...s.base, lineId: other[0].id, entryId: done.entryId })).rejects.toThrow(/reversed/);
    }));

  it("says at month end when the bank's closing balance and the books disagree", () =>
    inRollback(async (client) => {
      const s = await aStatement(client, [row("2026/01/03", "BLAZ100000000001", "FUEL", "100", "", "9900.00")]);
      const before = await doubtsFor(client, { companyId: s.companyId, through: "2026-01-31" });
      expect(before.unbalanced).toEqual([expect.objectContaining({ bank: "9,900.00", books: "10,000.00", difference: "-100.00" })]);
      await rec.setAside(client, { ...s.base, lineId: s.lines[0].id, note: "ask the bank" });
      expect((await doubtsFor(client, { companyId: s.companyId, through: "2026-01-31" })).bankLines).toBe(1);
      await rec.post(client, { ...s.base, lineId: s.lines[0].id, accountId: s.accounts.expense, note: "Fuel" });
      expect((await doubtsFor(client, { companyId: s.companyId, through: "2026-01-31" })).unbalanced).toEqual([]);
    }));

  it("will not let one entry answer two lines", () =>
    inRollback(async (client) => {
      const s = await aStatement(client, [
        row("2026/01/03", "BLAZ100000000001", "A", "100", "", "9900.00"),
        row("2026/01/03", "BLAZ100000000002", "B", "100", "", "9800.00"),
      ]);
      const box = await openBox(client, { ...s.base, name: "Site" });
      const t = await transfer(client, { ...s.base, fromId: s.accounts.bank, toId: box.account_id, amount: "100", on: "2026-01-03" });
      await rec.link(client, { ...s.base, lineId: s.lines[0].id, entryId: t.entry.id });
      await expect(rec.link(client, { ...s.base, lineId: s.lines[1].id, entryId: t.entry.id })).rejects.toThrow(/already answers/);
    }));

  it("leaves a receipt two lines both point at for a person, and the import stands", () =>
    inRollback(async (client) => {
      const s = await aStatement(client, [
        row("2026/01/02", "BLAZ100000000002", "PAYER ONE", "", "426.50", "10426.50"),
        row("2026/01/02", "BLAZ100000000003", "PAYER ONE", "", "426.50", "10853.00"),
      ]);
      await receive(client, {
        companyId: s.companyId, userId: s.userId, amount: "426.50", accountId: s.accounts.bank,
        receivedOn: "2026-01-02", reference: "BLAZ100000000002 / BLAZ100000000003",
      });
      expect(await rec.autoMatch(client, { ...s.base, accountId: s.accounts.bank })).toBe(0);
    }));

  it("groups lines with no payee by what the bank called them, never all together", () =>
    inRollback(async (client) => {
      const kinded = (on, ref, kind, debit, balance) =>
        [q(on), q(on), q(kind), xl(ref), xl("FT1"), q("01-01-2026 01-01-01"), xl(""), q("Internet Banking"), q(debit), q(""), q(balance)].join(",");
      const s = await aStatement(client, [
        kinded("2026/01/02", "BLAZ100000000011", "Service Charge", "10", "9990.00"),
        kinded("2026/01/03", "BLAZ100000000012", "Service Charge", "10", "9980.00"),
        kinded("2026/01/04", "BLAZ100000000013", "Transfer", "500", "9480.00"),
      ]);
      const g = await rec.groups(client, { companyId: s.companyId, accountId: s.accounts.bank });
      expect(g.map((x) => [x.key, x.count]).sort()).toEqual([["kind:service charge", 2], ["kind:transfer", 1]]);
      const done = await rec.postGroup(client, { ...s.base, bankId: s.accounts.bank, who: "kind:service charge", moneyIn: false, accountId: s.accounts.expense });
      expect(done.posted).toBe(2); // the two charges, and not the transfer
    }));

  it("links a receipt on its exact reference by itself, and only then", () =>
    inRollback(async (client) => {
      const s = await aStatement(client, [
        row("2026/01/02", "BLAZ100000000002", "PAYER ONE", "", "426.50", "10426.50"),
        row("2026/01/02", "BLAZ100000000009", "PAYER TWO", "", "426.50", "10853.00"),
      ]);
      await receive(client, {
        companyId: s.companyId, userId: s.userId, amount: "426.50", accountId: s.accounts.bank,
        receivedOn: "2026-01-02", reference: "BML transfer BLAZ100000000002",
      });

      expect(await rec.autoMatch(client, { ...s.base, accountId: s.accounts.bank })).toBe(1);
      const { rows } = await client.query("SELECT bank_ref, status FROM bank_statement_lines WHERE company_id = $1 ORDER BY bank_ref", [s.companyId]);
      expect(rows).toEqual([
        { bank_ref: "BLAZ100000000002", status: "matched" },
        { bank_ref: "BLAZ100000000009", status: "open" },
      ]);
    }));
});

describe("saying what it was", () => {
  it("posts one line as a balanced entry against the account chosen", () =>
    inRollback(async (client) => {
      const s = await aStatement(client, [row("2026/01/03", "BLAZ100000000001", "SOMEONE", "800", "", "9200.00")]);
      const before = await bankBalance(client, s.companyId, s.accounts.bank);

      const done = await rec.post(client, { ...s.base, lineId: s.lines[0].id, accountId: s.accounts.expense, note: "Labour" });
      expect(done.status).toBe("posted");
      expect(await bankBalance(client, s.companyId, s.accounts.bank)).toBe(before - 80_000n);
      await expect(rec.post(client, { ...s.base, lineId: s.lines[0].id, accountId: s.accounts.expense })).rejects.toThrow(/already/);
    }));

  it("will not post onto the bank account itself, or a line with no amount", () =>
    inRollback(async (client) => {
      const s = await aStatement(client, [
        row("2026/01/03", "BLAZ100000000001", "SOMEONE", "800", "", "9200.00"),
        row("2026/01/04", "BLAZ100000000002", "ODD", "0", "", "9200.00"),
      ]);
      await expect(rec.post(client, { ...s.base, lineId: s.lines[0].id, accountId: s.accounts.bank })).rejects.toThrow(/bank account itself/);
      await expect(rec.post(client, { ...s.base, lineId: s.lines[1].id, accountId: s.accounts.expense })).rejects.toThrow(/no amount/);
    }));

  it("remembers what was said about a payee and offers it next time", () =>
    inRollback(async (client) => {
      const s = await aStatement(client, [
        row("2026/01/03", "BLAZ100000000001", "SOMEONE", "800", "", "9200.00"),
        row("2026/01/09", "BLAZ100000000002", "SOMEONE", "800", "", "8400.00"),
      ]);
      await rec.post(client, { ...s.base, lineId: s.lines[0].id, accountId: s.accounts.expense });
      const ideas = await rec.suggest(client, { companyId: s.companyId, lines: [s.lines[1]] });
      expect(ideas.get(s.lines[1].id).rule).toMatchObject({ accountId: s.accounts.expense, times: 1 });
    }));

  it("answers a whole payee at once, and the question is gone", () =>
    inRollback(async (client) => {
      const s = await aStatement(client, [
        row("2026/01/03", "BLAZ100000000001", "SOMEONE", "800", "", "9200.00"),
        row("2026/01/04", "BLAZ100000000002", "Someone ", "700", "", "8500.00"),
        row("2026/01/05", "BLAZ100000000003", "SOMEONE", "500", "", "8000.00"),
        row("2026/01/05", "BLAZ100000000004", "ELSE", "100", "", "7900.00"),
      ]);
      const asked = await rec.groups(client, { companyId: s.companyId, accountId: s.accounts.bank });
      expect(asked.map((g) => [g.key, g.count, g.total])).toEqual([["someone", 3, "2,000.00"], ["else", 1, "100.00"]]);

      const done = await rec.postGroup(client, { ...s.base, bankId: s.accounts.bank, who: "SOMEONE", moneyIn: false, accountId: s.accounts.expense });
      expect(done).toEqual({ posted: 3, total: "2,000.00" });
      expect((await rec.groups(client, { companyId: s.companyId, accountId: s.accounts.bank })).map((g) => g.key)).toEqual(["else"]);
    }));
});

describe("taking it back, and leaving it for later", () => {
  it("reverses a posting, keeps both entries, and asks the question again", () =>
    inRollback(async (client) => {
      const s = await aStatement(client, [row("2026/01/03", "BLAZ100000000001", "SOMEONE", "800", "", "9200.00")]);
      const before = await bankBalance(client, s.companyId, s.accounts.bank);
      const n = await entryCount(client, s.companyId);

      await rec.post(client, { ...s.base, lineId: s.lines[0].id, accountId: s.accounts.expense });
      await rec.undo(client, { ...s.base, lineId: s.lines[0].id });

      expect(await bankBalance(client, s.companyId, s.accounts.bank)).toBe(before);
      expect(await entryCount(client, s.companyId)).toBe(n + 2); // the posting and its reversal, both still there
      expect((await client.query("SELECT status, entry_id FROM bank_statement_lines WHERE id = $1", [s.lines[0].id])).rows[0]).toEqual({ status: "open", entry_id: null });
    }));

  it("sets a line aside, which clears it from the list, and it can come back", () =>
    inRollback(async (client) => {
      const s = await aStatement(client, [row("2026/01/03", "BLAZ100000000001", "SOMEONE", "800", "", "9200.00")]);
      await rec.setAside(client, { ...s.base, lineId: s.lines[0].id, note: "Ask Sana" });
      expect(await rec.groups(client, { companyId: s.companyId, accountId: s.accounts.bank })).toEqual([]);
      await rec.undo(client, { ...s.base, lineId: s.lines[0].id });
      expect((await rec.groups(client, { companyId: s.companyId, accountId: s.accounts.bank })).length).toBe(1);
    }));
});

describe("money in that pays an invoice", () => {
  async function anInvoiceOwed(client, s, amount = "1000.00") {
    const { rows } = await client.query(
      `INSERT INTO counterparties (company_id, name, kind) VALUES ($1, 'Road Development Corporation Ltd', '{customer}') RETURNING id`,
      [s.companyId]
    );
    const { invoice } = await raise(client, {
      ...s.base, counterpartyId: rows[0].id, invoiceNo: "INV-1", gstTreatment: "exempt", gstRateBp: 0,
      lines: [{ description: "Rental", quantity: 1, unitPrice: amount }],
    });
    await postInvoice(client, { ...s.base, invoiceId: invoice.id });
    return invoice;
  }

  it("suggests the invoice, then settles exactly it through the same door as any receipt", () =>
    inRollback(async (client) => {
      const s = await aStatement(client, [row("2026/01/10", "BLAZ100000000001", "ROAD DEVELOPMENT CORP", "", "1000.00", "11000.00")]);
      const invoice = await anInvoiceOwed(client, s);

      const ideas = await rec.suggest(client, { companyId: s.companyId, lines: s.lines });
      expect(ideas.get(s.lines[0].id).invoices.map((i) => i.invoiceNo)).toEqual(["INV-1"]);

      const done = await rec.receiveAgainst(client, { ...s.base, lineId: s.lines[0].id, invoiceId: invoice.id });
      expect(done.applied).toBe("1,000.00");
      expect(await outstanding(client, { companyId: s.companyId, invoiceId: invoice.id })).toBe(0n);

      // Taken back, it is owed again.
      await rec.undo(client, { ...s.base, lineId: s.lines[0].id });
      expect(await outstanding(client, { companyId: s.companyId, invoiceId: invoice.id })).toBe(100_000n);
    }));
});

describe("money out that pays a bill", () => {
  it("pays exactly that bill, so Payments no longer lists it; taken back, it is owed again", () =>
    inRollback(async (client) => {
      const s = await aStatement(client, [row("2026/01/12", "BLAZ100000000009", "STEEL TRADERS", "700.00", "", "9300.00")]);
      const { postBill } = await import("../src/ledger/bills");
      const { unpaid } = await import("../src/ledger/payments");
      const { rows: sup } = await client.query("INSERT INTO counterparties (company_id, name, kind) VALUES ($1,'Steel Traders','{supplier}') RETURNING id", [s.companyId]);
      const { rows: b } = await client.query(
        "INSERT INTO bills (company_id, counterparty_id, issue_date, net_laari, tax_laari, gross_laari, gst_treatment, status) VALUES ($1,$2,'2026-01-05',70000,0,70000,'none_unregistered','draft') RETURNING id",
        [s.companyId, sup[0].id]
      );
      await postBill(client, { ...s.base, billId: b[0].id, accounts: { expense: s.accounts.expense, payable: s.accounts.payable, taxReclaimable: s.accounts.taxReclaimable } });
      const owedBefore = (await unpaid(client, { companyId: s.companyId })).filter((x) => x.id === b[0].id);
      expect(owedBefore).toHaveLength(1);

      const done = await rec.payBill(client, { ...s.base, lineId: s.lines[0].id, billId: b[0].id });
      expect(done.paid).toBe("700.00");
      expect((await unpaid(client, { companyId: s.companyId })).some((x) => x.id === b[0].id)).toBe(false);

      await rec.undo(client, { ...s.base, lineId: s.lines[0].id });
      expect((await unpaid(client, { companyId: s.companyId })).some((x) => x.id === b[0].id)).toBe(true);
    }));
});

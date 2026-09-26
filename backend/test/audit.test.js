/**
 * The auditor's workspace: a period's seal, samples kept as drawn and provable
 * from their seed, each item opening onto its document, entry and money,
 * ticked as seen with a note; and the journal risk screen (ISA 240).
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity, postEntry } from "../src/ledger/post";
import { postBill } from "../src/ledger/bills";
import * as audit from "../src/ledger/audit";
import * as risk from "../src/ledger/auditRisk";
import * as pack from "../src/ledger/auditPack";
import * as questions from "../src/ledger/auditQuestions";
import * as comments from "../src/ledger/comments";
import * as adjust from "../src/ledger/auditAdjustments";
import * as count from "../src/ledger/auditCount";
import * as signoffs from "../src/ledger/auditSignoff";
import * as counts from "../src/ledger/counts";
import * as stock from "../src/ledger/stock";
import { unzip } from "../src/ledger/unzip";
import { createHash } from "crypto";

// The role table sits beside the server settings, which refuse to load without these.
process.env.DATABASE_URL ||= process.env.TEST_DATABASE_URL || "postgres://unused:unused@127.0.0.1:5432/unused";
process.env.JWT_SECRET ||= "audit-test-secret-long-enough-to-pass-validation";

afterAll(closePool);

// Five bills in 2025 of MVR 100 to 500, one of MVR 2,000, and one in January 2026.
const BILLS = [[10000, "2025-02-01"], [20000, "2025-04-01"], [30000, "2025-06-01"], [40000, "2025-08-01"], [50000, "2025-10-01"], [200000, "2025-12-30"], [60000, "2026-01-05"]];

async function withBills(client) {
  const co = await aCompanyWith(client);
  const { companyId, userId, accounts } = co;
  await assumeIdentity(client, { companyId, userId });
  const supplier = (await client.query("INSERT INTO counterparties (company_id, name, kind) VALUES ($1,'Island Hardware','{supplier}') RETURNING id", [companyId])).rows[0].id;
  co.bills = [];
  co.post = async (amount, on, i) => {
    const { rows } = await client.query(
      `INSERT INTO bills (company_id, counterparty_id, bill_no, issue_date, net_laari, tax_laari, gross_laari, gst_treatment, status)
       VALUES ($1,$2,$3,$4,$5,0,$5,'none_unregistered','draft') RETURNING id`,
      [companyId, supplier, `IH-${i}`, on, amount]
    );
    await postBill(client, { companyId, userId, billId: rows[0].id, accounts: { expense: accounts.expense, payable: accounts.payable, taxReclaimable: accounts.taxReclaimable } });
    co.bills.push(rows[0].id);
    return rows[0].id;
  };
  for (const [i, [amount, on]] of BILLS.entries()) await co.post(amount, on, i + 1);
  return co;
}

describe("the audit workspace", () => {
  it("checks the seal, draws samples that keep their seed, and proves them by drawing again", () =>
    inRollback(async (client) => {
      const co = await withBills(client);
      const { companyId, userId, bills } = co;
      await expect(audit.createPeriod(client, { companyId, userId, from: "2025-12-31", to: "2025-01-01" })).rejects.toThrow(/ends before it starts/);
      const { id: periodId, seal } = await audit.createPeriod(client, { companyId, userId, name: "Year to 31 Dec 2025", from: "2025-01-01", to: "2025-12-31" });
      expect(seal).toMatchObject({ ok: true, entries: 6, checked: 7, problems: [] });

      // Two at random from the six bills in the year; the seed is kept and proves the same two.
      const random = await audit.draw(client, { companyId, userId, periodId, kind: "bill", how: "random", size: 2 });
      expect(random).toMatchObject({ drawn: 2, population: 6 });
      expect(random.seed).toMatch(/^[0-9a-f]{16}$/);
      expect(await audit.prove(client, { companyId, sampleId: random.id })).toMatchObject({ provable: true, samePopulation: true, sameItems: true });

      // Every bill of MVR 300 or more: four, largest first.
      const big = await audit.draw(client, { companyId, userId, periodId, kind: "bill", how: "over", over: "300" });
      const s = await audit.sample(client, { companyId, sampleId: big.id });
      expect(s.items.map((i) => [i.no, i.amount])).toEqual([["IH-6", "2,000.00"], ["IH-5", "500.00"], ["IH-4", "400.00"], ["IH-3", "300.00"]]);
      expect(s.said).toBe("Every one of the bills of MVR 300.00 or more");
      expect(s.items.every((i) => bills.includes(i.docId) && i.seen === null && i.changed === null)).toBe(true);

      // Key items and the rest: the MVR 2,000 bill always, and two of the other five at random.
      const key = await audit.sample(client, { companyId, sampleId: (await audit.draw(client, { companyId, userId, periodId, kind: "bill", how: "key", over: "1000", size: 2 })).id });
      expect(key.items).toHaveLength(3);
      expect(key.items[0]).toMatchObject({ no: "IH-6", why: "Key item: MVR 1,000.00 or more" });
      expect(key.items.slice(1).every((i) => i.why === "At random from the rest")).toBe(true);

      // Monetary unit, three hits over MVR 3,500: the interval is MVR 1,166.66, so the MVR 2,000 bill is always drawn.
      const unit = await audit.sample(client, { companyId, sampleId: (await audit.draw(client, { companyId, userId, periodId, kind: "bill", how: "mus", size: 3 })).id });
      expect(unit.said).toBe("3 bills by monetary unit, one hit every MVR 1,166.66");
      expect(unit.items[0]).toMatchObject({ no: "IH-6", why: expect.stringMatching(/always drawn/) });
      expect(unit.items.length).toBeGreaterThanOrEqual(2);

      // A bill added to the period afterwards: the proof says the population changed.
      await co.post(70000, "2025-07-01", 99);
      const later = await audit.prove(client, { companyId, sampleId: random.id });
      expect(later).toMatchObject({ samePopulation: false, then: { count: 6 }, now: { count: 7 } });

      await expect(audit.draw(client, { companyId, userId, periodId, kind: "invoice", how: "random", size: 3 })).rejects.toThrow(/nothing to draw/);
      await expect(audit.draw(client, { companyId, userId, periodId, kind: "bill", how: "random", size: 0 })).rejects.toThrow(/between 1 and 200/);
      await expect(audit.draw(client, { companyId, userId, periodId, kind: "bill", how: "risk", tests: ["late"] })).rejects.toThrow(/about entries/);
    }));

  it("opens an item onto its document and entry, and keeps the tick and note", () =>
    inRollback(async (client) => {
      const { companyId, userId } = await withBills(client);
      const { id: periodId } = await audit.createPeriod(client, { companyId, userId, from: "2025-01-01", to: "2025-12-31" });
      const big = await audit.draw(client, { companyId, userId, periodId, kind: "bill", how: "over", over: "500" });
      const s = await audit.sample(client, { companyId, sampleId: big.id });
      const ev = await audit.evidence(client, { companyId, sampleId: big.id, itemId: s.items[0].id });
      expect(ev.document).toMatchObject({ title: "Bill", no: "IH-6", on: "2025-12-30", gross: "2,000.00" });
      expect(ev.entry).toMatchObject({ on: "2025-12-30", posted_by: "Test", source: "bill" });
      expect(ev.entry.lines.map((l) => [l.account, l.debit, l.credit])).toEqual([["5100 Materials", "2,000.00", "0.00"], ["2100 Suppliers we owe", "0.00", "2,000.00"]]);
      expect(ev.money).toEqual({ title: "Paid", rows: [] });
      // Its entry was posted today for a 2025 bill: the screen says so.
      expect(ev.flags.map((x) => x.test)).toEqual(expect.arrayContaining(["late", "round", "year_end"]));

      await audit.see(client, { companyId, userId, sampleId: big.id, itemId: s.items[0].id, note: "Agreed to delivery note DN-88" });
      expect((await audit.sample(client, { companyId, sampleId: big.id })).items[0]).toMatchObject({ note: "Agreed to delivery note DN-88", seen: { by: "Test" } });
      const p = await audit.period(client, { companyId, periodId });
      expect(p.samples.map((x) => [x.how, x.items, x.seen])).toEqual([["over", 2, 1]]);
      await audit.see(client, { companyId, userId, sampleId: big.id, itemId: s.items[0].id, seen: false, note: "Delivery note missing" });
      expect((await audit.sample(client, { companyId, sampleId: big.id })).items[0]).toMatchObject({ seen: null, note: "Delivery note missing" });
    }));

  it("screens the period's entries for the signs of override, and draws from them", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await withBills(client);
      await assumeIdentity(client, { companyId, userId });
      // An entry made by hand, with no real description.
      await postEntry(client, { companyId, userId, date: "2025-09-09", source: "adjustment", narrative: "adj", lines: [{ accountId: accounts.expense, debit: 12345n }, { accountId: accounts.bank, credit: 12345n }] });
      const screened = await risk.screen(client, { companyId, from: "2025-01-01", to: "2025-12-31" });
      expect(screened.total).toBe(7);
      // Everything was posted in 2026 for a 2025 date: all seven are late.
      expect(screened.tests.find((t) => t.key === "late").count).toBe(7);
      const hand = screened.entries.find((e) => e.narrative === "adj");
      expect(hand.flags.map((x) => x.test)).toEqual(expect.arrayContaining(["manual", "undescribed", "late", "backdated"]));
      expect(hand.flags.find((x) => x.test === "undescribed").said).toBe('Described only as "adj"');
      expect(screened.entries[0].score).toBeGreaterThanOrEqual(screened.entries.at(-1).score);

      const { id: periodId } = await audit.createPeriod(client, { companyId, userId, from: "2025-01-01", to: "2025-12-31" });
      const drawn = await audit.draw(client, { companyId, userId, periodId, kind: "entry", how: "risk", tests: ["manual"] });
      const s = await audit.sample(client, { companyId, sampleId: drawn.id });
      expect(s.items).toHaveLength(1);
      expect(s.items[0]).toMatchObject({ party: "adj", why: "Made by hand, not from a bill, invoice or other document" });
      expect(s.said).toBe("Every one of the entries that came from no document");
      expect(await audit.prove(client, { companyId, sampleId: drawn.id })).toMatchObject({ sameItems: true });
    }));

  it("makes an audit pack: every schedule at the year end, in audit-data form, each file fingerprinted", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await withBills(client);
      const { id: periodId } = await audit.createPeriod(client, { companyId, userId, name: "FY2025", from: "2025-01-01", to: "2025-12-31" });
      await audit.draw(client, { companyId, userId, periodId, kind: "bill", how: "over", over: "400" });
      const made = await pack.build(client, { companyId, userId, periodId });
      const files = unzip(made.body);
      expect(Object.keys(files)).toEqual(expect.arrayContaining(["00 Read me.txt", "01 Trial balance.csv", "02 General ledger (AICPA GL detail).csv", "04 Receivables ageing.csv", "05 Payables ageing.csv", "10 Sample register.csv", "12 Seal.txt", "MANIFEST.sha256"]));

      // Every file matches its line in the manifest.
      const raw = unzip(made.body, { binary: true });
      for (const line of files["MANIFEST.sha256"].trim().split("\n")) {
        const [hash, name] = [line.slice(0, 64), line.slice(66)];
        const bytes = Buffer.from(raw[name.split("/").pop()]);
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(hash);
      }

      // The ledger carries the fields journal-entry testing needs, and only the period's lines.
      const gl = files["02 General ledger (AICPA GL detail).csv"].trim().split("\r\n");
      expect(gl[0]).toBe("Journal_ID,JE_Line_Number,Effective_Date,Entered_Date,Entered_Time,Entered_By,Entered_By_ID,Source,Manual_Entry,JE_Header_Description,GL_Account_Number,GL_Account_Name,Amount,Amount_Credit_Debit_Indicator,Amount_Currency,JE_Line_Description,Business_Unit_Party,Reverses_Journal_ID");
      expect(gl).toHaveLength(1 + 6 * 2);
      expect(gl[1].split(",").slice(0, 3)).toEqual(["1", "1", "2025-02-01"]);
      expect(gl[1]).toMatch(/,100.00,D,MVR,/);
      expect(gl[2]).toMatch(/,-100.00,C,MVR,/);

      // The trial balance closes on MVR 3,500 owed to the supplier; payables ageing agrees.
      expect(files["01 Trial balance.csv"]).toMatch(/2100,Suppliers we owe,liability,0.00,0.00,3500.00,0.00,3500.00/);
      expect(files["05 Payables ageing.csv"]).toMatch(/Total,,,,,,3500.00/);
      expect(files["10 Sample register.csv"].trim().split("\r\n")).toHaveLength(1 + 3);
      expect(files["12 Seal.txt"]).toMatch(/Intact: all 6 entries/);

      // The pack is on record by its fingerprint.
      expect(await pack.packs(client, { companyId, periodId })).toEqual([expect.objectContaining({ sha256: made.sha, files: made.files.length })]);
      // A spreadsheet will not run a description as a formula.
      expect(pack.cell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
      expect(pack.cell("-12.50")).toBe("-12.50");
      void accounts;
    }));

  it("asks the company questions on a document or the audit as a whole, and follows them to closed", () =>
    inRollback(async (client) => {
      const { companyId, userId } = await withBills(client);
      await client.query("RESET ROLE"); // people are added as the owner would
      await client.query("INSERT INTO memberships (company_id, user_id, role) VALUES ($1, $2, 'auditor')", [companyId, userId]);
      const { rows: u } = await client.query("INSERT INTO users (name, email, password_hash) VALUES ('Aisha', $1, 'x') RETURNING id", [`aisha+${Math.random().toString(36).slice(2)}@sentryfi.invalid`]);
      const aisha = u[0].id;
      await client.query("INSERT INTO memberships (company_id, user_id, role) VALUES ($1, $2, 'accountant')", [companyId, aisha]);
      await assumeIdentity(client, { companyId, userId });
      const can = (list) => (a) => list.includes(a);
      const auditor = { companyId, user: { id: userId, name: "Test" }, can: can(["read", "read_trail", "audit"]) };
      const accountant = { companyId, user: { id: aisha, name: "Aisha" }, can: can(["read", "record", "read_trail", "audit"]) };
      const { id: periodId } = await audit.createPeriod(client, { companyId, userId, from: "2025-01-01", to: "2025-12-31" });
      const big = await audit.draw(client, { companyId, userId, periodId, kind: "bill", how: "over", over: "500" });
      const item = (await audit.sample(client, { companyId, sampleId: big.id })).items[0];

      await expect(questions.ask(client, auditor, { periodId, kind: "bill", recordId: item.docId, body: "Where is the delivery note?" })).rejects.toThrow(/who in the company/);
      const onBill = await questions.ask(client, auditor, { periodId, kind: "bill", recordId: item.docId, body: "Where is the delivery note?", askOf: aisha, dueOn: "2020-01-01" });
      await questions.ask(client, auditor, { periodId, kind: "audit_period", body: "Please send the loan agreement.", askOf: aisha, dueOn: "2999-01-01" });
      let q = await questions.list(client, auditor, { periodId });
      expect(q.counts).toEqual({ open: 1, late: 1, answered: 0, closed: 0 });
      expect(q.questions.find((x) => x.kind === "bill")).toMatchObject({ about: "Bill Island Hardware IH-6", status: "late", of: "Aisha", by: "Test" });
      expect(q.questions.find((x) => x.kind === "audit_period")).toMatchObject({ about: "The audit as a whole", href: `/audit/${periodId}?tab=questions` });

      // Aisha answers on the bill's own conversation: the ask is answered, her reply shows.
      await comments.post(client, accountant, { kind: "bill", id: item.docId, body: "Attached: DN-88, signed on site." });
      q = await questions.list(client, auditor, { periodId });
      expect(q.questions.find((x) => x.kind === "bill")).toMatchObject({ status: "answered", replies: 1, latest: expect.objectContaining({ by: "Aisha", body: "Attached: DN-88, signed on site." }) });
      // The auditor closes it.
      await comments.settle(client, auditor, onBill.id, true);
      expect((await questions.list(client, auditor, { periodId })).counts).toEqual({ open: 1, late: 0, answered: 0, closed: 1 });
      await expect(questions.ask(client, auditor, { periodId, kind: "shipment", recordId: item.docId, body: "x?", askOf: aisha })).rejects.toThrow(/document, an entry/);
    }));

  it("takes proposed adjustments to a decision by someone else, and sums what stays uncorrected against materiality", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await withBills(client);
      await client.query("RESET ROLE");
      await client.query("INSERT INTO memberships (company_id, user_id, role) VALUES ($1, $2, 'auditor')", [companyId, userId]);
      const { rows: u } = await client.query("INSERT INTO users (name, email, password_hash) VALUES ('Aisha', $1, 'x') RETURNING id", [`aisha+${Math.random().toString(36).slice(2)}@sentryfi.invalid`]);
      const aisha = u[0].id;
      await client.query("INSERT INTO memberships (company_id, user_id, role) VALUES ($1, $2, 'accountant')", [companyId, aisha]);
      await assumeIdentity(client, { companyId, userId });
      const { id: periodId } = await audit.createPeriod(client, { companyId, userId, from: "2025-01-01", to: "2025-12-31" });
      const line = (accountId, debit, credit) => ({ accountId, debit, credit });
      const propose = (amount, reason, klass = "factual") =>
        adjust.propose(client, { companyId, userId, periodId, klass, reason, lines: [line(accounts.expense, amount, null), line(accounts.payable, null, amount)] });

      expect(await adjust.setMateriality(client, { companyId, userId, periodId, materiality: "1000" })).toEqual({ materiality: "1,000.00", performance: "750.00", trivial: "50.00" });
      await expect(adjust.propose(client, { companyId, userId, periodId, klass: "factual", reason: "Unrecorded bill", lines: [line(accounts.expense, "300", null), line(accounts.payable, null, "299")] })).rejects.toThrow(/does not balance/);
      const one = await propose("300", "An unrecorded December bill from Island Hardware");
      const two = await propose("200", "Accrual for December electricity", "judgemental");
      const three = await propose("700", "Stock obsolescence provision", "judgemental");
      const four = await propose("40", "Rounding on the payroll accrual");
      expect([one.number, two.number, three.number, four.number]).toEqual([1, 2, 3, 4]);

      // The one who proposed cannot decide; someone who may adjust does.
      await expect(adjust.decide(client, { companyId, userId, id: one.id, how: "accept" })).rejects.toThrow(/Someone other than/);
      await assumeIdentity(client, { companyId, userId: aisha });
      const done = await adjust.decide(client, { companyId, userId: aisha, id: one.id, how: "accept", note: "Agreed, the bill arrived late" });
      expect(done.status).toBe("accepted");
      const { rows: e } = await client.query("SELECT entry_date::text AS day, narrative FROM journal_entries WHERE company_id = $1 AND entry_no = $2", [companyId, done.entryNo]);
      expect(e[0]).toEqual({ day: "2025-12-31", narrative: "Adjustment: Audit adjustment AJ-1 (factual): An unrecorded December bill from Island Hardware" });
      await expect(adjust.decide(client, { companyId, userId: aisha, id: two.id, how: "pass", note: "" })).rejects.toThrow(/Say why it is left unbooked/);
      await adjust.decide(client, { companyId, userId: aisha, id: two.id, how: "pass", note: "Immaterial; it reverses in January" });
      await adjust.decide(client, { companyId, userId: aisha, id: three.id, how: "reject", note: "The stock is still selling at full price" });
      await expect(adjust.decide(client, { companyId, userId: aisha, id: one.id, how: "reject", note: "again" })).rejects.toThrow(/accepted already/);
      await assumeIdentity(client, { companyId, userId });
      await adjust.withdraw(client, { companyId, userId, id: four.id, note: "Explained by the payroll schedule" });

      // To the company, the totals but not the auditor's thresholds.
      const seen = await adjust.list(client, { companyId, periodId });
      expect(seen).toMatchObject({ seesMateriality: false, materiality: null, uncorrected: { profit: "-900.00", standing: null, share: null } });
      expect(seen.adjustments.every((x) => x.trivial === false)).toBe(true);
      const l = await adjust.list(client, { companyId, periodId, auditor: true });
      expect(l.counts).toEqual({ proposed: 0, accepted: 1, passed: 1, rejected: 1, withdrawn: 1 });
      expect(l.adjustments[0]).toMatchObject({ ref: "AJ-1", status: "accepted", decidedBy: "Aisha", profitEffect: "-300.00", assetsEffect: "-300.00", entryNo: done.entryNo });
      expect(l.adjustments[3]).toMatchObject({ status: "withdrawn", trivial: true });
      // Uncorrected: the passed and the rejected, MVR 900 off profit; over performance (750), under overall (1,000).
      expect(l.uncorrected).toMatchObject({ count: 2, profit: "-900.00", standing: "near", share: 90, byClass: { factual: "0.00", judgemental: "-900.00", projected: "0.00" } });
    }));

  it("attends a blind count: cut-off captured, test counts both ways kept from the counter, set against the count once submitted", () =>
    inRollback(async (client) => {
      const { companyId, userId } = await aCompanyWith(client);
      await client.query("RESET ROLE");
      await client.query("INSERT INTO memberships (company_id, user_id, role) VALUES ($1, $2, 'auditor')", [companyId, userId]);
      const { rows: u } = await client.query("INSERT INTO users (name, email, password_hash) VALUES ('Aisha', $1, 'x') RETURNING id", [`aisha+${Math.random().toString(36).slice(2)}@sentryfi.invalid`]);
      const aisha = u[0].id;
      await client.query("INSERT INTO memberships (company_id, user_id, role) VALUES ($1, $2, 'accountant')", [companyId, aisha]);
      await assumeIdentity(client, { companyId, userId: aisha });
      const item = async (name) => (await client.query("INSERT INTO stock_items (company_id, name, unit, created_by) VALUES ($1,$2,'bag',$3) RETURNING id", [companyId, name, aisha])).rows[0].id;
      const cement = await item("Cement");
      const sand = await item("Sand");
      const tiles = await item("Tiles");
      await stock.opening(client, { companyId, userId: aisha, itemId: cement, quantity: "10", unitCost: "100", on: "2025-01-01" });
      await stock.opening(client, { companyId, userId: aisha, itemId: sand, quantity: "5", unitCost: "50", on: "2025-01-01" });
      const c = await counts.create(client, { companyId, userId: aisha, kind: "full", placeId: null, counterId: aisha });

      await assumeIdentity(client, { companyId, userId });
      const { id: periodId } = await audit.createPeriod(client, { companyId, userId, from: "2025-01-01", to: new Date().toISOString().slice(0, 10) });
      const near = await count.near(client, { companyId, periodId });
      expect(near.find((x) => x.id === c.id)).toMatchObject({ status: "counting", lines: 2 });
      const o = await count.observe(client, { companyId, userId, periodId, countId: c.id, picks: 2 });
      expect(o.picked).toBe(2);
      let v = await count.view(client, { companyId, observationId: o.id });
      expect(v.cutoff.move).toMatchObject({ kind: "opening" });
      expect(v.tests.map((t) => [t.name, t.direction, t.why])).toEqual([["Cement", "sheet_to_floor", "Among the most valuable on the sheet"], ["Sand", "sheet_to_floor", "At random from the sheet"]]);

      await count.record(client, { companyId, userId, observationId: o.id, itemId: cement, direction: "sheet_to_floor", qty: "10" });
      await count.record(client, { companyId, userId, observationId: o.id, itemId: sand, direction: "sheet_to_floor", qty: "5" });
      await count.record(client, { companyId, userId, observationId: o.id, itemId: tiles, direction: "floor_to_sheet", qty: "3", note: "Behind the door" });
      await expect(count.record(client, { companyId, userId, observationId: o.id, itemId: tiles, direction: "floor_to_sheet", qty: "" })).rejects.toThrow(/quantity/);
      // Before the count is submitted, nothing of the company's count is shown.
      v = await count.view(client, { companyId, observationId: o.id });
      expect(v.tests.every((t) => t.counted === null && t.finding === null)).toBe(true);

      // The counter counts blind, and cannot see the auditor's figures.
      await assumeIdentity(client, { companyId, userId: aisha });
      expect((await client.query("SELECT count(*)::int n FROM audit_test_counts")).rows[0].n).toBe(0);
      await counts.saveLine(client, { companyId, userId: aisha, countId: c.id, itemId: cement, counted: "9" });
      await counts.saveLine(client, { companyId, userId: aisha, countId: c.id, itemId: sand, counted: "5" });
      await counts.submit(client, { companyId, userId: aisha, countId: c.id });

      await assumeIdentity(client, { companyId, userId });
      v = await count.view(client, { companyId, observationId: o.id });
      const by = Object.fromEntries(v.tests.map((t) => [t.name, t]));
      expect(by.Cement.finding).toMatchObject({ kind: "differs", said: "The counter found 9, the auditor 10: undercounted by 1 bag.", value: "100.00" });
      expect(by.Sand.finding.kind).toBe("agrees");
      expect(by.Tiles.finding).toMatchObject({ kind: "missing" });
      expect(v.summary).toMatchObject({ tests: 3, done: 3, wrong: 2, wrongValue: "100.00", counted: true });

      await count.conclude(client, { companyId, userId, observationId: o.id, instructions: "Clear, with tags and a count sheet per aisle.", conclusion: "One undercount of cement; tiles not on the sheet. Extend the count to the back store." });
      await expect(count.record(client, { companyId, userId, observationId: o.id, itemId: cement, direction: "sheet_to_floor", qty: "11" })).rejects.toThrow(/kept as it was/);
      expect((await count.list(client, { companyId, periodId }))[0]).toMatchObject({ tests: 3, done: 3 });
    }));

  it("signs off only when nothing blocks it, with a note for what is unfinished, and then keeps the period's work as it was", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await withBills(client);
      await client.query("RESET ROLE");
      await client.query("INSERT INTO memberships (company_id, user_id, role) VALUES ($1, $2, 'auditor')", [companyId, userId]);
      const { rows: u } = await client.query("INSERT INTO users (name, email, password_hash) VALUES ('Aisha', $1, 'x') RETURNING id", [`aisha+${Math.random().toString(36).slice(2)}@sentryfi.invalid`]);
      const aisha = u[0].id;
      await client.query("INSERT INTO memberships (company_id, user_id, role) VALUES ($1, $2, 'accountant')", [companyId, aisha]);
      await assumeIdentity(client, { companyId, userId });
      const req = { companyId, user: { id: userId, name: "Test" }, can: () => true };
      const { id: periodId } = await audit.createPeriod(client, { companyId, userId, from: "2025-01-01", to: "2025-12-31" });
      await audit.draw(client, { companyId, userId, periodId, kind: "bill", how: "random", size: 2 });
      const aj = await adjust.propose(client, { companyId, userId, periodId, klass: "factual", reason: "Unrecorded accrual", lines: [{ accountId: accounts.expense, debit: "50" }, { accountId: accounts.payable, credit: "50" }] });

      let r = await signoffs.readiness(client, req, { periodId });
      expect(r.items.find((i) => i.key === "adjustments").state).toBe("block");
      expect(r.items.find((i) => i.key === "samples")).toMatchObject({ state: "warn", said: "2 of 2 items not yet seen." });
      await expect(signoffs.signOff(client, req, { periodId, opinion: "unmodified" })).rejects.toThrow(/still waiting for the company/);

      await assumeIdentity(client, { companyId, userId: aisha });
      await adjust.decide(client, { companyId, userId: aisha, id: aj.id, how: "accept" });
      await assumeIdentity(client, { companyId, userId });
      await expect(signoffs.signOff(client, req, { periodId, opinion: "unmodified" })).rejects.toThrow(/Say in a note why you sign anyway/);
      const done = await signoffs.signOff(client, req, { periodId, opinion: "unmodified", note: "Samples reviewed on paper at the client's office." });
      expect(done.head).toMatchObject({ no: expect.any(String), hash: expect.stringMatching(/^[0-9a-f]{64}$/) });
      const p = await audit.period(client, { companyId, periodId });
      expect(p.signedOff).toMatchObject({ by: "Test", opinion: "unmodified", head: { sealOk: true, loose: expect.arrayContaining(["samples"]) } });
      await expect(signoffs.signOff(client, req, { periodId, opinion: "unmodified", note: "again and again" })).rejects.toThrow(/signed off already/);

      // Frozen by the database: nothing more is drawn, ticked or set; the pack can still be made.
      // (Each refusal aborts its own transaction, as a request would; a savepoint stands in for that here.)
      const refusedIn = async (fn) => {
        await client.query("SAVEPOINT frozen");
        await expect(fn()).rejects.toThrow(/signed off/);
        await client.query("ROLLBACK TO SAVEPOINT frozen");
      };
      const s = (await audit.period(client, { companyId, periodId })).samples[0];
      const item = (await audit.sample(client, { companyId, sampleId: s.id })).items[0];
      await refusedIn(() => audit.draw(client, { companyId, userId, periodId, kind: "bill", how: "random", size: 1 }));
      await refusedIn(() => audit.see(client, { companyId, userId, sampleId: s.id, itemId: item.id, note: "late tick" }));
      await refusedIn(() => adjust.setMateriality(client, { companyId, userId, periodId, materiality: "1000" }));
      expect((await pack.build(client, { companyId, userId, periodId })).files.length).toBeGreaterThan(10);
    }));

  it("lays monetary-unit hits end to end from the seed's start", () => {
    const rows = [
      { id: "a", no: "1", day: "2025-01-01", amount: "100" },
      { id: "b", no: "2", day: "2025-01-02", amount: "900" },
      { id: "c", no: "3", day: "2025-01-03", amount: "50" },
    ];
    const { picked, interval } = audit.mus("seed", rows, 2);
    expect(interval).toBe(525n);
    expect(picked.map((r) => r.id)).toContain("b");
    expect(audit.mus("seed", rows, 2).picked).toEqual(picked);
  });
});

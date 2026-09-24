/**
 * A month's payroll through the books: people added, a run made for everyone
 * employed, overtime and an advance entered, approved into one balanced entry
 * of totals, paid out, and the payments clearing what the run owed. An
 * approved run is frozen; one with something paid cannot be reopened.
 */
import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import * as payroll from "../src/ledger/payroll";

afterAll(closePool);

const balance = async (client, companyId, code) =>
  BigInt((await client.query(
    "SELECT COALESCE(SUM(l.debit_laari - l.credit_laari), 0) AS b FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE a.company_id = $1 AND a.code = $2",
    [companyId, code]
  )).rows[0].b);

async function aPayroll(client) {
  const co = await aCompanyWith(client);
  const { companyId, userId } = co;
  await assumeIdentity(client, { companyId, userId });
  const bank = (await client.query("INSERT INTO accounts (company_id, code, name, type) VALUES ($1,'1101','BML current','asset') RETURNING id", [companyId])).rows[0].id;
  const add = (p) => payroll.savePerson(client, { companyId, userId, p });
  co.bank = bank;
  co.aishath = (await add({ name: "Aishath Rasheed", nationality: "MV", dob: "1990-03-02", joinedOn: "2022-01-01", basic: "20800.00", bankAccount: "7701234567890", items: [{ kind: "allowance", name: "Island allowance", amount: "5000.00" }] })).id;
  co.rahim = (await add({ name: "Rahim Uddin", nationality: "BD", joinedOn: "2026-09-16", basic: "9000.00", bankAccount: "7709999999999" })).id;
  co.left = (await add({ name: "Gone Before", nationality: "MV", joinedOn: "2020-01-01", leftOn: "2026-08-31", basic: "10000.00" })).id;
  return co;
}

describe("a month's payroll", () => {
  it("runs for everyone employed in the month, approves into one balanced entry, and pays it out", () =>
    inRollback(async (client) => {
      const co = await aPayroll(client);
      const { companyId, userId } = co;
      await payroll.giveAdvance(client, { companyId, userId, employeeId: co.rahim, amount: "1500.00", instalment: "500.00", givenOn: "2026-09-18", fromAccountId: co.bank });

      const run = await payroll.createRun(client, { companyId, userId, period: "2026-09" });
      let s = await payroll.showRun(client, { companyId, runId: run.id });
      expect(s.lines.map((l) => l.person.name)).toEqual(["Aishath Rasheed", "Rahim Uddin"]);
      // The advance's instalment is put in for the month.
      expect(s.lines.find((l) => l.person.id === co.rahim).inputs.advance).toBe("500.00");

      await payroll.setInputs(client, { companyId, runId: run.id, employeeId: co.aishath, inputs: { overtime: { normal: "10" } } });
      s = await payroll.showRun(client, { companyId, runId: run.id });
      const a = s.lines.find((l) => l.person.id === co.aishath).slip;
      // 20,800 + 5,000 + 10 h at 125% of 100.00 = 27,050; pension 7% of basic = 1,456.
      expect(a.gross).toBe("27,050.00");
      expect(a.employeePension).toBe("1,456.00");
      const r = s.lines.find((l) => l.person.id === co.rahim).slip;
      // Half of September: 4,500, less the 500 instalment.
      expect(r.gross).toBe("4,500.00");
      expect(r.net).toBe("4,000.00");

      const done = await payroll.approve(client, { companyId, userId, runId: run.id });
      expect(done.entryNo).toBeTruthy();
      expect(await balance(client, companyId, "5210")).toBe(3155000n);
      expect(await balance(client, companyId, "5230")).toBe(145600n);
      expect(await balance(client, companyId, "2410")).toBe(-(2559400n + 400000n));
      expect(await balance(client, companyId, "2420")).toBe(-291200n);
      // The advance: 1,500 lent, 500 repaid.
      expect(await balance(client, companyId, "1330")).toBe(100000n);

      // Frozen: nothing more can be entered.
      await expect(payroll.setInputs(client, { companyId, runId: run.id, employeeId: co.aishath, inputs: { bonus: "1" } })).rejects.toThrow(/approved/);

      await payroll.pay(client, { companyId, userId, runId: run.id, kind: "wages", fromAccountId: co.bank, paidOn: "2026-09-30" });
      await payroll.pay(client, { companyId, userId, runId: run.id, kind: "pension", fromAccountId: co.bank, paidOn: "2026-10-12" });
      expect(await balance(client, companyId, "2410")).toBe(0n);
      expect(await balance(client, companyId, "2420")).toBe(0n);
      await expect(payroll.pay(client, { companyId, userId, runId: run.id, kind: "wages", fromAccountId: co.bank, paidOn: "2026-09-30" })).rejects.toThrow(/paid on/);
      await expect(payroll.reopen(client, { companyId, userId, runId: run.id, reason: "wrong" })).rejects.toThrow(/adjustment run/);

      const slip = await payroll.payslip(client, { companyId, runId: run.id, employeeId: co.aishath });
      expect(slip.ytd.gross).toBe("27,050.00");
      expect((await payroll.file(client, { companyId, runId: run.id, which: "bank" })).body).toMatch(/7701234567890/);
    }));

  it("reopens an approved run with nothing paid by reversing its entry", () =>
    inRollback(async (client) => {
      const co = await aPayroll(client);
      const { companyId, userId } = co;
      const run = await payroll.createRun(client, { companyId, userId, period: "2026-09" });
      await payroll.approve(client, { companyId, userId, runId: run.id });
      await payroll.reopen(client, { companyId, userId, runId: run.id, reason: "Forgot overtime" });
      expect(await balance(client, companyId, "5210")).toBe(0n);
      const s = await payroll.showRun(client, { companyId, runId: run.id });
      expect(s.status).toBe("draft");
      await expect(payroll.createRun(client, { companyId, userId, period: "2026-09" })).rejects.toThrow(/already a pay run/);
    }));

  it("refuses a run whose deductions come to more than the pay", () =>
    inRollback(async (client) => {
      const co = await aPayroll(client);
      const { companyId, userId } = co;
      const run = await payroll.createRun(client, { companyId, userId, period: "2026-09" });
      await payroll.setInputs(client, { companyId, runId: run.id, employeeId: co.rahim, inputs: { otherDeductions: [{ name: "Damage", amount: "9000" }] } });
      await expect(payroll.approve(client, { companyId, userId, runId: run.id })).rejects.toThrow(/Rahim Uddin: Deductions come to more than the pay/);
    }));
});

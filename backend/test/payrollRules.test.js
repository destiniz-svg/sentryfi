/**
 * Payroll arithmetic against figures worked by hand: Maldivian pension and
 * withholding band by band, an expatriate's tax without pension, a joiner's
 * part month, overtime at the published hourly basis, the deduction cap, the
 * service charge shared by days, and the UAE's gratuity and GPSSA.
 */
import { describe, it, expect } from "vitest";
import { payslip, shareServiceCharge, dueFor, bandTax, PAYROLL } from "../src/ledger/payrollRules";

const MVR = (n) => BigInt(Math.round(n * 100));
const national = { name: "Aishath", nationality: "MV", dob: "1990-03-02", joinedOn: "2020-01-01" };

describe("Maldives", () => {
  it("takes 7% pension from basic only, and no tax under MVR 60,000", () => {
    const s = payslip({ pack: "MV", period: "2026-09", employee: { ...national, basic: MVR(20000), allowances: [{ name: "Island allowance", amount: MVR(5000) }] } });
    expect(s.gross).toBe(MVR(25000));
    expect(s.employeePension).toBe(MVR(1400));
    expect(s.employerPension).toBe(MVR(1400));
    expect(s.tax).toBe(0n);
    expect(s.net).toBe(MVR(23600));
  });

  it("withholds 5.5% on the band above 60,000, after the employee's pension", () => {
    const s = payslip({ pack: "MV", period: "2026-09", employee: { ...national, basic: MVR(100000) } });
    expect(s.taxable).toBe(MVR(93000));
    expect(s.tax).toBe(MVR(1815));
    expect(s.net).toBe(MVR(91185));
  });

  it("taxes an expatriate on every band, with no pension", () => {
    const s = payslip({ pack: "MV", period: "2026-09", employee: { name: "Rahim", nationality: "BD", basic: MVR(250000), joinedOn: "2024-01-01" } });
    expect(s.employeePension).toBe(0n);
    expect(s.tax).toBe(MVR(2200 + 4000 + 6000 + 7500));
    expect(s.net).toBe(MVR(250000 - 19700));
  });

  it("pays a joiner for the days employed, and overtime at a 208-hour month", () => {
    const s = payslip({ pack: "MV", period: "2026-09", employee: { ...national, basic: MVR(20800), joinedOn: "2026-09-16" }, inputs: { overtime: { normal: "10", holiday: "2" } } });
    expect(s.earnings.find((e) => e.key === "basic").amount).toBe(MVR(10400));
    expect(s.earnings.find((e) => e.key === "overtime_normal").amount).toBe(MVR(1250));
    expect(s.earnings.find((e) => e.key === "overtime_holiday").amount).toBe(MVR(300));
  });

  it("warns when agreed deductions pass a third of pay, and blocks a negative net", () => {
    const s = payslip({ pack: "MV", period: "2026-09", employee: { ...national, basic: MVR(9000) }, inputs: { advance: MVR(4000) } });
    expect(s.warnings.join(" ")).toMatch(/third of pay/);
    const t = payslip({ pack: "MV", period: "2026-09", employee: { ...national, basic: MVR(9000) }, inputs: { advance: MVR(12000) } });
    expect(t.blockers.join(" ")).toMatch(/more than the pay/);
  });

  it("warns under the minimum wage for Maldivians only, at the tourism rate for a resort", () => {
    const low = payslip({ pack: "MV", period: "2026-09", employee: { ...national, basic: MVR(6000) }, company: { tourism: true } });
    expect(low.warnings.join(" ")).toMatch(/minimum wage of 7,000.00/);
    const expat = payslip({ pack: "MV", period: "2026-09", employee: { name: "R", nationality: "IN", basic: MVR(6000) }, company: { tourism: true } });
    expect(expat.warnings.join(" ")).not.toMatch(/minimum wage/);
  });

  it("shares service charge after the admin fee, by days worked, adding up exactly", () => {
    const r = shareServiceCharge({ collected: MVR(10000), adminFeeBp: 100, people: [{ id: "a", days: "30" }, { id: "b", days: "30" }, { id: "c", days: "15" }] });
    expect(r.pool).toBe(MVR(9900));
    expect(r.shares.map((s) => s.amount)).toEqual([MVR(3960), MVR(3960), MVR(1980)]);
  });

  it("puts withholding and pension due on the 15th of the next month", () => {
    expect(dueFor("2026-12", PAYROLL.MV.tax.dueDay)).toBe("2027-01-15");
    expect(bandTax(MVR(60000), PAYROLL.MV.tax.history[0].bands).tax).toBe(0n);
  });
});

describe("United Arab Emirates", () => {
  it("sets aside 21 days' basic a year as gratuity for an expatriate, with no tax", () => {
    const s = payslip({ pack: "AE", period: "2026-09", employee: { name: "Ravi", nationality: "IN", basic: MVR(10000), joinedOn: "2024-02-01" } });
    expect(s.tax).toBe(0n);
    expect(s.gratuity).toBe(MVR(583.33));
    expect(s.net).toBe(MVR(10000));
  });

  it("takes GPSSA on basic and pensionable allowances for an Emirati", () => {
    const s = payslip({ pack: "AE", period: "2026-09", employee: { name: "Mariam", nationality: "AE", basic: MVR(15000), joinedOn: "2025-01-01", allowances: [{ name: "Housing", amount: MVR(5000), pensionable: true }] } });
    expect(s.employeePension).toBe(MVR(2200));
    expect(s.employerPension).toBe(MVR(3000));
    expect(s.gratuity).toBe(0n);
  });
});

/** The thirty-day cash line: arithmetic only, no database. */
import { describe, it, expect } from "vitest";
import { cashTrend, runway } from "../src/ledger/trend";

describe("the cash trend", () => {
  it("starts from the balance before the window and adds each day's movement", () => {
    const today = new Date("2026-09-23T10:00:00Z");
    const t = cashTrend("10000", [
      { day: "2026-08-24", amount: "500" }, // first day in the window
      { day: "2026-09-10", amount: "-2500" },
      { day: "2026-09-23", amount: "100" }, // today
    ], today);
    expect(t).toHaveLength(31);
    expect(t[0]).toBe(10500n);
    expect(t[17]).toBe(8000n); // 10 September
    expect(t[30]).toBe(8100n);
  });

  it("is flat when nothing moved", () => {
    const t = cashTrend(null, [], new Date("2026-09-23T00:00:00Z"));
    expect(new Set(t).size).toBe(1);
    expect(t[0]).toBe(0n);
  });
});

describe("runway", () => {
  it("counts money in against money out", () => {
    // Earning 900k and spending 1M a month: cash falls 100k, so 1M lasts 10 months.
    expect(runway("100000000", ["-10000000", "-10000000", "-10000000"])).toEqual({ months: 10, growing: false });
  });
  it("says cash is growing rather than giving a number", () => {
    expect(runway("100000000", ["-5000000", "20000000"])).toEqual({ months: null, growing: true });
  });
  it("says nothing without whole months or cash", () => {
    expect(runway("100000000", [])).toEqual({ months: null, growing: false });
    expect(runway("0", ["-100"])).toEqual({ months: null, growing: false });
    expect(runway("100", ["0", "0"])).toEqual({ months: null, growing: false }); // nothing moved: not growing
  });
});

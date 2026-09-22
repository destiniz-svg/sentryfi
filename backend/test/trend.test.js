/** The thirty-day cash line: arithmetic only, no database. */
import { describe, it, expect } from "vitest";
import { cashTrend } from "../src/ledger/trend";

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

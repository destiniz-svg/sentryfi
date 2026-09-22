/**
 * Money. No database needed: this is arithmetic, and it is the arithmetic that
 * everything else rests on.
 */

import { describe, it, expect } from "vitest";
import {
  toLaari,
  formatLaari,
  gstOnTop,
  gstWithin,
  allocate,
} from "../src/ledger/money";
import { splitTax } from "../src/ledger/bills";

describe("reading an amount", () => {
  it("reads the shapes a bill is actually written in", () => {
    expect(toLaari("4,250.50")).toBe(425050n);
    expect(toLaari(4250.5)).toBe(425050n);
    expect(toLaari("MVR 1,000.00")).toBe(100000n);
    expect(toLaari(".50")).toBe(50n);
  });

  it("rounds the third decimal rather than dropping it", () => {
    expect(toLaari("10.005")).toBe(1001n);
    expect(toLaari("10.004")).toBe(1000n);
  });

  it("refuses what it cannot read instead of guessing", () => {
    expect(() => toLaari("about four thousand")).toThrow();
    expect(() => toLaari("")).toThrow();
    expect(() => toLaari(NaN)).toThrow();
  });

  it("does not drift, which is the whole reason it exists", () => {
    // In floating point this sum is 69.99999999999966.
    let total = 0n;
    for (let i = 0; i < 1000; i += 1) total += toLaari("0.07");
    expect(total).toBe(7000n);
    expect(formatLaari(total)).toBe("70.00");
  });

  it("prints two decimals always, so 5 laari is not 0.5", () => {
    expect(formatLaari(5n)).toBe("0.05");
    expect(formatLaari(425050n)).toBe("4,250.50");
    expect(formatLaari(-425050n)).toBe("-4,250.50");
    expect(formatLaari(123456789n)).toBe("1,234,567.89");
  });
});

describe("splitting a total across shares", () => {
  it("never loses or invents a laari", () => {
    expect(allocate("100.00", [1, 1, 1]).reduce((a, b) => a + b, 0n)).toBe(10000n);
    expect(allocate("0.01", [1, 1, 1, 1, 1, 1, 1]).reduce((a, b) => a + b, 0n)).toBe(1n);
    expect(allocate("1000.00", [3, 1])).toEqual([75000n, 25000n]);
  });
});

describe("GST, which is quoted both ways round here", () => {
  it("computes each way", () => {
    expect(gstOnTop("1000.00", 800)).toBe(8000n);
    expect(gstWithin("1080.00", 800)).toBe(8000n);
  });

  it("gives different answers for the same printed figure", () => {
    // This is the error the whole design exists to prevent: reading an
    // exclusive bill as inclusive overstates the claim by 8%.
    const inclusive = splitTax("4250.50", "inclusive", 800);
    const exclusive = splitTax("4250.50", "exclusive", 800);

    expect(inclusive).toEqual({ net: 393565n, tax: 31485n, gross: 425050n });
    expect(exclusive).toEqual({ net: 425050n, tax: 34004n, gross: 459054n });
    expect(exclusive.gross - inclusive.gross).toBe(34004n);
  });

  it("always has the parts add back to the whole", () => {
    for (const amount of ["4250.50", "0.01", "999999.99", "1.00", "33.33"]) {
      for (const treatment of ["inclusive", "exclusive"]) {
        const s = splitTax(amount, treatment, 800);
        expect(s.net + s.tax).toBe(s.gross);
      }
    }
  });

  it("claims nothing from a supplier who is not registered", () => {
    expect(splitTax("4250.50", "none_unregistered", null).tax).toBe(0n);
  });

  it("refuses to split a bill nobody has told it about", () => {
    expect(() => splitTax("100.00", "unknown", 800)).toThrow(/how its GST is quoted/i);
  });

  it("does not assume 8% when no rate was recorded", () => {
    expect(() => splitTax("100.00", "inclusive", null)).toThrow(/rate/i);
  });
});

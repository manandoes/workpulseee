import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPONENTS,
  computeTotals,
  linesFromComponents,
  parseLines,
  periodLabel,
  periodSlug,
  toMajorInput,
  toMinor,
  type SlipLine,
} from "@/lib/payroll";

const LINES: SlipLine[] = [
  { key: "basic", label: "Basic", kind: "earning", amountMinor: 5_000_00 },
  { key: "hra", label: "HRA", kind: "earning", amountMinor: 2_000_00 },
  { key: "pf", label: "PF", kind: "deduction", amountMinor: 600_00 },
  { key: "tax", label: "Tax", kind: "deduction", amountMinor: 400_00 },
];

describe("computeTotals", () => {
  it("sums earnings and deductions separately", () => {
    expect(computeTotals(LINES)).toEqual({
      grossMinor: 7_000_00,
      deductionMinor: 1_000_00,
      netMinor: 6_000_00,
    });
  });

  it("is zero for an empty slip", () => {
    expect(computeTotals([])).toEqual({
      grossMinor: 0,
      deductionMinor: 0,
      netMinor: 0,
    });
  });

  it("reports a negative net rather than clamping it", () => {
    // Deductions exceeding earnings is a data-entry mistake; the slip should
    // show it rather than silently display zero.
    const totals = computeTotals([
      { key: "basic", label: "Basic", kind: "earning", amountMinor: 100_00 },
      { key: "tax", label: "Tax", kind: "deduction", amountMinor: 150_00 },
    ]);
    expect(totals.netMinor).toBe(-50_00);
  });

  it("stays exact across many lines, where float rupees would drift", () => {
    const lines: SlipLine[] = Array.from({ length: 100 }, (_, index) => ({
      key: `c${index}`,
      label: `Component ${index}`,
      kind: "earning" as const,
      amountMinor: 10_10,
    }));
    expect(computeTotals(lines).grossMinor).toBe(101_000);
  });
});

describe("linesFromComponents", () => {
  it("carries the default amount onto the new slip", () => {
    const lines = linesFromComponents([
      { key: "basic", label: "Basic", kind: "earning", defaultMinor: 4_500_00 },
    ]);
    expect(lines).toEqual([
      { key: "basic", label: "Basic", kind: "earning", amountMinor: 4_500_00 },
    ]);
  });

  it("preserves the order of the company's structure", () => {
    const lines = linesFromComponents(DEFAULT_COMPONENTS);
    expect(lines.map((line) => line.key)).toEqual([
      "basic",
      "hra",
      "special",
      "pf",
      "tax",
    ]);
  });
});

describe("toMinor / toMajorInput", () => {
  it("round-trips a typed amount", () => {
    expect(toMinor("45000.50")).toBe(4_500_050);
    expect(toMajorInput(4_500_050)).toBe("45000.50");
  });

  it("rounds rather than truncating a third decimal", () => {
    expect(toMinor("10.005")).toBe(1001);
  });

  it("treats junk as zero", () => {
    expect(toMinor("")).toBe(0);
    expect(toMinor("abc")).toBe(0);
  });
});

describe("parseLines", () => {
  it("drops entries that are not real slip lines", () => {
    const parsed = parseLines([
      { key: "basic", label: "Basic", kind: "earning", amountMinor: 100 },
      { key: "bad", kind: "earning" },
      null,
      "nope",
    ]);
    expect(parsed).toHaveLength(1);
  });

  it("returns nothing for a non-array column", () => {
    expect(parseLines(null)).toEqual([]);
    expect(parseLines({})).toEqual([]);
  });
});

describe("period labels", () => {
  it("names the month", () => {
    expect(periodLabel(2026, 3)).toBe("March 2026");
  });

  it("zero-pads the slug so saved files sort chronologically", () => {
    expect(periodSlug(2026, 3)).toBe("2026-03");
    expect(periodSlug(2026, 11)).toBe("2026-11");
  });
});

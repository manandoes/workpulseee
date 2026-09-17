import { describe, expect, it } from "vitest";
import {
  freeSlots,
  hasConflict,
  mergeIntervals,
  workingHoursWindow,
} from "@/lib/calendar";

const d = (iso: string) => new Date(iso);

describe("mergeIntervals", () => {
  it("merges overlapping intervals", () => {
    const merged = mergeIntervals([
      { start: d("2026-09-16T09:00:00Z"), end: d("2026-09-16T10:00:00Z") },
      { start: d("2026-09-16T09:30:00Z"), end: d("2026-09-16T11:00:00Z") },
    ]);
    expect(merged).toEqual([
      { start: d("2026-09-16T09:00:00Z"), end: d("2026-09-16T11:00:00Z") },
    ]);
  });

  it("merges touching intervals", () => {
    const merged = mergeIntervals([
      { start: d("2026-09-16T09:00:00Z"), end: d("2026-09-16T10:00:00Z") },
      { start: d("2026-09-16T10:00:00Z"), end: d("2026-09-16T11:00:00Z") },
    ]);
    expect(merged).toEqual([
      { start: d("2026-09-16T09:00:00Z"), end: d("2026-09-16T11:00:00Z") },
    ]);
  });

  it("leaves a real gap alone", () => {
    const merged = mergeIntervals([
      { start: d("2026-09-16T09:00:00Z"), end: d("2026-09-16T10:00:00Z") },
      { start: d("2026-09-16T11:00:00Z"), end: d("2026-09-16T12:00:00Z") },
    ]);
    expect(merged).toHaveLength(2);
  });

  it("handles no intervals", () => {
    expect(mergeIntervals([])).toEqual([]);
  });

  it("sorts unsorted input before merging", () => {
    const merged = mergeIntervals([
      { start: d("2026-09-16T11:00:00Z"), end: d("2026-09-16T12:00:00Z") },
      { start: d("2026-09-16T09:00:00Z"), end: d("2026-09-16T10:00:00Z") },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].start).toEqual(d("2026-09-16T09:00:00Z"));
  });
});

describe("hasConflict", () => {
  const busy = [{ start: d("2026-09-16T09:00:00Z"), end: d("2026-09-16T10:00:00Z") }];

  it("detects an overlapping proposal", () => {
    expect(
      hasConflict({ start: d("2026-09-16T09:30:00Z"), end: d("2026-09-16T10:30:00Z") }, busy)
    ).toBe(true);
  });

  it("allows a proposal that only touches a busy edge", () => {
    expect(
      hasConflict({ start: d("2026-09-16T10:00:00Z"), end: d("2026-09-16T11:00:00Z") }, busy)
    ).toBe(false);
  });

  it("allows a proposal with no overlap", () => {
    expect(
      hasConflict({ start: d("2026-09-16T11:00:00Z"), end: d("2026-09-16T12:00:00Z") }, busy)
    ).toBe(false);
  });
});

describe("freeSlots", () => {
  it("returns the whole window when nothing is busy", () => {
    const start = d("2026-09-16T09:00:00Z");
    const end = d("2026-09-16T18:00:00Z");
    expect(freeSlots(start, end, [])).toEqual([{ start, end }]);
  });

  it("returns the gaps around busy blocks", () => {
    const start = d("2026-09-16T09:00:00Z");
    const end = d("2026-09-16T18:00:00Z");
    const busy = [{ start: d("2026-09-16T11:00:00Z"), end: d("2026-09-16T12:00:00Z") }];

    expect(freeSlots(start, end, busy)).toEqual([
      { start, end: d("2026-09-16T11:00:00Z") },
      { start: d("2026-09-16T12:00:00Z"), end },
    ]);
  });

  it("returns nothing when fully booked", () => {
    const start = d("2026-09-16T09:00:00Z");
    const end = d("2026-09-16T18:00:00Z");
    expect(freeSlots(start, end, [{ start, end }])).toEqual([]);
  });
});

describe("workingHoursWindow", () => {
  it("returns 09:00–18:00 UTC for the given day", () => {
    const window = workingHoursWindow(d("2026-09-16T23:59:00Z"));
    expect(window.start.toISOString()).toBe("2026-09-16T09:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-09-16T18:00:00.000Z");
  });
});

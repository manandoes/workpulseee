import { describe, expect, it } from "vitest";
import {
  addDays,
  bucketByDay,
  layoutOverlaps,
  shiftAnchor,
  startOfWeek,
  visibleDays,
  type GridItem,
} from "@/lib/calendar-grid";

const utc = (iso: string) => new Date(iso);

describe("visibleDays", () => {
  it("shows the Monday-start week containing the anchor", () => {
    // 2026-09-27 is a Sunday.
    expect(visibleDays("week", "2026-09-27")).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
    ]);
  });

  it("covers the whole month in whole weeks", () => {
    const days = visibleDays("month", "2026-09-15");
    // September 2026 starts on a Tuesday and ends on a Wednesday.
    expect(days[0]).toBe("2026-08-31");
    expect(days.at(-1)).toBe("2026-10-04");
    expect(days).toHaveLength(35);
  });

  it("uses six rows when the month needs them", () => {
    // August 2026 starts on a Saturday and ends on a Monday.
    expect(visibleDays("month", "2026-08-01")).toHaveLength(42);
  });
});

describe("date keys", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(startOfWeek("2026-09-21")).toBe("2026-09-21");
  });

  it("shifts a month anchor to the first of the neighbouring month", () => {
    expect(shiftAnchor("month", "2026-01-31", -1)).toBe("2025-12-01");
    expect(shiftAnchor("month", "2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftAnchor("week", "2026-09-27", 1)).toBe("2026-10-04");
  });
});

describe("bucketByDay", () => {
  const days = visibleDays("week", "2026-09-21");

  it("puts a meeting on the viewer's local day, not its UTC day", () => {
    // 20:00 UTC on the 21st is 01:30 on the 22nd in Kolkata.
    const meeting: GridItem = {
      kind: "meeting",
      id: "m1",
      title: "Sync",
      start: utc("2026-09-21T20:00:00Z"),
      end: utc("2026-09-21T21:00:00Z"),
    };

    expect(bucketByDay(days, [meeting], "UTC").get("2026-09-21")!.timed).toHaveLength(1);
    expect(bucketByDay(days, [meeting], "Asia/Kolkata").get("2026-09-22")!.timed).toHaveLength(1);
  });

  it("keeps a task on its UTC due date in every zone", () => {
    const task: GridItem = { kind: "task", id: "t1", dueDate: utc("2026-09-23T00:00:00Z") };
    const buckets = bucketByDay(days, [task], "America/Los_Angeles");
    expect(buckets.get("2026-09-23")!.allDay).toEqual([task]);
    expect(buckets.get("2026-09-22")!.allDay).toEqual([]);
  });

  it("spreads time off over every day it covers, clipped to the view", () => {
    const leave: GridItem = {
      kind: "timeOff",
      id: "r1",
      startDate: utc("2026-09-19T00:00:00Z"),
      endDate: utc("2026-09-22T00:00:00Z"),
    };
    const buckets = bucketByDay(days, [leave], "UTC");
    expect(buckets.get("2026-09-21")!.allDay).toEqual([leave]);
    expect(buckets.get("2026-09-22")!.allDay).toEqual([leave]);
    expect(buckets.get("2026-09-23")!.allDay).toEqual([]);
  });

  it("treats an all-day Google event's end date as exclusive", () => {
    const event: GridItem = {
      kind: "event",
      id: "g1",
      title: "Offsite",
      start: utc("2026-09-24T00:00:00Z"),
      end: utc("2026-09-26T00:00:00Z"),
      allDay: true,
    };
    const buckets = bucketByDay(days, [event], "UTC");
    expect(buckets.get("2026-09-24")!.allDay).toHaveLength(1);
    expect(buckets.get("2026-09-25")!.allDay).toHaveLength(1);
    expect(buckets.get("2026-09-26")!.allDay).toHaveLength(0);
  });

  it("orders time off before tasks and timed items by start", () => {
    const task: GridItem = { kind: "task", id: "t1", dueDate: utc("2026-09-21T00:00:00Z") };
    const leave: GridItem = {
      kind: "timeOff",
      id: "r1",
      startDate: utc("2026-09-21T00:00:00Z"),
      endDate: utc("2026-09-21T00:00:00Z"),
    };
    const late: GridItem = {
      kind: "meeting",
      id: "m2",
      title: "Late",
      start: utc("2026-09-21T15:00:00Z"),
      end: utc("2026-09-21T16:00:00Z"),
    };
    const early: GridItem = { ...late, id: "m1", start: utc("2026-09-21T09:00:00Z") };

    const bucket = bucketByDay(days, [task, late, leave, early], "UTC").get("2026-09-21")!;
    expect(bucket.allDay.map((item) => item.id)).toEqual(["r1", "t1"]);
    expect(bucket.timed.map((item) => item.id)).toEqual(["m1", "m2"]);
  });
});

describe("layoutOverlaps", () => {
  const at = (from: string, to: string) => ({
    start: utc(`2026-09-21T${from}:00Z`),
    end: utc(`2026-09-21T${to}:00Z`),
  });

  it("gives non-overlapping items the full width", () => {
    const placed = layoutOverlaps([at("09:00", "10:00"), at("10:00", "11:00")]);
    expect(placed.map((p) => [p.column, p.columns])).toEqual([
      [0, 1],
      [0, 1],
    ]);
  });

  it("splits a chain of overlaps into shared columns and reuses freed ones", () => {
    const placed = layoutOverlaps([
      at("09:00", "11:00"),
      at("09:30", "10:00"),
      at("10:00", "10:30"),
      at("12:00", "13:00"),
    ]);
    expect(placed.map((p) => [p.column, p.columns])).toEqual([
      [0, 2],
      [1, 2],
      [1, 2],
      [0, 1],
    ]);
  });
});

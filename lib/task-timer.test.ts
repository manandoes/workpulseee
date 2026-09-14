import { describe, expect, it } from "vitest";
import {
  endReasonFor,
  runningEntry,
  statusAfter,
  timerSummary,
  totalTrackedMs,
} from "@/lib/task-timer";

const NOW = new Date("2026-09-11T15:00:00.000Z");

describe("endReasonFor", () => {
  it("opens rather than closes on start", () => {
    expect(endReasonFor("start")).toBeNull();
  });

  it("tells a break apart from a stop", () => {
    expect(endReasonFor("break")).toBe("Break");
    expect(endReasonFor("stop")).toBe("Stopped");
    expect(endReasonFor("done")).toBe("Done");
  });
});

describe("statusAfter", () => {
  it("moves a backlog task into progress when its timer starts", () => {
    expect(statusAfter("start", "Todo")).toBe("InProgress");
  });

  it("leaves a task that has already moved on where its owner put it", () => {
    expect(statusAfter("start", "InProgress")).toBeNull();
    expect(statusAfter("start", "InReview")).toBeNull();
  });

  it("finishes the task on done, and is a no-op if it is already done", () => {
    expect(statusAfter("done", "InProgress")).toBe("Done");
    expect(statusAfter("done", "Done")).toBeNull();
  });

  it("changes nothing on a break or a stop — the work is still in flight", () => {
    expect(statusAfter("break", "InProgress")).toBeNull();
    expect(statusAfter("stop", "InProgress")).toBeNull();
  });
});

describe("totalTrackedMs", () => {
  it("sums closed intervals", () => {
    const entries = [
      {
        startedAt: new Date("2026-09-11T09:00:00.000Z"),
        endedAt: new Date("2026-09-11T11:00:00.000Z"),
      },
      {
        startedAt: new Date("2026-09-11T12:00:00.000Z"),
        endedAt: new Date("2026-09-11T12:30:00.000Z"),
      },
    ];

    expect(totalTrackedMs(entries, NOW)).toBe(2.5 * 60 * 60 * 1000);
  });

  it("counts the running interval up to now", () => {
    const entries = [
      {
        startedAt: new Date("2026-09-11T09:00:00.000Z"),
        endedAt: new Date("2026-09-11T10:00:00.000Z"),
      },
      { startedAt: new Date("2026-09-11T14:30:00.000Z"), endedAt: null },
    ];

    expect(totalTrackedMs(entries, NOW)).toBe(1.5 * 60 * 60 * 1000);
  });

  it("returns zero when nothing has been tracked", () => {
    expect(totalTrackedMs([], NOW)).toBe(0);
  });
});

describe("runningEntry", () => {
  it("finds the open interval", () => {
    const open = { startedAt: NOW, endedAt: null };
    expect(runningEntry([{ startedAt: NOW, endedAt: NOW }, open])).toBe(open);
  });

  it("is null when every interval is closed", () => {
    expect(runningEntry([{ startedAt: NOW, endedAt: NOW }])).toBeNull();
  });
});

describe("timerSummary", () => {
  it("banks closed intervals and points at the one in progress", () => {
    const startedAt = new Date("2026-09-11T14:30:00.000Z");
    const summary = timerSummary([
      {
        startedAt: new Date("2026-09-11T09:00:00.000Z"),
        endedAt: new Date("2026-09-11T10:00:00.000Z"),
      },
      { startedAt, endedAt: null },
    ]);

    // The running stretch is deliberately not in `closedMs` — the browser adds
    // it against its own clock.
    expect(summary.closedMs).toBe(60 * 60 * 1000);
    expect(summary.runningSince).toEqual(startedAt);
  });

  it("reports nothing running when every interval is closed", () => {
    expect(timerSummary([]).runningSince).toBeNull();
  });
});

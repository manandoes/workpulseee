import { describe, expect, it } from "vitest";
import { breakDurationMs, netWorkedMs, totalDurationMs } from "@/lib/attendance";

const NOW = new Date("2026-09-11T15:00:00.000Z");

describe("totalDurationMs", () => {
  it("sums closed sessions", () => {
    const sessions = [
      {
        clockInAt: new Date("2026-09-11T09:00:00.000Z"),
        clockOutAt: new Date("2026-09-11T11:00:00.000Z"),
      },
      {
        clockInAt: new Date("2026-09-11T12:00:00.000Z"),
        clockOutAt: new Date("2026-09-11T12:30:00.000Z"),
      },
    ];

    expect(totalDurationMs(sessions, NOW)).toBe(2.5 * 60 * 60 * 1000);
  });

  it("counts a still-open session up to now", () => {
    const sessions = [
      { clockInAt: new Date("2026-09-11T14:00:00.000Z"), clockOutAt: null },
    ];

    expect(totalDurationMs(sessions, NOW)).toBe(60 * 60 * 1000);
  });

  it("returns zero for no sessions", () => {
    expect(totalDurationMs([], NOW)).toBe(0);
  });
});

describe("breakDurationMs", () => {
  it("sums closed breaks", () => {
    const breaks = [
      {
        startedAt: new Date("2026-09-11T13:00:00.000Z"),
        endedAt: new Date("2026-09-11T13:15:00.000Z"),
      },
      {
        startedAt: new Date("2026-09-11T14:00:00.000Z"),
        endedAt: new Date("2026-09-11T14:10:00.000Z"),
      },
    ];

    expect(breakDurationMs(breaks, NOW)).toBe(25 * 60 * 1000);
  });

  it("counts a still-open break up to now", () => {
    const breaks = [
      { startedAt: new Date("2026-09-11T14:45:00.000Z"), endedAt: null },
    ];

    expect(breakDurationMs(breaks, NOW)).toBe(15 * 60 * 1000);
  });

  it("returns zero for no breaks", () => {
    expect(breakDurationMs([], NOW)).toBe(0);
  });
});

describe("netWorkedMs", () => {
  it("excludes closed breaks from the session total", () => {
    const sessions = [
      {
        clockInAt: new Date("2026-09-11T09:00:00.000Z"),
        clockOutAt: new Date("2026-09-11T15:00:00.000Z"),
      },
    ];
    const breaks = [
      {
        startedAt: new Date("2026-09-11T13:00:00.000Z"),
        endedAt: new Date("2026-09-11T13:30:00.000Z"),
      },
    ];

    expect(netWorkedMs(sessions, breaks, NOW)).toBe(5.5 * 60 * 60 * 1000);
  });

  it("counts an open break as time not worked, up to now", () => {
    const sessions = [
      { clockInAt: new Date("2026-09-11T09:00:00.000Z"), clockOutAt: null },
    ];
    const breaks = [
      { startedAt: new Date("2026-09-11T14:30:00.000Z"), endedAt: null },
    ];

    // 6h logged in (09:00-15:00), 0.5h of that is an open break.
    expect(netWorkedMs(sessions, breaks, NOW)).toBe(5.5 * 60 * 60 * 1000);
  });

  it("returns the session total when there are no breaks", () => {
    const sessions = [
      {
        clockInAt: new Date("2026-09-11T09:00:00.000Z"),
        clockOutAt: new Date("2026-09-11T10:00:00.000Z"),
      },
    ];

    expect(netWorkedMs(sessions, [], NOW)).toBe(60 * 60 * 1000);
  });
});

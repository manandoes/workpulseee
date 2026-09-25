import { describe, expect, it } from "vitest";
import {
  breakDurationMs,
  netWorkedMs,
  resolveLogoutNudge,
  totalDurationMs,
  type LogoutNudgeState,
} from "@/lib/attendance";

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

describe("resolveLogoutNudge", () => {
  // A day that ends at 18:00 and somebody who clocked in that morning.
  const CLOCK_IN = new Date("2026-09-11T09:00:00.000Z");
  const END_OF_DAY = new Date("2026-09-11T18:00:00.000Z");

  const state = (over: Partial<LogoutNudgeState> = {}): LogoutNudgeState => ({
    clockInAt: CLOCK_IN,
    endOfDayAt: END_OF_DAY,
    presenceConfirmedAt: null,
    logoutReminderAt: null,
    ...over,
  });

  const at = (iso: string) => new Date(iso);

  it("does nothing before the working day has ended", () => {
    expect(resolveLogoutNudge(state(), at("2026-09-11T17:30:00.000Z"))).toEqual({
      action: "none",
    });
  });

  it("does nothing in the hour after the day ends", () => {
    expect(resolveLogoutNudge(state(), at("2026-09-11T18:59:00.000Z"))).toEqual({
      action: "none",
    });
  });

  it("reminds an hour after the day ends", () => {
    const nudge = resolveLogoutNudge(state(), at("2026-09-11T19:00:00.000Z"));

    expect(nudge).toEqual({
      action: "remind",
      dueAt: at("2026-09-11T19:00:00.000Z"),
      recordedEndAt: END_OF_DAY,
    });
  });

  it("waits out the grace period before logging an unanswered session out", () => {
    const unanswered = state({ logoutReminderAt: at("2026-09-11T19:00:00.000Z") });

    expect(resolveLogoutNudge(unanswered, at("2026-09-11T19:29:00.000Z"))).toEqual(
      { action: "none" }
    );
  });

  it("logs an unanswered session out at the end of the working day, not now", () => {
    const unanswered = state({ logoutReminderAt: at("2026-09-11T19:00:00.000Z") });

    // Half an hour of silence: the session closes, but the hour and a half
    // nobody confirmed is not credited as worked time.
    expect(resolveLogoutNudge(unanswered, at("2026-09-11T19:30:00.000Z"))).toEqual(
      { action: "autoLogout", clockOutAt: END_OF_DAY }
    );
  });

  it("keeps the session open once they say they are here", () => {
    const answered = state({
      logoutReminderAt: at("2026-09-11T19:00:00.000Z"),
      presenceConfirmedAt: at("2026-09-11T19:05:00.000Z"),
    });

    expect(resolveLogoutNudge(answered, at("2026-09-11T19:45:00.000Z"))).toEqual({
      action: "none",
    });
  });

  it("asks again two hours after a reminder was answered", () => {
    const answered = state({
      logoutReminderAt: at("2026-09-11T19:00:00.000Z"),
      presenceConfirmedAt: at("2026-09-11T19:05:00.000Z"),
    });

    expect(resolveLogoutNudge(answered, at("2026-09-11T21:00:00.000Z"))).toEqual({
      action: "remind",
      dueAt: at("2026-09-11T21:00:00.000Z"),
      recordedEndAt: at("2026-09-11T19:05:00.000Z"),
    });
  });

  it("credits up to the last confirmation when a later reminder goes unanswered", () => {
    const ignoredSecond = state({
      logoutReminderAt: at("2026-09-11T21:00:00.000Z"),
      presenceConfirmedAt: at("2026-09-11T19:05:00.000Z"),
    });

    expect(
      resolveLogoutNudge(ignoredSecond, at("2026-09-11T21:30:00.000Z"))
    ).toEqual({ action: "autoLogout", clockOutAt: at("2026-09-11T19:05:00.000Z") });
  });

  it("counts from the clock-in for a session started after the day ended", () => {
    const late = state({ clockInAt: at("2026-09-11T20:00:00.000Z") });

    expect(resolveLogoutNudge(late, at("2026-09-11T20:30:00.000Z"))).toEqual({
      action: "none",
    });
    expect(resolveLogoutNudge(late, at("2026-09-11T21:00:00.000Z"))).toEqual({
      action: "remind",
      dueAt: at("2026-09-11T21:00:00.000Z"),
      recordedEndAt: at("2026-09-11T20:00:00.000Z"),
    });
  });

  it("reaches the same decision however late the sweep runs", () => {
    const unanswered = state({ logoutReminderAt: at("2026-09-11T19:00:00.000Z") });

    // Nothing here is a timer: a sweep that missed six hours of runs still
    // closes the session at the end of the working day.
    expect(resolveLogoutNudge(unanswered, at("2026-09-12T01:00:00.000Z"))).toEqual(
      { action: "autoLogout", clockOutAt: END_OF_DAY }
    );
  });
});

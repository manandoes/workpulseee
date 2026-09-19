import { describe, expect, it } from "vitest";
import { buildAttendanceDays, type DayLeaveWindow } from "@/lib/attendance-days";
import type { AttendanceSession, BreakInterval } from "@/lib/attendance";

const now = new Date("2026-03-20T12:00:00.000Z");

function session(clockInAt: string, clockOutAt: string | null = null): AttendanceSession {
  return { clockInAt: new Date(clockInAt), clockOutAt: clockOutAt ? new Date(clockOutAt) : null };
}

describe("buildAttendanceDays", () => {
  it("returns zeros for no data", () => {
    const result = buildAttendanceDays(
      { sessions: [], breaks: [], leaveWindows: [], fromDayKey: null, toDayKey: null, timeZone: "UTC" },
      now
    );
    expect(result).toEqual({
      presentDays: 0,
      fullDays: 0,
      halfDays: 0,
      leaveDays: 0,
      wfhDays: 0,
      days: [],
    });
  });

  it("groups two sessions on the same UTC day into one full day", () => {
    const result = buildAttendanceDays(
      {
        sessions: [
          session("2026-03-10T09:00:00.000Z", "2026-03-10T12:00:00.000Z"),
          session("2026-03-10T13:00:00.000Z", "2026-03-10T17:00:00.000Z"),
        ],
        breaks: [],
        leaveWindows: [],
        fromDayKey: null,
        toDayKey: null,
        timeZone: "UTC",
      },
      now
    );
    expect(result.fullDays).toBe(1);
    expect(result.presentDays).toBe(1);
    expect(result.days).toHaveLength(1);
    expect(result.days[0].sessionCount).toBe(2);
  });

  it("buckets a session by the viewer's zone, not UTC", () => {
    // 19:30 UTC on the 10th is already past midnight in Kolkata (+5:30).
    const sessions = [session("2026-03-10T19:30:00.000Z", "2026-03-10T20:30:00.000Z")];

    const kolkata = buildAttendanceDays(
      { sessions, breaks: [], leaveWindows: [], fromDayKey: null, toDayKey: null, timeZone: "Asia/Kolkata" },
      now
    );
    expect(kolkata.days[0].dayKey).toBe("2026-03-11");

    const losAngeles = buildAttendanceDays(
      {
        sessions,
        breaks: [],
        leaveWindows: [],
        fromDayKey: null,
        toDayKey: null,
        timeZone: "America/Los_Angeles",
      },
      now
    );
    expect(losAngeles.days[0].dayKey).toBe("2026-03-10");
  });

  it("attributes a midnight-spanning session to its clock-in day", () => {
    const result = buildAttendanceDays(
      {
        sessions: [session("2026-03-10T23:00:00.000Z", "2026-03-11T01:30:00.000Z")],
        breaks: [],
        leaveWindows: [],
        fromDayKey: null,
        toDayKey: null,
        timeZone: "UTC",
      },
      now
    );
    expect(result.days).toHaveLength(1);
    expect(result.days[0].dayKey).toBe("2026-03-10");
    expect(result.days[0].workedMs).toBe(2.5 * 60 * 60 * 1000);
  });

  it("survives a DST-transition day in America/New_York without duplicating or dropping a day", () => {
    // Clocks moved forward on 2026-03-08.
    const result = buildAttendanceDays(
      {
        sessions: [session("2026-03-08T13:00:00.000Z", "2026-03-08T20:00:00.000Z")],
        breaks: [],
        leaveWindows: [],
        fromDayKey: null,
        toDayKey: null,
        timeZone: "America/New_York",
      },
      now
    );
    expect(result.days).toHaveLength(1);
    expect(result.days[0].dayKey).toBe("2026-03-08");
  });

  it("counts a full-day approved Leave window with no attendance as leave days, not present", () => {
    const leaveWindows: DayLeaveWindow[] = [
      { type: "Leave", startDayKey: "2026-03-10", endDayKey: "2026-03-12", dayPart: "FullDay" },
    ];
    const result = buildAttendanceDays(
      { sessions: [], breaks: [], leaveWindows, fromDayKey: null, toDayKey: null, timeZone: "UTC" },
      now
    );
    expect(result.leaveDays).toBe(3);
    expect(result.presentDays).toBe(0);
    expect(result.days.map((d) => d.dayKey)).toEqual(["2026-03-10", "2026-03-11", "2026-03-12"]);
  });

  it("classifies a half-day leave on a day with a session as half, keeping worked time", () => {
    const leaveWindows: DayLeaveWindow[] = [
      { type: "Leave", startDayKey: "2026-03-10", endDayKey: "2026-03-10", dayPart: "FirstHalf" },
    ];
    const result = buildAttendanceDays(
      {
        sessions: [session("2026-03-10T13:00:00.000Z", "2026-03-10T17:00:00.000Z")],
        breaks: [],
        leaveWindows,
        fromDayKey: null,
        toDayKey: null,
        timeZone: "UTC",
      },
      now
    );
    expect(result.halfDays).toBe(1);
    expect(result.presentDays).toBe(1);
    expect(result.days[0].workedMs).toBe(4 * 60 * 60 * 1000);
  });

  it("classifies a WFH window as a present, non-office day", () => {
    const leaveWindows: DayLeaveWindow[] = [
      { type: "WFH", startDayKey: "2026-03-10", endDayKey: "2026-03-10", dayPart: null },
    ];
    const result = buildAttendanceDays(
      {
        sessions: [session("2026-03-10T09:00:00.000Z", "2026-03-10T17:00:00.000Z")],
        breaks: [],
        leaveWindows,
        fromDayKey: null,
        toDayKey: null,
        timeZone: "UTC",
      },
      now
    );
    expect(result.wfhDays).toBe(1);
    expect(result.presentDays).toBe(1);
    expect(result.fullDays).toBe(0);
  });

  it("gives full-day Leave precedence over an overlapping WFH window on the same day", () => {
    const leaveWindows: DayLeaveWindow[] = [
      { type: "WFH", startDayKey: "2026-03-10", endDayKey: "2026-03-10", dayPart: null },
      { type: "Leave", startDayKey: "2026-03-10", endDayKey: "2026-03-10", dayPart: "FullDay" },
    ];
    const result = buildAttendanceDays(
      { sessions: [], breaks: [], leaveWindows, fromDayKey: null, toDayKey: null, timeZone: "UTC" },
      now
    );
    expect(result.days[0].classification).toBe("leave");
    expect(result.leaveDays).toBe(1);
    expect(result.wfhDays).toBe(0);
  });

  it("clips days to the fromDayKey/toDayKey window", () => {
    const leaveWindows: DayLeaveWindow[] = [
      { type: "Leave", startDayKey: "2026-03-08", endDayKey: "2026-03-14", dayPart: "FullDay" },
    ];
    const result = buildAttendanceDays(
      {
        sessions: [],
        breaks: [],
        leaveWindows,
        fromDayKey: "2026-03-10",
        toDayKey: "2026-03-12",
        timeZone: "UTC",
      },
      now
    );
    expect(result.leaveDays).toBe(3);
    expect(result.days.map((d) => d.dayKey)).toEqual(["2026-03-10", "2026-03-11", "2026-03-12"]);
  });
});

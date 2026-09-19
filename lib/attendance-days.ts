import { netWorkedMs, breakDurationMs, type AttendanceSession, type BreakInterval } from "@/lib/attendance";
import { dayKeyInZone } from "@/lib/timezone";

/**
 * Day-level attendance bucketing (Performance section "attendance in days" —
 * present/half/leave/WFH day counts, each expandable to its own list of
 * dates), pure and `now`/`timeZone`-parameterised like `lib/attendance.ts` and
 * `lib/performance-breakdown.ts`, which this module sits alongside rather than
 * inside — bucketing by calendar day in an arbitrary zone is a different
 * dependency (`lib/timezone.ts`) from the duration math those modules do.
 *
 * A "day" is a calendar day *in the viewer's timezone* (`dayKeyInZone`), not a
 * UTC day — the whole reason this module takes a `timeZone` rather than
 * assuming one.
 */

export type DayClassification = "full" | "half" | "leave" | "wfh";

/** An approved Leave or WFH request, already resolved to the two fields that
 * matter for day classification — the data layer maps `Request` rows into
 * this so the pure function never sees Prisma's `RequestType`/`LeaveDayPart`
 * enums directly. */
export type DayLeaveWindow = {
  type: "Leave" | "WFH";
  /** Inclusive, in the same zone the caller is bucketing by. */
  startDayKey: string;
  endDayKey: string;
  dayPart: "FullDay" | "FirstHalf" | "SecondHalf" | null;
};

export type AttendanceDay = {
  /** `YYYY-MM-DD` in the resolved zone — stable sort key and React key. */
  dayKey: string;
  classification: DayClassification;
  /** Net worked ms on this day. 0 for a leave day with no clock-in. */
  workedMs: number;
  sessionCount: number;
};

export type AttendanceDaysBreakdown = {
  /** full + half + wfh — days the person was, in some form, working. */
  presentDays: number;
  fullDays: number;
  halfDays: number;
  leaveDays: number;
  wfhDays: number;
  /** Ascending by `dayKey` — the expandable detail. */
  days: readonly AttendanceDay[];
};

const EMPTY_BREAKDOWN: AttendanceDaysBreakdown = {
  presentDays: 0,
  fullDays: 0,
  halfDays: 0,
  leaveDays: 0,
  wfhDays: 0,
  days: [],
};

/** Every day key from `startDayKey` to `endDayKey` inclusive. String
 * comparison is enough to order `YYYY-MM-DD` keys, but enumerating the range
 * needs real dates — parsed as UTC noon so no zone's DST shift can push the
 * loop across a day boundary by mistake. */
function dayKeysInRange(startDayKey: string, endDayKey: string): string[] {
  const keys: string[] = [];
  const cursor = new Date(`${startDayKey}T12:00:00.000Z`);
  const end = new Date(`${endDayKey}T12:00:00.000Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return keys;

  while (cursor.getTime() <= end.getTime()) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

/** `leave` beats `half` beats `wfh` beats `full` — a judgement call, not a
 * derivation: full-day leave outranks WFH because the person wasn't working
 * at all, and half-day leave outranks WFH as the more specific claim. */
const CLASSIFICATION_PRIORITY: Record<DayClassification, number> = {
  leave: 3,
  half: 2,
  wfh: 1,
  full: 0,
};

function classifyFromWindows(
  dayKey: string,
  windows: readonly DayLeaveWindow[]
): DayClassification | null {
  let best: DayClassification | null = null;

  for (const window of windows) {
    if (dayKey < window.startDayKey || dayKey > window.endDayKey) continue;

    const classification: DayClassification =
      window.type === "Leave"
        ? window.dayPart === "FirstHalf" || window.dayPart === "SecondHalf"
          ? "half"
          : "leave"
        : "wfh";

    if (best === null || CLASSIFICATION_PRIORITY[classification] > CLASSIFICATION_PRIORITY[best]) {
      best = classification;
    }
  }

  return best;
}

export function buildAttendanceDays(
  input: {
    sessions: readonly AttendanceSession[];
    breaks: readonly BreakInterval[];
    leaveWindows: readonly DayLeaveWindow[];
    /** Inclusive `YYYY-MM-DD` bounds. `null` means "whatever the data spans". */
    fromDayKey: string | null;
    toDayKey: string | null;
    timeZone: string;
  },
  now: Date
): AttendanceDaysBreakdown {
  const { sessions, breaks, leaveWindows, fromDayKey, toDayKey, timeZone } = input;

  // Bucket sessions and breaks by the zone-local day the session *started* on
  // — a midnight-spanning session is attributed whole to its clock-in day,
  // the same "started in the period" rule `lib/performance.ts` already
  // applies when scoping a period, rather than splitting duration in two.
  const sessionsByDay = new Map<string, AttendanceSession[]>();
  for (const session of sessions) {
    const key = dayKeyInZone(session.clockInAt, timeZone);
    const bucket = sessionsByDay.get(key) ?? [];
    bucket.push(session);
    sessionsByDay.set(key, bucket);
  }

  const breaksByDay = new Map<string, BreakInterval[]>();
  for (const brk of breaks) {
    const key = dayKeyInZone(brk.startedAt, timeZone);
    const bucket = breaksByDay.get(key) ?? [];
    bucket.push(brk);
    breaksByDay.set(key, bucket);
  }

  // The day set is the union of attendance days and leave/WFH-covered days —
  // a leave day has no clock-in at all, so it would otherwise never appear.
  const dayKeys = new Set<string>(sessionsByDay.keys());
  for (const window of leaveWindows) {
    for (const key of dayKeysInRange(window.startDayKey, window.endDayKey)) {
      dayKeys.add(key);
    }
  }

  const bounded = [...dayKeys].filter(
    (key) => (fromDayKey === null || key >= fromDayKey) && (toDayKey === null || key <= toDayKey)
  );

  if (bounded.length === 0) return EMPTY_BREAKDOWN;

  const days: AttendanceDay[] = bounded
    .sort()
    .map((dayKey) => {
      const daySessions = sessionsByDay.get(dayKey) ?? [];
      const dayBreaks = breaksByDay.get(dayKey) ?? [];
      const leaveClassification = classifyFromWindows(dayKey, leaveWindows);

      // A day key only ever enters `dayKeys` via attendance or a leave/WFH
      // window (or both), so when no window covers it, it must have sessions.
      return {
        dayKey,
        classification: leaveClassification ?? "full",
        workedMs: netWorkedMs(daySessions, dayBreaks, now),
        sessionCount: daySessions.length,
      };
    });

  let fullDays = 0;
  let halfDays = 0;
  let leaveDays = 0;
  let wfhDays = 0;

  for (const day of days) {
    if (day.classification === "full") fullDays += 1;
    else if (day.classification === "half") halfDays += 1;
    else if (day.classification === "leave") leaveDays += 1;
    else wfhDays += 1;
  }

  return {
    presentDays: fullDays + halfDays + wfhDays,
    fullDays,
    halfDays,
    leaveDays,
    wfhDays,
    days,
  };
}

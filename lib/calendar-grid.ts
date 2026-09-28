import { dayKeyInZone } from "@/lib/timezone";

/**
 * Pure layout logic for the calendar's month/week grid — which days a view
 * shows, which day each item lands on, and how overlapping timed items share
 * a column. No React, no Prisma, the same split as `lib/calendar.ts`.
 *
 * Days are `YYYY-MM-DD` keys throughout, never zone-local-midnight `Date`s
 * (see `dayKeyInZone`). Two kinds of item land on a day differently:
 *
 * - Instants (meetings, timed Google events) land on the viewer's local day —
 *   a 9am IST meeting is on the day an IST viewer lives it.
 * - Date-only values (task due dates, leave/WFH ranges, all-day Google
 *   events) are stored at UTC midnight and land on their UTC date, the same
 *   "due the 9th stays the 9th" rule every date-only field here follows.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type CalendarView = "month" | "week";

/** `dayKey` shifted by `days` calendar days. */
export function addDays(dayKey: string, days: number): string {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** The UTC date of a date-only value stored at UTC midnight. */
export function utcDayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** The Monday on or before `dayKey` — weeks start on Monday. */
export function startOfWeek(dayKey: string): string {
  const weekday = new Date(`${dayKey}T00:00:00Z`).getUTCDay();
  return addDays(dayKey, -((weekday + 6) % 7));
}

/**
 * Every day a view shows for the period containing `anchor`: the 7 days of
 * its week, or whole weeks covering its month (5 or 6 rows, as Google
 * Calendar draws it — leading/trailing days belong to the neighbouring
 * months).
 */
export function visibleDays(view: CalendarView, anchor: string): string[] {
  if (view === "week") {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }

  const first = `${anchor.slice(0, 7)}-01`;
  const nextMonth = addDays(first, 32).slice(0, 7);
  const last = addDays(`${nextMonth}-01`, -1);
  const start = startOfWeek(first);
  const end = addDays(startOfWeek(last), 6);

  const days: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

/** The anchor one period earlier (`-1`) or later (`1`). */
export function shiftAnchor(
  view: CalendarView,
  anchor: string,
  direction: -1 | 1
): string {
  if (view === "week") return addDays(anchor, 7 * direction);
  const [year, month] = anchor.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + direction, 1));
  return utcDayKey(shifted);
}

// ---------------------------------------------------------------------------
// Bucketing
// ---------------------------------------------------------------------------

export type GridMeeting = {
  kind: "meeting";
  id: string;
  title: string;
  start: Date;
  end: Date;
};

export type GridEvent = {
  kind: "event";
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
};

export type GridTask = { kind: "task"; id: string; dueDate: Date };

export type GridTimeOff = {
  kind: "timeOff";
  id: string;
  startDate: Date;
  endDate: Date;
};

export type GridItem = GridMeeting | GridEvent | GridTask | GridTimeOff;

export type DayBucket<T extends GridItem> = {
  /** Time off, all-day events and tasks — shown above the timed items. */
  allDay: T[];
  /** Meetings and timed events, earliest first. */
  timed: T[];
};

const ALL_DAY_ORDER: Record<GridItem["kind"], number> = {
  timeOff: 0,
  event: 1,
  task: 2,
  meeting: 3,
};

/**
 * Which of `days` each item lands on. A date range (time off, a multi-day
 * all-day event) lands on every day it covers; a timed item lands on the
 * local day it starts. Items outside `days` are dropped. Input order is kept
 * within each kind, so a caller that sorted its tasks keeps that order.
 */
export function bucketByDay<T extends GridItem>(
  days: readonly string[],
  items: readonly T[],
  timeZone: string
): Map<string, DayBucket<T>> {
  const buckets = new Map<string, DayBucket<T>>(
    days.map((day) => [day, { allDay: [], timed: [] }])
  );

  const place = (day: string, item: T, slot: "allDay" | "timed") => {
    buckets.get(day)?.[slot].push(item);
  };

  const placeRange = (first: string, last: string, item: T) => {
    for (let day = first; day <= last; day = addDays(day, 1)) {
      place(day, item, "allDay");
    }
  };

  for (const item of items) {
    switch (item.kind) {
      case "task":
        place(utcDayKey(item.dueDate), item, "allDay");
        break;
      case "timeOff":
        placeRange(utcDayKey(item.startDate), utcDayKey(item.endDate), item);
        break;
      case "event":
        if (item.allDay) {
          // Google's all-day end date is exclusive.
          placeRange(utcDayKey(item.start), addDays(utcDayKey(item.end), -1), item);
        } else {
          place(dayKeyInZone(item.start, timeZone), item, "timed");
        }
        break;
      case "meeting":
        place(dayKeyInZone(item.start, timeZone), item, "timed");
        break;
    }
  }

  for (const bucket of buckets.values()) {
    bucket.allDay.sort((a, b) => ALL_DAY_ORDER[a.kind] - ALL_DAY_ORDER[b.kind]);
    bucket.timed.sort((a, b) => timedStart(a) - timedStart(b));
  }

  return buckets;
}

function timedStart(item: GridItem): number {
  return item.kind === "meeting" || item.kind === "event"
    ? item.start.getTime()
    : 0;
}

// ---------------------------------------------------------------------------
// Week view: overlapping timed items
// ---------------------------------------------------------------------------

export type Placed<T> = { item: T; column: number; columns: number };

/**
 * Side-by-side columns for overlapping timed items, the way a day column in
 * Google Calendar splits a clash: items that overlap (directly or through a
 * chain) form a cluster, each takes the first column free at its start, and
 * every item in the cluster shares the cluster's column count.
 */
export function layoutOverlaps<T extends { start: Date; end: Date }>(
  items: readonly T[]
): Placed<T>[] {
  const sorted = [...items].sort(
    (a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime()
  );

  const placed: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -Infinity;

  const closeCluster = () => {
    for (const entry of cluster) entry.columns = columnEnds.length;
    cluster = [];
    columnEnds = [];
  };

  for (const item of sorted) {
    const start = item.start.getTime();
    // Zero-length items still need a visible slot, so give them a minute.
    const end = Math.max(item.end.getTime(), start + 60_000);

    if (start >= clusterEnd) {
      closeCluster();
      clusterEnd = end;
    } else {
      clusterEnd = Math.max(clusterEnd, end);
    }

    let column = columnEnds.findIndex((columnEnd) => columnEnd <= start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[column] = end;
    }

    const entry = { item, column, columns: 1 };
    cluster.push(entry);
    placed.push(entry);
  }
  closeCluster();

  return placed;
}

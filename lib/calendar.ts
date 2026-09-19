/**
 * Pure calendar interval logic (Rules.md section 5 — free of Prisma/NextAuth
 * imports, like `lib/tasks.ts`/`lib/requests.ts`, so it can be unit-tested
 * directly). The database- and Google-touching half lives in
 * `lib/calendar-data.ts`/`lib/google-calendar.ts`.
 */

export type BusyInterval = { start: Date; end: Date };

/**
 * Working hours a "free slot" is computed within, in UTC. Company-wide and
 * flat rather than per-company/per-timezone — Plan.md Phase 17 doesn't ask
 * for either, and every other date-only field in this schema (task
 * `dueDate`, for instance) is already stored and compared in UTC. The one
 * place to widen this if it turns out to matter.
 *
 * TODO(timezone): now that `propose-meeting-form.tsx` books the instant the
 * viewer actually typed (see its docstring), a flat UTC 9–18 window proposes
 * slots outside a non-UTC user's real workday — e.g. 03:30–12:30 UTC for
 * someone in Asia/Kolkata. Fixing that needs working hours to become a
 * `Company` property (a new column + settings UI), not a viewer property, so
 * it's out of scope here — flagged rather than silently left.
 */
export const WORKING_HOURS_START_UTC = 9;
export const WORKING_HOURS_END_UTC = 18;

/**
 * Merge overlapping or touching intervals into the smallest equivalent set,
 * sorted by start time. Two intervals that only touch (one's `end` equals the
 * other's `start`) are merged too — a schedule with no gap between two busy
 * blocks has no free slot between them either.
 */
export function mergeIntervals(
  intervals: readonly BusyInterval[]
): BusyInterval[] {
  if (intervals.length === 0) return [];

  const sorted = [...intervals].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );

  const merged: BusyInterval[] = [{ ...sorted[0] }];

  for (const interval of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (interval.start.getTime() <= last.end.getTime()) {
      if (interval.end.getTime() > last.end.getTime()) {
        last.end = interval.end;
      }
    } else {
      merged.push({ ...interval });
    }
  }

  return merged;
}

/** Whether a proposed interval overlaps any interval in `busy`. */
export function hasConflict(
  proposed: BusyInterval,
  busy: readonly BusyInterval[]
): boolean {
  return busy.some(
    (interval) =>
      proposed.start.getTime() < interval.end.getTime() &&
      proposed.end.getTime() > interval.start.getTime()
  );
}

/**
 * The gaps inside `[dayStart, dayEnd)` once `busy` is merged — the free slots
 * a "propose a meeting" UI would offer. `dayStart`/`dayEnd` are expected to
 * already be clamped to working hours by the caller (`WORKING_HOURS_START_UTC`
 * / `WORKING_HOURS_END_UTC`).
 */
export function freeSlots(
  dayStart: Date,
  dayEnd: Date,
  busy: readonly BusyInterval[]
): BusyInterval[] {
  const merged = mergeIntervals(busy).filter(
    (interval) =>
      interval.end.getTime() > dayStart.getTime() &&
      interval.start.getTime() < dayEnd.getTime()
  );

  const slots: BusyInterval[] = [];
  let cursor = dayStart;

  for (const interval of merged) {
    const start = interval.start.getTime() < cursor.getTime()
      ? cursor
      : interval.start;
    if (start.getTime() > cursor.getTime()) {
      slots.push({ start: cursor, end: start });
    }
    if (interval.end.getTime() > cursor.getTime()) {
      cursor = interval.end;
    }
  }

  if (cursor.getTime() < dayEnd.getTime()) {
    slots.push({ start: cursor, end: dayEnd });
  }

  return slots;
}

/** Working-hours window for the UTC calendar day `day` falls in. */
export function workingHoursWindow(day: Date): BusyInterval {
  const start = new Date(
    Date.UTC(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      WORKING_HOURS_START_UTC
    )
  );
  const end = new Date(
    Date.UTC(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      WORKING_HOURS_END_UTC
    )
  );
  return { start, end };
}

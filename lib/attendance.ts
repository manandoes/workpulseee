/**
 * Pure attendance logic (clock in / clock out), free of Prisma/Next imports so
 * it can be unit-tested directly — the same split every other feature in this
 * codebase draws between a pure module and its `-data.ts` counterpart
 * (`lib/workload.ts`/`workload-data.ts`, `lib/performance.ts`/`performance-data.ts`).
 *
 * Deliberately the "Simple" rule set: one open session per employee at a time,
 * a login starts it and a logout ends it, no admin edit. Breaks (Plan.md
 * Phase 15) sit inside a session rather than complicating it — see
 * `breakDurationMs`/`netWorkedMs` below.
 */

export type AttendanceSession = {
  clockInAt: Date;
  clockOutAt: Date | null;
};

/**
 * Total time across a set of sessions, as of `now`.
 *
 * A closed session contributes `clockOutAt - clockInAt`; an open one (at most
 * one, by construction — see `lib/attendance-data.ts`) contributes up to
 * `now` instead, so a still-running session counts toward today's total
 * without waiting for the employee to log out.
 */
export function totalDurationMs(
  sessions: AttendanceSession[],
  now: Date
): number {
  return sessions.reduce((total, session) => {
    const end = session.clockOutAt ?? now;
    const elapsed = end.getTime() - session.clockInAt.getTime();
    return total + Math.max(0, elapsed);
  }, 0);
}

/**
 * A break belongs to the working day, not to one task (Plan.md Phase 15):
 * starting one pauses every running task timer, so the day's worked total can
 * honestly exclude it. `BreakRecord` enforces at most one open break per
 * employee at a time (`lib/attendance-data.ts`), so breaks for one employee
 * never overlap and a plain sum is the true total — the same reasoning
 * `totalDurationMs` and `lib/task-timer.ts`'s `totalTrackedMs` already use.
 */
export type BreakInterval = {
  startedAt: Date;
  endedAt: Date | null;
};

/** Total break time across a set of intervals, as of `now`. */
export function breakDurationMs(breaks: BreakInterval[], now: Date): number {
  return breaks.reduce((total, brk) => {
    const end = brk.endedAt ?? now;
    return total + Math.max(0, end.getTime() - brk.startedAt.getTime());
  }, 0);
}

/**
 * Time actually worked: sessions minus the breaks inside them. Shown beside
 * the raw session total rather than folded into one figure, so "logged in 8
 * hours" and "worked 7.5 of them" both stay visible instead of one number
 * that quietly includes lunch.
 */
export function netWorkedMs(
  sessions: AttendanceSession[],
  breaks: BreakInterval[],
  now: Date
): number {
  return Math.max(
    0,
    totalDurationMs(sessions, now) - breakDurationMs(breaks, now)
  );
}

// ---------------------------------------------------------------------------
// The end-of-day logout nudge
// ---------------------------------------------------------------------------

/**
 * Clocking out is a thing people forget, and a session left open overnight
 * quietly inflates every worked-hours figure derived from it. So: an hour
 * after the company's working day ends (`Company.endOfDayMinutes`), a session
 * that is still open earns a reminder. "I'm here" keeps it open and buys
 * another two hours; ignoring it closes the session automatically.
 *
 * Nothing here is a timer. Every decision is recomputed from stored timestamps
 * against `now`, so a sweep that runs late, twice, or not at all for an hour
 * reaches the same conclusion it would have reached on time — the same
 * property `warnCompanyDeadlines` relies on, and the reason the whole rule can
 * live in a pure function.
 */

/** How long after the working day ends the first reminder goes out. */
export const FIRST_REMINDER_AFTER_END_MS = 60 * 60 * 1000;

/** How long after an answered reminder the next one goes out. */
export const REMINDER_INTERVAL_MS = 2 * 60 * 60 * 1000;

/**
 * How long an unanswered reminder waits before the session is closed for them.
 *
 * A floor, not a promise: the sweep runs on a schedule, so the real wait is
 * this plus however long until the next run. Erring long is the right way for
 * this one to be wrong — closing somebody's session early is a data loss they
 * cannot undo from the UI.
 */
export const AUTO_LOGOUT_GRACE_MS = 30 * 60 * 1000;

/** An open session, as much of it as the nudge rule needs. */
export type LogoutNudgeState = {
  clockInAt: Date;
  /** When this company's working day ended, for this session's day. */
  endOfDayAt: Date;
  /** Their last "I'm here", or null if they have not answered one. */
  presenceConfirmedAt: Date | null;
  /** When the last reminder was sent, or null if none has been. */
  logoutReminderAt: Date | null;
};

export type LogoutNudge =
  /** Nothing is due yet. */
  | { action: "none" }
  /** Send a reminder. `dueAt` is the slot it is for — a stable dedupe key. */
  | { action: "remind"; dueAt: Date; recordedEndAt: Date }
  /** Close the session, stamped at the last moment they were known present. */
  | { action: "autoLogout"; clockOutAt: Date };

/**
 * The last moment this person is known to have been working.
 *
 * Their most recent "I'm here" if they gave one, and otherwise the end of the
 * working day — the last point at which we had any reason to believe they were
 * at their desk. Never earlier than the clock-in, which matters only for a
 * session that started *after* the working day was already over: there the
 * clock-in is itself the most recent evidence of presence.
 *
 * This is what an automatic clock-out is stamped with, so time nobody
 * confirmed is never credited as worked. Someone who really was at their desk
 * says so by pressing "I'm here", and the reminder tells them what happens if
 * they do not.
 */
function lastKnownPresence(state: LogoutNudgeState): Date {
  if (state.presenceConfirmedAt) return state.presenceConfirmedAt;
  return state.endOfDayAt > state.clockInAt ? state.endOfDayAt : state.clockInAt;
}

/**
 * What, if anything, this open session is due for as of `now`.
 *
 * A reminder counts as answered when the presence confirmation is not older
 * than it — so the sweep can tell "they said they are here" from "nobody has
 * touched this", without a separate answered flag to keep in step.
 */
export function resolveLogoutNudge(
  state: LogoutNudgeState,
  now: Date
): LogoutNudge {
  const presence = lastKnownPresence(state);

  if (!state.logoutReminderAt) {
    const dueAt = new Date(presence.getTime() + FIRST_REMINDER_AFTER_END_MS);
    return now >= dueAt
      ? { action: "remind", dueAt, recordedEndAt: presence }
      : { action: "none" };
  }

  const answered =
    state.presenceConfirmedAt !== null &&
    state.presenceConfirmedAt >= state.logoutReminderAt;

  if (!answered) {
    const deadline = new Date(
      state.logoutReminderAt.getTime() + AUTO_LOGOUT_GRACE_MS
    );
    return now >= deadline
      ? { action: "autoLogout", clockOutAt: presence }
      : { action: "none" };
  }

  const dueAt = new Date(state.logoutReminderAt.getTime() + REMINDER_INTERVAL_MS);
  return now >= dueAt
    ? { action: "remind", dueAt, recordedEndAt: presence }
    : { action: "none" };
}

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

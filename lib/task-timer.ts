import type {
  TaskStatus,
  TimeEntryEndReason,
} from "@/lib/generated/prisma/enums";

/**
 * Pure task-timer logic (Phase 12 — task time tracking — start / break / stop / done),
 * free of Prisma and Next imports so it can be unit-tested directly. The same
 * split every other feature draws between a pure module and its `-data.ts`
 * counterpart (`lib/attendance.ts`/`attendance-data.ts`,
 * `lib/tasks.ts`/`task-data.ts`).
 *
 * The model is an interval, not a stopwatch: starting opens a `TaskTimeEntry`,
 * every other action closes it, and elapsed time is always derived from the
 * timestamps. Nothing here reads the clock — `now` is passed in, so a running
 * total can be asserted at a fixed instant.
 */

// ---------------------------------------------------------------------------
// The four buttons
// ---------------------------------------------------------------------------

/**
 * What an employee can do to a task's timer, in the order the controls sit.
 *
 * `break` and `stop` both close the running interval and differ only in intent
 * and in the reason recorded: a break is a pause you mean to come back from, a
 * stop is putting this task down to pick up something more urgent. Keeping
 * both is what PRD-level "I stopped this to do that" reporting needs, and
 * costs one enum value rather than a second state machine.
 */
export const TIMER_ACTIONS = ["start", "break", "stop", "done"] as const;
export type TimerAction = (typeof TIMER_ACTIONS)[number];

/**
 * The reason stamped on the interval an action closes, or `null` for `start`,
 * which opens one instead.
 *
 * `SignedOut` has no action of its own: it is only ever written by the
 * automatic close in `lib/task-timer-data.ts`'s `stopRunningEntries`, so
 * nobody can claim it by posting a crafted body.
 */
export function endReasonFor(action: TimerAction): TimeEntryEndReason | null {
  switch (action) {
    case "start":
      return null;
    case "break":
      return "Break";
    case "stop":
      return "Stopped";
    case "done":
      return "Done";
  }
}

/**
 * The status the task should carry after an action, or `null` to leave it
 * alone.
 *
 * Only the two ends of the flow move it. Starting work on something still in
 * the backlog is what "In Progress" means, so the board stops disagreeing with
 * the running timer; finishing it is the whole point of the Done button. A
 * break or a stop deliberately changes nothing — the work is still in flight,
 * the person just is not sitting at it this minute.
 *
 * Starting an already-moved task (In Review, or Done being picked back up)
 * leaves its status where its owner put it.
 */
export function statusAfter(
  action: TimerAction,
  current: TaskStatus
): TaskStatus | null {
  if (action === "done") return current === "Done" ? null : "Done";
  if (action === "start" && current === "Todo") return "InProgress";
  return null;
}

// ---------------------------------------------------------------------------
// Elapsed time
// ---------------------------------------------------------------------------

export type TimeEntry = {
  startedAt: Date;
  endedAt: Date | null;
};

/**
 * Total time across a set of intervals, as of `now`.
 *
 * A closed interval contributes `endedAt - startedAt`; a still-running one
 * counts up to `now`, so the figure on screen includes the stretch in
 * progress rather than jumping only when the timer is stopped.
 *
 * Intervals for the same task never overlap (at most one is open at a time,
 * and a new one can only start after the previous closed), so a plain sum is
 * the true total.
 */
export function totalTrackedMs(entries: TimeEntry[], now: Date): number {
  return entries.reduce((total, entry) => {
    const end = entry.endedAt ?? now;
    return total + Math.max(0, end.getTime() - entry.startedAt.getTime());
  }, 0);
}

/** The running interval among these, if one is open. */
export function runningEntry<T extends TimeEntry>(entries: T[]): T | null {
  return entries.find((entry) => entry.endedAt === null) ?? null;
}

export type TimerSummary = {
  /** Time already banked in closed intervals. Fixed — it cannot change. */
  closedMs: number;
  /** When the interval in progress began, or `null` if nothing is running. */
  runningSince: Date | null;
};

/**
 * The two numbers a live timer needs, and the only two that are clock-free.
 *
 * A server render can hand these straight to a browser and let it tick
 * `closedMs + (now - runningSince)` against its own clock, instead of shipping
 * a total that was already stale when it was serialised. `totalTrackedMs` is
 * the same figure resolved at one instant, for somewhere that only ever
 * renders once (the task page's log).
 */
export function timerSummary(entries: TimeEntry[]): TimerSummary {
  const running = runningEntry(entries);

  return {
    closedMs: entries.reduce(
      (total, entry) =>
        entry.endedAt === null
          ? total
          : total +
            Math.max(0, entry.endedAt.getTime() - entry.startedAt.getTime()),
      0
    ),
    runningSince: running?.startedAt ?? null,
  };
}

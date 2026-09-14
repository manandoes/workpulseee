import {
  duplicateFailure,
  invalidReference,
  type WriteFailure,
} from "@/lib/api";
import { db } from "@/lib/db";
import type { SessionActor } from "@/lib/permissions";
import type { LoadedTask } from "@/lib/task-data";
import { completionFor } from "@/lib/tasks";
import {
  endReasonFor,
  statusAfter,
  timerSummary,
  type TimerAction,
  type TimerSummary,
} from "@/lib/task-timer";
import type { TaskStatus } from "@/lib/generated/prisma/enums";

/**
 * Database access for task timers (Phase 12 — task time tracking).
 *
 * Mirrors `lib/attendance-data.ts`: the write resolution and the reads the
 * pages share live here, and a refused write comes back as the same
 * `WriteFailure` shape every other feature uses. All of the "what does this
 * action mean" logic is in `lib/task-timer.ts` — this module only asks the
 * database what is currently open and writes the answer down.
 *
 * `TaskTimeEntry` has no `deletedAt` (every row is history), so queries filter
 * by a plain `{ companyId, ... }` rather than `scopedWhere`, the same way
 * `lib/attendance-data.ts` reads `AttendanceRecord`.
 */

export type TaskTimeEntryRow = {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  endReason: string | null;
  employee: { id: string; fullName: string };
};

const entrySelect = {
  id: true,
  startedAt: true,
  endedAt: true,
  endReason: true,
  employee: { select: { id: true, fullName: true } },
} as const;

// ---------------------------------------------------------------------------
// Running a timer
// ---------------------------------------------------------------------------

/**
 * The caller's own running interval on this task, if there is one.
 *
 * At most one ever exists — that is the invariant `start` below enforces, and
 * the reason a plain sum of intervals is the true total.
 */
function loadOpenEntry(actor: SessionActor, taskId: string) {
  return db.taskTimeEntry.findFirst({
    where: {
      companyId: actor.companyId,
      taskId,
      employeeId: actor.id,
      endedAt: null,
    },
    select: { id: true },
  });
}

export type TimerResolution =
  | {
      ok: true;
      /** Set when the action moved the task through the flow, so the caller
       * knows whether the workload and performance figures need recomputing. */
      status: TaskStatus | null;
    }
  | WriteFailure;

/**
 * Apply one of the four timer actions to a task, for the employee doing it.
 *
 * The caller has already loaded the task through the tenant filter and checked
 * `canTrackTaskTime`, so `actor.id` is the assignee and the task is in this
 * company.
 *
 * The interval and the task status are written in one transaction: a `done`
 * that closed the clock but left the task open — or the reverse — would make
 * the log disagree with the board, and there is no reading of the data that
 * repairs it afterwards.
 */
export async function applyTimerAction(
  actor: SessionActor,
  task: LoadedTask,
  action: TimerAction,
  now: Date = new Date()
): Promise<TimerResolution> {
  const open = await loadOpenEntry(actor, task.id);

  if (action === "start" && open) {
    return duplicateFailure("action", "This task's timer is already running.");
  }

  /**
   * A break or a stop is a statement about a clock that is running, so there
   * has to be one. `done` is not: finishing a task you never timed is
   * ordinary, and refusing it would make the Done button unreliable for the
   * one case it matters most in.
   */
  if (!open && (action === "break" || action === "stop")) {
    return invalidReference("action", "This task's timer is not running.");
  }

  const nextStatus = statusAfter(action, task.status);

  const writes = [];

  if (action === "start") {
    writes.push(
      db.taskTimeEntry.create({
        data: {
          companyId: actor.companyId,
          taskId: task.id,
          employeeId: actor.id,
          startedAt: now,
        },
      })
    );
  } else if (open) {
    writes.push(
      db.taskTimeEntry.update({
        where: { id: open.id },
        data: { endedAt: now, endReason: endReasonFor(action) },
      })
    );
  }

  if (nextStatus) {
    writes.push(
      db.task.update({
        where: { id: task.id },
        data: {
          status: nextStatus,
          // Completion follows the status rather than being written by hand,
          // exactly as `/api/tasks/[id]/status` does it (lib/tasks.ts).
          completedAt: completionFor(nextStatus, task.completedAt, now),
        },
      })
    );
  }

  await db.$transaction(writes);

  return { ok: true, status: nextStatus };
}

/**
 * Close every interval this employee still has running, stamped `SignedOut`.
 *
 * Called from the NextAuth sign-out event (`lib/auth.ts`) so that signing off
 * cannot leave a clock ticking overnight against a task nobody is sitting at.
 * Takes ids rather than a `SessionActor` because at sign-out there is only a
 * token left, not a session.
 *
 * Returns how many were closed, which is what the caller logs.
 */
export async function stopRunningEntries(
  companyId: string,
  employeeId: string,
  now: Date = new Date()
): Promise<number> {
  const { count } = await db.taskTimeEntry.updateMany({
    where: { companyId, employeeId, endedAt: null },
    data: { endedAt: now, endReason: "SignedOut" },
  });

  return count;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Every interval logged against a task, newest first — the time record shown
 * with the task's details.
 *
 * Not filtered to one employee: a task that changed hands was worked on by
 * more than one person, and the whole point of keeping the log beside the task
 * is that it says who spent the time.
 */
export function loadTaskTimeEntries(
  actor: SessionActor,
  taskId: string,
  limit = 50
): Promise<TaskTimeEntryRow[]> {
  return db.taskTimeEntry.findMany({
    where: { companyId: actor.companyId, taskId },
    orderBy: { startedAt: "desc" },
    take: limit,
    select: entrySelect,
  });
}

/**
 * The caller's own timer state for each of the given tasks, keyed by task id.
 *
 * One query for the whole list rather than one per card: an employee's open
 * tasks are a short list, and "My Work" renders every one of them with a
 * timer. Tasks the caller has never timed are simply absent from the map —
 * the caller treats that as a zeroed, stopped timer.
 */
export async function loadMyTimerSummaries(
  actor: SessionActor,
  taskIds: string[]
): Promise<Record<string, TimerSummary>> {
  if (taskIds.length === 0) return {};

  const entries = await db.taskTimeEntry.findMany({
    where: {
      companyId: actor.companyId,
      employeeId: actor.id,
      taskId: { in: taskIds },
    },
    select: { taskId: true, startedAt: true, endedAt: true },
  });

  const byTask: Record<string, { startedAt: Date; endedAt: Date | null }[]> =
    {};
  for (const entry of entries) {
    (byTask[entry.taskId] ??= []).push(entry);
  }

  return Object.fromEntries(
    Object.entries(byTask).map(([taskId, taskEntries]) => [
      taskId,
      timerSummary(taskEntries),
    ])
  );
}

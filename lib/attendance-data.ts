import {
  duplicateFailure,
  invalidReference,
  type WriteFailure,
} from "@/lib/api";
import { db } from "@/lib/db";
import type { SessionActor } from "@/lib/permissions";

/**
 * Database access for attendance (clock in / clock out / break).
 *
 * Mirrors `lib/request-data.ts`/`lib/performance-data.ts`: the write
 * resolution and the reads the pages share live here, and a refused write
 * comes back as the same `WriteFailure` shape every other feature uses.
 *
 * `AttendanceRecord`/`BreakRecord` have no `deletedAt` (a session or a break
 * is never edited or removed, the same "pointer, not history" reasoning the
 * schema gives for `ProjectMember`/`Attachment` — except here every row *is*
 * the history), so queries filter by a plain `{ companyId, ... }` rather than
 * `scopedWhere`, the same way `lib/performance-data.ts` reads
 * `Feedback`/`PerformanceRecord`.
 *
 * `clockIn`/`clockOut`/`startBreak`/`endBreak`/`loadMyAttendance` are only
 * ever called for an Employee actor — the routes and pages that call them
 * check `accountType === "employee"` first, so `actor.id` is the employee's
 * own row id, the same assumption `lib/my-work-data.ts` documents.
 */

export type AttendanceRecordRow = {
  id: string;
  clockInAt: Date;
  clockOutAt: Date | null;
};

const recordSelect = {
  id: true,
  clockInAt: true,
  clockOutAt: true,
} as const;

/**
 * A session plus its breaks (Plan.md Phase 15) — what the history tables need
 * to show net worked time. A separate select from `recordSelect` rather than
 * always joining breaks in, since `loadOpenSession`/`clockIn`/`clockOut` only
 * ever need the bare session.
 */
export type AttendanceRecordWithBreaks = AttendanceRecordRow & {
  breaks: { startedAt: Date; endedAt: Date | null }[];
};

const recordWithBreaksSelect = {
  ...recordSelect,
  breaks: {
    select: { startedAt: true, endedAt: true },
    orderBy: { startedAt: "desc" },
  },
} as const;

/** The caller's own open session, if any — at most one ever exists. */
export function loadOpenSession(
  actor: SessionActor
): Promise<AttendanceRecordRow | null> {
  return db.attendanceRecord.findFirst({
    where: {
      companyId: actor.companyId,
      employeeId: actor.id,
      clockOutAt: null,
    },
    select: recordSelect,
  });
}

export type ClockResolution =
  { ok: true; record: AttendanceRecordRow } | WriteFailure;

/**
 * Start a session. Refused if one is already open — an employee cannot be
 * clocked in twice at once.
 */
export async function clockIn(actor: SessionActor): Promise<ClockResolution> {
  const open = await loadOpenSession(actor);
  if (open) {
    return duplicateFailure("clockInAt", "You are already clocked in.");
  }

  const record = await db.attendanceRecord.create({
    data: { companyId: actor.companyId, employeeId: actor.id },
    select: recordSelect,
  });

  return { ok: true, record };
}

/**
 * End the caller's open session. Refused if none is open.
 *
 * Closes an open break in the same transaction (Plan.md Phase 15) so a day
 * can never end mid-break — the paused task timers stay paused, exactly as
 * they would if the employee had never come back from the break at all.
 */
export async function clockOut(actor: SessionActor): Promise<ClockResolution> {
  const open = await loadOpenSession(actor);
  if (!open) {
    return invalidReference("clockOutAt", "You are not clocked in.");
  }

  const now = new Date();
  const openBreak = await loadOpenBreak(actor);

  const [record] = await db.$transaction([
    db.attendanceRecord.update({
      where: { id: open.id },
      data: { clockOutAt: now },
      select: recordSelect,
    }),
    ...(openBreak
      ? [
          db.breakRecord.update({
            where: { id: openBreak.id },
            data: { endedAt: now },
          }),
        ]
      : []),
  ]);

  return { ok: true, record };
}

// ---------------------------------------------------------------------------
// Breaks (Plan.md Phase 15)
// ---------------------------------------------------------------------------

export type BreakRecordRow = {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  pausedTaskIds: string[];
};

const breakSelect = {
  id: true,
  startedAt: true,
  endedAt: true,
  pausedTaskIds: true,
} as const;

/** The caller's own open break, if any — at most one ever exists. */
export function loadOpenBreak(
  actor: SessionActor
): Promise<BreakRecordRow | null> {
  return db.breakRecord.findFirst({
    where: {
      companyId: actor.companyId,
      employeeId: actor.id,
      endedAt: null,
    },
    select: breakSelect,
  });
}

export type BreakResolution =
  { ok: true; record: BreakRecordRow } | WriteFailure;

/**
 * Start a break inside the caller's open attendance session.
 *
 * Refused if no session is open (a break outside a working day is not a
 * thing) or a break is already open (at most one, by construction). Pauses
 * every task timer this employee currently has running — a break belongs to
 * the working day, not to one task — and records which tasks so `endBreak`
 * can resume exactly those.
 */
export async function startBreak(actor: SessionActor): Promise<BreakResolution> {
  const [session, openBreak] = await Promise.all([
    loadOpenSession(actor),
    loadOpenBreak(actor),
  ]);

  if (!session) {
    return invalidReference("startedAt", "You are not clocked in.");
  }
  if (openBreak) {
    return duplicateFailure("startedAt", "You are already on a break.");
  }

  const now = new Date();
  const running = await db.taskTimeEntry.findMany({
    where: { companyId: actor.companyId, employeeId: actor.id, endedAt: null },
    select: { id: true, taskId: true },
  });

  const [record] = await db.$transaction([
    db.breakRecord.create({
      data: {
        companyId: actor.companyId,
        employeeId: actor.id,
        attendanceRecordId: session.id,
        startedAt: now,
        pausedTaskIds: running.map((entry) => entry.taskId),
      },
      select: breakSelect,
    }),
    ...(running.length > 0
      ? [
          db.taskTimeEntry.updateMany({
            where: { id: { in: running.map((entry) => entry.id) } },
            data: { endedAt: now, endReason: "Break" as const },
          }),
        ]
      : []),
  ]);

  return { ok: true, record };
}

/**
 * End the caller's open break, resuming a fresh timer on each task it had
 * paused. A task deleted while the break was open is silently skipped — its
 * `pausedTaskIds` entry can no longer be resumed, and that is the correct
 * outcome, not a failure the employee needs to see.
 */
export async function endBreak(actor: SessionActor): Promise<BreakResolution> {
  const open = await loadOpenBreak(actor);
  if (!open) {
    return invalidReference("endedAt", "You are not on a break.");
  }

  const now = new Date();
  const stillExisting =
    open.pausedTaskIds.length > 0
      ? await db.task.findMany({
          where: { companyId: actor.companyId, id: { in: open.pausedTaskIds } },
          select: { id: true },
        })
      : [];

  const [record] = await db.$transaction([
    db.breakRecord.update({
      where: { id: open.id },
      data: { endedAt: now },
      select: breakSelect,
    }),
    ...stillExisting.map((task) =>
      db.taskTimeEntry.create({
        data: {
          companyId: actor.companyId,
          taskId: task.id,
          employeeId: actor.id,
          startedAt: now,
        },
      })
    ),
  ]);

  return { ok: true, record };
}

/**
 * Close an open break directly by ids, with no reopening of task timers.
 *
 * Called only from the NextAuth sign-out event (`lib/auth.ts`), the same
 * reason `stopRunningEntries` in `lib/task-timer-data.ts` exists: at sign-out
 * there is only a token left, not a `SessionActor`, and signing out ends the
 * working day outright, so there is nothing to resume — `stopRunningEntries`
 * already closes any task timer that survived the break as `SignedOut`.
 */
export async function closeOpenBreakOnSignOut(
  companyId: string,
  employeeId: string,
  now: Date = new Date()
): Promise<boolean> {
  const { count } = await db.breakRecord.updateMany({
    where: { companyId, employeeId, endedAt: null },
    data: { endedAt: now },
  });
  return count > 0;
}

/** The caller's own recent sessions, newest first — the My Work "records" list. */
export function loadMyAttendance(
  actor: SessionActor,
  limit = 10
): Promise<AttendanceRecordWithBreaks[]> {
  return db.attendanceRecord.findMany({
    where: { companyId: actor.companyId, employeeId: actor.id },
    orderBy: { clockInAt: "desc" },
    take: limit,
    select: recordWithBreaksSelect,
  });
}

/**
 * A given employee's recent sessions, for the admin-facing Attendance panel
 * on their profile page. Scoped by company only, the same way
 * `loadPerformanceHistory` scopes an employee's score history — the page
 * itself checks `canViewPersonalDetails` before rendering this, and the id
 * passed in has already been confirmed to belong to this company.
 */
export function loadEmployeeAttendance(
  actor: SessionActor,
  employeeId: string,
  limit = 10
): Promise<AttendanceRecordWithBreaks[]> {
  return db.attendanceRecord.findMany({
    where: { companyId: actor.companyId, employeeId },
    orderBy: { clockInAt: "desc" },
    take: limit,
    select: recordWithBreaksSelect,
  });
}

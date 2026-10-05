import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import type { SessionActor } from "@/lib/permissions";
import { TASK_ORDER } from "@/lib/tasks";
import { isClosed } from "@/lib/projects";
import { loadMyTimerSummaries } from "@/lib/task-timer-data";
import type { TimerSummary } from "@/lib/task-timer";
import type {
  ProjectStatus,
  TaskPriority,
  TaskStatus,
} from "@/lib/generated/prisma/enums";
import { buildAttendanceDays, type DayLeaveWindow } from "@/lib/attendance-days";
import { dayKeyInZone } from "@/lib/timezone";

/**
 * Database access for "My Work" (Phases.md Phase 10 — the employee
 * self-service landing page).
 *
 * No new pure logic module: the bucketing "today's tasks" vs "upcoming
 * deadlines" reuses `isOverdue`/`TASK_ORDER` from `lib/tasks.ts` at render
 * time, and "current projects" reuses `isClosed` from `lib/projects.ts` — the
 * same split every other DB-access module (`workload-data.ts`,
 * `performance-data.ts`, `alert-data.ts`) draws from its pure counterpart.
 *
 * Only ever called for an Employee actor (the page redirects everyone else
 * away first), so `actor.id` is the employee's own row id — the same
 * assumption `app/(dashboard)/my-space/growth/page.tsx` already makes.
 */

export type MyWorkTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  /** `null` for a standalone task — a quick personal to-do with no project. */
  project: { id: string; name: string } | null;
  /** Reference files and links the task was allotted with. */
  attachments: {
    id: string;
    label: string;
    url: string | null;
    fileId: string | null;
  }[];
  /** This employee's own timer on this task (Phase 12 — task time tracking): what they
   * have already banked, and whether a stretch is running right now. */
  timer: TimerSummary;
};

export type MyWorkProject = {
  id: string;
  name: string;
  status: ProjectStatus;
  client: { name: string };
};

export type MyWork = {
  workloadPercent: number | null;
  /** Open (not Done) tasks assigned to me, in board/list order. */
  tasks: MyWorkTask[];
  /** Projects I'm on the team of, that are still in flight. */
  projects: MyWorkProject[];
};

export async function loadMyWork(actor: SessionActor): Promise<MyWork> {
  const [employee, tasks, allProjects] = await Promise.all([
    db.employee.findFirst({
      where: scopedWhere(actor, { id: actor.id }),
      select: { workloadPercent: true },
    }),
    db.task.findMany({
      where: scopedWhere(actor, {
        assigneeId: actor.id,
        status: { not: "Done" as TaskStatus },
      }),
      orderBy: [...TASK_ORDER],
      select: MY_TASK_SELECT,
    }),
    db.project.findMany({
      where: scopedWhere(actor, {
        members: { some: { employeeId: actor.id } },
      }),
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        status: true,
        client: { select: { name: true } },
      },
    }),
  ]);

  return {
    workloadPercent:
      employee?.workloadPercent == null
        ? null
        : Number(employee.workloadPercent),
    tasks: await withTimers(actor, tasks),
    projects: allProjects.filter((project) => !isClosed(project.status)),
  };
}

/** How many finished tasks "My Tasks" shows — the most recently completed. */
const RECENT_DONE_LIMIT = 50;

/**
 * Everything assigned to me for "My Tasks": every open task, plus the most
 * recently finished ones so the Done section stays a useful recent history
 * rather than growing forever.
 */
export async function loadMyTasks(actor: SessionActor): Promise<MyWorkTask[]> {
  const [open, done] = await Promise.all([
    db.task.findMany({
      where: scopedWhere(actor, {
        assigneeId: actor.id,
        status: { not: "Done" as TaskStatus },
      }),
      orderBy: [...TASK_ORDER],
      select: MY_TASK_SELECT,
    }),
    db.task.findMany({
      where: scopedWhere(actor, {
        assigneeId: actor.id,
        status: "Done" as TaskStatus,
      }),
      orderBy: [{ completedAt: { sort: "desc", nulls: "last" } }],
      take: RECENT_DONE_LIMIT,
      select: MY_TASK_SELECT,
    }),
  ]);

  return withTimers(actor, [...open, ...done]);
}

const MY_TASK_SELECT = {
  id: true,
  title: true,
  status: true,
  priority: true,
  dueDate: true,
  project: { select: { id: true, name: true } },
  attachments: {
    orderBy: { createdAt: "asc" },
    select: { id: true, label: true, url: true, fileId: true },
  },
} as const;

/**
 * Everything the My Work calendar needs: attendance sessions + breaks for the
 * current month (widened by one day on each side so a session that crosses a
 * midnight is bucketed correctly), approved Leave/WFH requests mapped to day
 * windows, company timezone, today's date, and per-day task stats (completed
 * and due on each day) scoped to the same month.
 */

export type MonthRange = { fromDayKey: string; toDayKey: string };

export type DayTaskStats = {
  /** Tasks this employee finished on this day (status moved to Done). */
  doneCount: number;
  /** Open tasks with dueDate landing on this day. */
  dueCount: number;
};

export type MyWorkCalendarData = {
  /** Attendance sessions for the month, already widened by one day on each
   * side so `buildAttendanceDays` can bucket them correctly. */
  sessions: { clockInAt: Date; clockOutAt: Date | null }[];
  breaks: { startedAt: Date; endedAt: Date | null }[];
  /** Approved Leave/WFH requests covering any day in the month. */
  leaveWindows: DayLeaveWindow[];
  timeZone: string;
  /** ISO `YYYY-MM-DD` for today in the company's zone. */
  todayKey: string;
  /** The first and last `YYYY-MM-DD` of the requested month. */
  range: MonthRange;
  /** Per-day task stats keyed by `YYYY-MM-DD`. */
  dayTasks: Map<string, DayTaskStats>;
};

/**
 * Loads everything the attendance calendar on My Work needs for one month.
 *
 * `fromDayKey`/`toDayKey` are inclusive bounds in the company's zone. The
 * attendance rows are widened by one day on each side so `buildAttendanceDays`
 * can bucket sessions that cross a midnight correctly — the same reasoning
 * `loadPerformanceBreakdown` follows.
 */
export async function loadMyWorkCalendarData(
  actor: SessionActor,
  now: Date,
  range: MonthRange
): Promise<MyWorkCalendarData> {
  const { fromDayKey, toDayKey } = range;
  const widenedFrom = new Date(`${fromDayKey}T00:00:00.000Z`);
  const widenedTo = new Date(`${toDayKey}T23:59:59.999Z`);

  const [company, sessions, leaveRequests, completedTasks, dueTasks] =
    await Promise.all([
      db.company.findUniqueOrThrow({
        where: { id: actor.companyId },
        select: { timeZone: true },
      }),
      db.attendanceRecord.findMany({
        where: {
          companyId: actor.companyId,
          ...(actor.accountType === "employee"
            ? { employeeId: actor.id }
            : { accountId: actor.id }),
          clockInAt: { gte: new Date(widenedFrom.getTime() - 86_400_000) },
        },
        select: {
          clockInAt: true,
          clockOutAt: true,
          breaks: { select: { startedAt: true, endedAt: true } },
        },
      }),
      db.request.findMany({
        where: {
          companyId: actor.companyId,
          employeeId: actor.id,
          status: "Approved",
          type: { in: ["Leave", "WFH"] as const },
          startDate: { lte: new Date(`${toDayKey}T23:59:59.999Z`) },
          endDate: { gte: new Date(`${fromDayKey}T00:00:00.000Z`) },
        },
        select: { type: true, startDate: true, endDate: true, dayPart: true },
      }),
      // Tasks completed in the month — used for per-day "done" counts.
      db.task.findMany({
        where: scopedWhere(actor, {
          assigneeId: actor.id,
          completedAt: { gte: new Date(`${fromDayKey}T00:00:00.000Z`) },
        }),
        select: { completedAt: true },
      }),
      // Open tasks with dueDate in the month — used for per-day "due" counts.
      db.task.findMany({
        where: scopedWhere(actor, {
          assigneeId: actor.id,
          status: { not: "Done" as TaskStatus },
          dueDate: {
            gte: new Date(`${fromDayKey}T00:00:00.000Z`),
            lte: new Date(`${toDayKey}T23:59:59.999Z`),
          },
        }),
        select: { dueDate: true },
      }),
    ]);

  const sessionsWithBreaks = sessions.flatMap((s) => ({
    session: { clockInAt: s.clockInAt, clockOutAt: s.clockOutAt },
    breaks: s.breaks,
  }));

  const allSessions = sessionsWithBreaks.map((s) => s.session);
  const allBreaks = sessionsWithBreaks.flatMap((s) => s.breaks);

  const leaveWindows: DayLeaveWindow[] = leaveRequests
    .filter((r) => r.startDate !== null && r.endDate !== null)
    .map((r) => ({
      type: r.type as "Leave" | "WFH",
      startDayKey: dayKeyInZone(r.startDate!, company.timeZone),
      endDayKey: dayKeyInZone(r.endDate!, company.timeZone),
      dayPart: r.dayPart,
    }));

  const todayKey = dayKeyInZone(now, company.timeZone);

  // Build per-day task stats.
  const dayTasks = new Map<string, DayTaskStats>();

  for (const task of completedTasks) {
    if (!task.completedAt) continue;
    const key = dayKeyInZone(task.completedAt, company.timeZone);
    const stats = dayTasks.get(key) ?? { doneCount: 0, dueCount: 0 };
    stats.doneCount += 1;
    dayTasks.set(key, stats);
  }

  for (const task of dueTasks) {
    if (!task.dueDate) continue;
    const d = task.dueDate instanceof Date ? task.dueDate : new Date(task.dueDate);
    if (Number.isNaN(d.getTime())) continue;
    const key = dayKeyInZone(d, company.timeZone);
    const stats = dayTasks.get(key) ?? { doneCount: 0, dueCount: 0 };
    stats.dueCount += 1;
    dayTasks.set(key, stats);
  }

  return {
    sessions: allSessions,
    breaks: allBreaks,
    leaveWindows,
    timeZone: company.timeZone,
    todayKey,
    range,
    dayTasks,
  };
}

/**
 * Attaches this employee's own timer to each task. A second query rather than
 * an `include`: the timer read is per-employee (`employeeId: actor.id`), which
 * a relation filter on the task rows cannot express as cheaply, and one `IN`
 * over the list is a single round trip either way.
 */
async function withTimers(
  actor: SessionActor,
  tasks: Omit<MyWorkTask, "timer">[]
): Promise<MyWorkTask[]> {
  const timers = await loadMyTimerSummaries(
    actor,
    tasks.map((task) => task.id)
  );
  // A task never timed has no rows, which is the same thing as a stopped
  // timer at zero — the caller should not have to tell the two apart.
  return tasks.map((task) => ({
    ...task,
    timer: timers[task.id] ?? { closedMs: 0, runningSince: null },
  }));
}

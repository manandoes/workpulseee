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

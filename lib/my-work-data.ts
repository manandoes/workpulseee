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
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        project: { select: { id: true, name: true } },
      },
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

  // Second query rather than an `include` on the first: the timer read is
  // per-employee (`employeeId: actor.id`), which a relation filter on the task
  // rows cannot express as cheaply, and one `IN` over a short list of open
  // tasks is a single round trip either way.
  const timers = await loadMyTimerSummaries(
    actor,
    tasks.map((task) => task.id)
  );

  return {
    workloadPercent:
      employee?.workloadPercent == null
        ? null
        : Number(employee.workloadPercent),
    // A task never timed has no rows, which is the same thing as a stopped
    // timer at zero — the caller should not have to tell the two apart.
    tasks: tasks.map((task) => ({
      ...task,
      timer: timers[task.id] ?? { closedMs: 0, runningSince: null },
    })),
    projects: allProjects.filter((project) => !isClosed(project.status)),
  };
}

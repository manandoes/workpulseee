import { netWorkedMs, breakDurationMs, type AttendanceSession, type BreakInterval } from "@/lib/attendance";
import {
  buildAttendanceDays,
  type AttendanceDaysBreakdown,
  type DayLeaveWindow,
} from "@/lib/attendance-days";
import { totalTrackedMs, type TimeEntry } from "@/lib/task-timer";
import {
  isOverdue,
  isOpen,
  type Deadline,
} from "@/lib/tasks";
import {
  calculatePerformanceScore,
  taskCompletionRate,
  onTimeDeliveryRate,
  toDate,
  type PerformanceInput,
  type TaskSignal,
} from "@/lib/performance";

/**
 * Breaks the single blended performance score (`lib/performance.ts`) down
 * into the parameters PRD.md section 6.5 names individually — attendance,
 * focus, breaks, and task completion/on-time/delayed — so a manager can see
 * *why* a score reads the way it does, not just the number.
 *
 * Pure and `now`-parameterised, the same convention as `lib/performance.ts`/
 * `lib/attendance.ts`/`lib/task-timer.ts`, and deliberately built on top of
 * those modules' existing functions rather than re-deriving worked time,
 * break time, or tracked time a second way.
 */

export type PerformanceBreakdownInput = {
  sessions: readonly AttendanceSession[];
  breaks: readonly BreakInterval[];
  timeEntries: readonly TimeEntry[];
  tasks: readonly (TaskSignal & Deadline)[];
  workloadPercent: number | null;
  feedbackRatings: readonly number[];
  goals: PerformanceInput["goals"];
  /** Inputs for the day-level attendance breakdown (present/half/leave/WFH
   * days) — kept separate from `sessions`/`breaks` above because those are
   * scoped tight to the UTC period while day bucketing needs a slightly
   * widened window to bucket correctly by zone-local day; see
   * `loadPerformanceBreakdown`'s docstring. */
  dayAttendance: {
    sessions: readonly AttendanceSession[];
    breaks: readonly BreakInterval[];
    leaveWindows: readonly DayLeaveWindow[];
    fromDayKey: string | null;
    toDayKey: string | null;
    timeZone: string;
  };
};

export type AttendanceBreakdown = {
  workedMs: number;
  sessionCount: number;
};

export type BreaksBreakdown = {
  totalMs: number;
  count: number;
  /** Breaks as a % of (worked + break) time. `null` when neither happened —
   * a ratio of nothing is not a ratio of 0. */
  ratioPercent: number | null;
};

export type FocusBreakdown = {
  trackedMs: number;
};

/**
 * Breaks as a share of gross tracked time (worked + break). `null` when
 * there's no worked or break time to take a share of.
 */
export function breakToWorkedRatio(
  workedMs: number,
  breaksMs: number
): number | null {
  const total = workedMs + breaksMs;
  if (total <= 0) return null;
  return (breaksMs / total) * 100;
}

/**
 * `due` counts every open (not-Done) task with a due date — the pool
 * `delayed` is drawn from. A task with no due date can never be delayed, the
 * same "no due date, can't be late" reasoning `lib/tasks.ts`'s `isOverdue`
 * already applies.
 */
export type TasksBreakdown = {
  completed: number;
  due: number;
  delayed: number;
  completionRate: number | null;
  onTimeRate: number | null;
  /** Average creation-to-completion time across Done tasks in scope that
   * carry both timestamps. `null` when none do. Display-only, like every
   * field on this type except `completionRate`/`onTimeRate` — not fed into
   * `calculatePerformanceScore`. */
  avgTurnaroundMs: number | null;
};

/** Distinct projects a subject's scoped tasks touch, and how many of those
 * tasks carry a project at all — a task with no `projectId` (personal/
 * client-direct work) is neither. Display-only. */
export type ProjectsBreakdown = {
  distinctProjects: number;
  tasksWithProject: number;
};

/**
 * Average time from a task's creation to its completion, across Done tasks
 * that carry both timestamps. A `Done` task missing either is excluded
 * rather than guessed at — the same reasoning `scopeInputsToPeriod` already
 * applies to a `Done` task with no `completedAt`.
 */
export function averageTaskTurnaroundMs(
  tasks: readonly TaskSignal[]
): number | null {
  const durations = tasks
    .filter((task) => task.status === "Done")
    .map((task) => {
      const created = toDate(task.createdAt ?? null);
      const completed = toDate(task.completedAt);
      if (!created || !completed) return null;
      return completed.getTime() - created.getTime();
    })
    .filter((value): value is number => value !== null && value >= 0);

  if (durations.length === 0) return null;
  return durations.reduce((sum, ms) => sum + ms, 0) / durations.length;
}

/** Distinct-project count and project-tied task count among the tasks
 * passed in (already period-scoped by the caller, same as every other
 * `TasksBreakdown` figure). */
export function projectContribution(
  tasks: readonly TaskSignal[]
): ProjectsBreakdown {
  const withProject = tasks.filter((task) => task.projectId);
  return {
    distinctProjects: new Set(withProject.map((task) => task.projectId)).size,
    tasksWithProject: withProject.length,
  };
}

export type PerformanceBreakdown = {
  attendance: AttendanceBreakdown;
  /** Present/half/leave/WFH day counts, each expandable to its dates
   * (`components/performance/day-breakdown-panel.tsx`). A reporting view —
   * deliberately not fed into `calculatePerformanceScore`, which would
   * retroactively change what every stored `PerformanceRecord` means. */
  days: AttendanceDaysBreakdown;
  breaks: BreaksBreakdown;
  focus: FocusBreakdown;
  tasks: TasksBreakdown;
  projects: ProjectsBreakdown;
  /** The same collective score `calculatePerformanceScore` already produces. */
  score: number | null;
};

export function buildPerformanceBreakdown(
  input: PerformanceBreakdownInput,
  now: Date
): PerformanceBreakdown {
  const openWithDueDate = input.tasks.filter(
    (task) => isOpen(task.status) && task.dueDate !== null
  );

  const tasks: TasksBreakdown = {
    completed: input.tasks.filter((task) => task.status === "Done").length,
    due: openWithDueDate.length,
    delayed: openWithDueDate.filter((task) => isOverdue(task, now)).length,
    completionRate: taskCompletionRate(input.tasks),
    onTimeRate: onTimeDeliveryRate(input.tasks),
    avgTurnaroundMs: averageTaskTurnaroundMs(input.tasks),
  };

  const score = calculatePerformanceScore({
    tasks: input.tasks,
    workloadPercent: input.workloadPercent,
    feedbackRatings: input.feedbackRatings,
    goals: input.goals,
  });

  const workedMs = netWorkedMs([...input.sessions], [...input.breaks], now);
  const breaksMs = breakDurationMs([...input.breaks], now);

  return {
    attendance: {
      workedMs,
      sessionCount: input.sessions.length,
    },
    days: buildAttendanceDays(
      {
        sessions: input.dayAttendance.sessions,
        breaks: input.dayAttendance.breaks,
        leaveWindows: input.dayAttendance.leaveWindows,
        fromDayKey: input.dayAttendance.fromDayKey,
        toDayKey: input.dayAttendance.toDayKey,
        timeZone: input.dayAttendance.timeZone,
      },
      now
    ),
    breaks: {
      totalMs: breaksMs,
      count: input.breaks.length,
      ratioPercent: breakToWorkedRatio(workedMs, breaksMs),
    },
    focus: {
      trackedMs: totalTrackedMs([...input.timeEntries], now),
    },
    tasks,
    projects: projectContribution(input.tasks),
    score,
  };
}

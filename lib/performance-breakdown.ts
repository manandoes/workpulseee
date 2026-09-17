import { netWorkedMs, breakDurationMs, type AttendanceSession, type BreakInterval } from "@/lib/attendance";
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
};

export type AttendanceBreakdown = {
  workedMs: number;
  sessionCount: number;
};

export type BreaksBreakdown = {
  totalMs: number;
  count: number;
};

export type FocusBreakdown = {
  trackedMs: number;
};

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
};

export type PerformanceBreakdown = {
  attendance: AttendanceBreakdown;
  breaks: BreaksBreakdown;
  focus: FocusBreakdown;
  tasks: TasksBreakdown;
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
  };

  const score = calculatePerformanceScore({
    tasks: input.tasks,
    workloadPercent: input.workloadPercent,
    feedbackRatings: input.feedbackRatings,
    goals: input.goals,
  });

  return {
    attendance: {
      workedMs: netWorkedMs([...input.sessions], [...input.breaks], now),
      sessionCount: input.sessions.length,
    },
    breaks: {
      totalMs: breakDurationMs([...input.breaks], now),
      count: input.breaks.length,
    },
    focus: {
      trackedMs: totalTrackedMs([...input.timeEntries], now),
    },
    tasks,
    score,
  };
}

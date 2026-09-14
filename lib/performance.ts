import type { GoalStatus, TaskStatus } from "@/lib/generated/prisma/enums";

/**
 * Performance scoring logic (Rules.md section 5 — rules live in `lib/`, not
 * scattered inside routes or components; section 10 — this is critical
 * business logic and needs direct unit tests).
 *
 * Mirrors `lib/workload.ts`: everything here is pure, and every judgment call
 * PRD.md section 6.5 leaves open is documented in place, the single spot to
 * retune it if real data shows it reading wrong.
 */

export type TaskSignal = {
  status: TaskStatus;
  dueDate: Date | string | null;
  completedAt: Date | string | null;
};

function toDate(value: Date | string | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Share of ever-assigned tasks that reached Done, as a percentage.
 *
 * `null` when the employee has never been assigned a task at all — there is
 * nothing to have a completion rate about yet, which is different from having
 * completed 0% of something.
 */
export function taskCompletionRate(
  tasks: readonly TaskSignal[]
): number | null {
  if (tasks.length === 0) return null;
  const done = tasks.filter((task) => task.status === "Done").length;
  return (done / tasks.length) * 100;
}

/**
 * Of the tasks that reached Done, the share finished at or before their due
 * date. A task with no due date can't have been late, so it counts as on
 * time. `null` until at least one task is Done — an on-time *rate* needs a
 * finished task to be a rate of anything.
 */
export function onTimeDeliveryRate(
  tasks: readonly TaskSignal[]
): number | null {
  const done = tasks.filter((task) => task.status === "Done");
  if (done.length === 0) return null;

  const onTime = done.filter((task) => {
    const due = toDate(task.dueDate);
    if (!due) return true;
    const completed = toDate(task.completedAt);
    return !completed || completed.getTime() <= due.getTime();
  }).length;

  return (onTime / done.length) * 100;
}

/**
 * How much of the score "workload carried" contributes.
 *
 * `null` if workload has never been computed for this employee (Phase 6's
 * `workloadPercent` starts `null`, not 0). Otherwise capped at 100: carrying
 * up to full capacity counts as full contribution, but overload is capped
 * rather than rewarded — this score should not encourage taking on more than
 * capacity allows, and Design.md's Workload Indicator Scale already flags
 * that as a risk elsewhere (the workload bar), not as something to chase here.
 */
export function workloadContribution(
  workloadPercent: number | null
): number | null {
  if (workloadPercent === null) return null;
  return Math.min(workloadPercent, 100);
}

/**
 * Average manager-feedback rating (1–5), scaled to 0–100. `null` if nobody
 * has given this employee feedback yet — excluded from the score rather than
 * counted as a low rating, since no feedback is not the same as bad feedback.
 */
export function feedbackContribution(
  ratings: readonly number[]
): number | null {
  if (ratings.length === 0) return null;
  const average =
    ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
  return ((average - 1) / 4) * 100;
}

/**
 * Share of *decided* goals that were Achieved rather than Missed.
 *
 * A still-`Active` goal isn't yet a data point on whether it was hit, so it is
 * excluded from both sides of the ratio — including it at 0% credit would
 * punish an employee for a goal simply not having concluded yet. `null` when
 * there are no decided goals (none set, or all still `Active`).
 */
export function goalContribution(
  goals: readonly { status: GoalStatus }[]
): number | null {
  const achieved = goals.filter((goal) => goal.status === "Achieved").length;
  const missed = goals.filter((goal) => goal.status === "Missed").length;
  const decided = achieved + missed;
  if (decided === 0) return null;
  return (achieved / decided) * 100;
}

/**
 * Relative importance of each score input. PRD.md section 6.5 names these
 * five inputs but gives no formula — a judgment call, flagged here and in
 * Memory.md's Key Decisions Log the way Phase 6 flagged its own weights.
 */
export const PERFORMANCE_WEIGHTS = {
  completion: 30,
  onTime: 25,
  workload: 15,
  feedback: 15,
  goals: 15,
} as const;

export type PerformanceInput = {
  tasks: readonly TaskSignal[];
  workloadPercent: number | null;
  feedbackRatings: readonly number[];
  goals: readonly { status: GoalStatus }[];
};

/**
 * The performance score PRD.md section 6.5 calls a "continuous scoring
 * engine", 0–100.
 *
 * Only components that returned a value are averaged, with the remaining
 * weights renormalized to sum to 100 — a brand-new hire with no feedback or
 * goals yet is scored on what does exist (their tasks) rather than having
 * "no feedback" silently act like a 0. Returns `null` only when every
 * component is `null` — nothing at all to score yet, in which case the caller
 * writes no `PerformanceRecord` (Architecture.md's history model, unlike
 * `workloadPercent`'s single cached value).
 */
export function calculatePerformanceScore(
  input: PerformanceInput
): number | null {
  const components: { weight: number; value: number }[] = [
    {
      weight: PERFORMANCE_WEIGHTS.completion,
      value: taskCompletionRate(input.tasks),
    },
    {
      weight: PERFORMANCE_WEIGHTS.onTime,
      value: onTimeDeliveryRate(input.tasks),
    },
    {
      weight: PERFORMANCE_WEIGHTS.workload,
      value: workloadContribution(input.workloadPercent),
    },
    {
      weight: PERFORMANCE_WEIGHTS.feedback,
      value: feedbackContribution(input.feedbackRatings),
    },
    { weight: PERFORMANCE_WEIGHTS.goals, value: goalContribution(input.goals) },
  ].flatMap(({ weight, value }) => (value === null ? [] : [{ weight, value }]));

  if (components.length === 0) return null;

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const weighted = components.reduce((sum, c) => sum + c.value * c.weight, 0);

  return Math.round((weighted / totalWeight) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Periods (Phase 13 — performance for a date range, weekly or monthly)
// ---------------------------------------------------------------------------

/**
 * The windows a score can be asked for. `all` is the whole record — the score
 * this module computed before periods existed, and still the default.
 */
export const PERFORMANCE_PERIODS = ["all", "week", "month", "custom"] as const;
export type PerformancePeriodPreset = (typeof PERFORMANCE_PERIODS)[number];

/** An inclusive window. `null` anywhere below means "all time". */
export type Period = { from: Date; to: Date };

const PERIOD_LABELS: Record<PerformancePeriodPreset, string> = {
  all: "All time",
  week: "This week",
  month: "This month",
  custom: "Custom range",
};

export function performancePeriodLabel(
  preset: PerformancePeriodPreset
): string {
  return PERIOD_LABELS[preset];
}

/** Monday, 00:00:00.000 UTC, of the week containing `now`. */
function startOfWeek(now: Date): Date {
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysSinceMonday
    )
  );
}

/** The last instant of the day `YYYY-MM-DD` names, so a range includes its end date. */
function endOfDay(day: Date): Date {
  return new Date(day.getTime() + 24 * 60 * 60 * 1000 - 1);
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(value: string | undefined): Date | null {
  if (!value || !DAY_PATTERN.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Turn what the URL carries into a window, or `null` for all time.
 *
 * Boundaries are UTC midnight and inclusive at both ends, matching how every
 * date-only field in this schema is stored (`Task.dueDate`, `Goal.targetDate`)
 * — "1 to 31 March" must include everything that happened on the 31st.
 *
 * A `custom` range missing or misordering its dates resolves to `null` rather
 * than erroring: these values come from a URL anyone can edit, and falling back
 * to the full record is the reading that cannot mislead.
 */
export function resolvePeriod(
  preset: PerformancePeriodPreset,
  from: string | undefined,
  to: string | undefined,
  now: Date
): Period | null {
  if (preset === "week") {
    const start = startOfWeek(now);
    return {
      from: start,
      to: endOfDay(new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000)),
    };
  }

  if (preset === "month") {
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    );
    return {
      from: start,
      to: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 1
      ),
    };
  }

  if (preset === "custom") {
    const start = parseDay(from);
    const end = parseDay(to);
    if (!start || !end || end.getTime() < start.getTime()) return null;
    return { from: start, to: endOfDay(end) };
  }

  return null;
}

function withinPeriod(value: Date | string | null, period: Period): boolean {
  const date = toDate(value);
  if (!date) return false;
  return (
    date.getTime() >= period.from.getTime() &&
    date.getTime() <= period.to.getTime()
  );
}

export type FeedbackSignal = { rating: number; createdAt: Date | string };
export type GoalSignal = { status: GoalStatus; decidedAt: Date | string };

/**
 * The same inputs as `PerformanceInput`, but each carrying the timestamp that
 * places it in time — which is the only thing a period needs and the reason
 * this is a separate type rather than a widened one. `PerformanceInput` stays
 * exactly what the score is computed from.
 */
export type PeriodPerformanceInput = {
  tasks: readonly TaskSignal[];
  workloadPercent: number | null;
  feedback: readonly FeedbackSignal[];
  goals: readonly GoalSignal[];
};

/**
 * Narrow a full record down to one window, ready for
 * `calculatePerformanceScore`.
 *
 * What counts as "a task in this period" is a judgment call — a task spans
 * time, so no timestamp is the obviously right one. The rule here is the work
 * that *landed or came due* in the window: a task completed inside it counts
 * (as a completion, and on time or not against its own deadline), and a task
 * that came due inside it and is still unfinished counts against completion.
 * Work neither finished nor due in the window is somebody else's month. This
 * is the one line to retune if the numbers read wrong.
 *
 * A `Done` task with no `completedAt` is excluded rather than guessed at: the
 * timestamp is what places it in a period, and `completionFor` in
 * `lib/tasks.ts` writes one for every task that reaches Done.
 *
 * Workload drops out of any bounded period. It is a live snapshot with no
 * history (`Employee.workloadPercent`, overwritten in place), so it cannot
 * describe a past March honestly. `calculatePerformanceScore` already
 * renormalizes around a `null` component, so nothing else has to change.
 */
export function scopeInputsToPeriod(
  input: PeriodPerformanceInput,
  period: Period | null
): PerformanceInput {
  if (!period) {
    return {
      tasks: input.tasks,
      workloadPercent: input.workloadPercent,
      feedbackRatings: input.feedback.map((entry) => entry.rating),
      goals: input.goals,
    };
  }

  return {
    tasks: input.tasks.filter((task) =>
      task.status === "Done"
        ? withinPeriod(task.completedAt, period)
        : withinPeriod(task.dueDate, period)
    ),
    workloadPercent: null,
    feedbackRatings: input.feedback
      .filter((entry) => withinPeriod(entry.createdAt, period))
      .map((entry) => entry.rating),
    goals: input.goals.filter(
      (goal) =>
        goal.status !== "Active" && withinPeriod(goal.decidedAt, period)
    ),
  };
}

/** A performance band for display, reusing Design.md's success/warning/danger
 * status palette (Design.md § 10 — color never carries meaning alone). */
export type PerformanceBand = "success" | "warning" | "danger";

/**
 * Thresholds are a judgment call, like `workloadBand`'s — PRD.md section 6.5
 * doesn't give bands, only that the score should be "directional/indicative".
 */
export function performanceBand(score: number): PerformanceBand {
  if (score >= 70) return "success";
  if (score >= 40) return "warning";
  return "danger";
}

export function performanceBandLabel(band: PerformanceBand): string {
  switch (band) {
    case "success":
      return "Strong";
    case "warning":
      return "Steady";
    case "danger":
      return "Needs support";
  }
}

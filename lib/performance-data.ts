import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import type { EmployeeSubject, SessionActor } from "@/lib/permissions";
import { paginationMeta, type PaginationMeta } from "@/lib/pagination";
import {
  calculatePerformanceScore,
  scopeInputsToPeriod,
  type Period,
  type PeriodPerformanceInput,
  type TaskSignal,
} from "@/lib/performance";
import {
  buildPerformanceBreakdown,
  type PerformanceBreakdown,
} from "@/lib/performance-breakdown";
import type { GoalStatus } from "@/lib/generated/prisma/enums";
import type {
  CreateFeedbackInput,
  CreateGoalInput,
} from "@/lib/validations/performance";

/**
 * Database access for performance tracking (Phases.md Phase 8).
 *
 * Kept separate from `lib/performance.ts`, the same split every other
 * feature in this codebase draws (`lib/workload.ts`/`workload-data.ts`,
 * `lib/requests.ts`/`request-data.ts`): this module touches the database, the
 * other is pure and unit-tested directly.
 *
 * Plan: performance for all company accounts, not just employees —
 * `PerformanceRecord`/`Goal`/`Feedback` now carry either `employeeId` or
 * `accountId` (the same two-nullable-FK shape `lib/attendance-data.ts`
 * already established for `AttendanceRecord`/`BreakRecord`), and every
 * function that used to take a bare `employeeId` instead takes a
 * `PerformanceSubject`. A CompanyAccount is never a task assignee and has no
 * `workloadPercent`, so the task/workload signals are a natural empty/null
 * for one, the same reasoning `attendance-data.ts` already applies to
 * `startBreak`'s task-timer pause step.
 */

// ---------------------------------------------------------------------------
// Shared lookups
// ---------------------------------------------------------------------------

/** An explicit person to compute or read performance for — an Employee or a
 * CompanyAccount, named the same way `lib/attendance-data.ts`'s
 * `AttendanceSubject` names them. */
export type PerformanceSubject =
  | { kind: "employee"; id: string }
  | { kind: "account"; id: string };

function subjectWhereFor(subject: PerformanceSubject) {
  return subject.kind === "employee"
    ? { employeeId: subject.id }
    : { accountId: subject.id };
}

/** The employee fields the permission rules need, loaded through the tenant filter. */
export function loadEmployeeSubject(
  actor: SessionActor,
  employeeId: string
): Promise<EmployeeSubject | null> {
  return db.employee.findFirst({
    where: scopedWhere(actor, { id: employeeId }),
    select: { id: true, managerId: true, managerAccountId: true },
  });
}

/** A company account's bare existence within this company — a CompanyAccount
 * has no manager relationship to check, so unlike `loadEmployeeSubject` this
 * is only ever used to confirm the id belongs here before an
 * `isCompanyAdmin`/self permission check. */
export function loadAccountSubject(actor: SessionActor, accountId: string) {
  return db.companyAccount.findFirst({
    where: { id: accountId, companyId: actor.companyId, deletedAt: null },
    select: { id: true },
  });
}

// ---------------------------------------------------------------------------
// Score computation
// ---------------------------------------------------------------------------

const taskSignalSelect = {
  status: true,
  dueDate: true,
  completedAt: true,
} as const;

/**
 * Everything a subject's score is computed from, each signal carrying the
 * timestamp that places it in time so a period can narrow it
 * (`scopeInputsToPeriod`). Always the full record — the window is applied
 * afterwards, in memory, because these are per-subject lists a page already
 * loads in full.
 *
 * A CompanyAccount is never a task assignee and has no `workloadPercent`
 * column, so both are a natural empty/`null` for an account subject rather
 * than a query that would always come back empty anyway.
 *
 * `Goal` has no `decidedAt` column and does not need one: `decideGoal` only
 * ever writes `status`, so a decided goal's `updatedAt` *is* when it was
 * decided.
 */
async function scoreInputsFor(
  companyId: string,
  subject: PerformanceSubject
): Promise<PeriodPerformanceInput> {
  const [workloadPercent, tasks, feedback, goals] = await Promise.all([
    subject.kind === "employee"
      ? db.employee
          .findUniqueOrThrow({
            where: { id: subject.id },
            select: { workloadPercent: true },
          })
          .then((employee) =>
            employee.workloadPercent ? Number(employee.workloadPercent) : null
          )
      : Promise.resolve(null),
    subject.kind === "employee"
      ? db.task.findMany({
          where: { companyId, assigneeId: subject.id, deletedAt: null },
          select: taskSignalSelect,
        })
      : Promise.resolve([]),
    db.feedback.findMany({
      where: { companyId, ...subjectWhereFor(subject) },
      select: { rating: true, createdAt: true },
    }),
    db.goal.findMany({
      where: { companyId, ...subjectWhereFor(subject), deletedAt: null },
      select: { status: true, updatedAt: true },
    }),
  ]);

  return {
    tasks: tasks as TaskSignal[],
    workloadPercent,
    feedback,
    goals: goals.map((goal) => ({
      status: goal.status as GoalStatus,
      decidedAt: goal.updatedAt,
    })),
  };
}

/**
 * One subject's score over a window, or over their whole record when
 * `period` is `null` (Phase 13).
 *
 * Computed on read and never stored: `PerformanceRecord` is the all-time
 * timeline, and a period score is a question asked of the same data rather
 * than a second thing to keep fresh. Returns `null` when nothing in the window
 * can be scored, which the pages render as "no data for this period" rather
 * than as a zero.
 */
export async function loadPeriodScore(
  companyId: string,
  subject: PerformanceSubject,
  period: Period | null
): Promise<number | null> {
  const input = await scoreInputsFor(companyId, subject);
  return calculatePerformanceScore(scopeInputsToPeriod(input, period));
}

// ---------------------------------------------------------------------------
// Parameter breakdown (attendance, breaks, focus, tasks)
// ---------------------------------------------------------------------------

/**
 * One subject's performance broken down by parameter, over `period` (or
 * their whole record when `period` is `null`) — what
 * `buildPerformanceBreakdown` (`lib/performance-breakdown.ts`) needs.
 *
 * Attendance/break/tracked-time rows are filtered by their own start
 * timestamp the same way `scopeInputsToPeriod` narrows tasks/feedback/goals:
 * a session, break, or tracked stretch "in the period" is one that started in
 * it. `AttendanceRecord`/`BreakRecord`/`TaskTimeEntry` have no `deletedAt`
 * (every row is history), so they are filtered by a plain `{ companyId, ... }`
 * rather than `scopedWhere`, the same way `lib/attendance-data.ts` already
 * reads them. `TaskTimeEntry` has no `accountId` column (a CompanyAccount is
 * never a task assignee), so tracked time is a natural empty list for one.
 */
export async function loadPerformanceBreakdown(
  companyId: string,
  subject: PerformanceSubject,
  period: Period | null,
  now: Date = new Date()
): Promise<PerformanceBreakdown> {
  const startedInPeriod = period
    ? { gte: period.from, lte: period.to }
    : undefined;

  const [input, sessions, timeEntries] = await Promise.all([
    scoreInputsFor(companyId, subject),
    db.attendanceRecord.findMany({
      where: {
        companyId,
        ...subjectWhereFor(subject),
        clockInAt: startedInPeriod,
      },
      select: {
        clockInAt: true,
        clockOutAt: true,
        breaks: { select: { startedAt: true, endedAt: true } },
      },
    }),
    subject.kind === "employee"
      ? db.taskTimeEntry.findMany({
          where: { companyId, employeeId: subject.id, startedAt: startedInPeriod },
          select: { startedAt: true, endedAt: true },
        })
      : Promise.resolve([]),
  ]);

  const scoped = scopeInputsToPeriod(input, period);

  return buildPerformanceBreakdown(
    {
      sessions,
      breaks: sessions.flatMap((session) => session.breaks),
      timeEntries,
      tasks: scoped.tasks,
      workloadPercent: scoped.workloadPercent,
      feedbackRatings: scoped.feedbackRatings,
      goals: scoped.goals,
    },
    now
  );
}

/**
 * Recompute one subject's score and, if there is enough data to produce one,
 * append it as a new `PerformanceRecord` — the history timeline
 * Architecture.md's ERD draws, unlike `workloadPercent`'s single cached
 * value. Returns the new score, or `null` if nothing was written.
 */
export async function recalcPersonPerformance(
  companyId: string,
  subject: PerformanceSubject,
  now: Date = new Date()
): Promise<number | null> {
  const input = await scoreInputsFor(companyId, subject);
  // The stored timeline is an all-time score, unchanged by Phase 13's periods.
  const score = calculatePerformanceScore(scopeInputsToPeriod(input, null));
  if (score === null) return null;

  await db.performanceRecord.create({
    data: { companyId, ...subjectWhereFor(subject), score, computedAt: now },
  });

  return score;
}

/**
 * Employee-only convenience wrapper — every task/goal/feedback-write route
 * that recomputes off a bare `employeeId` only ever concerns an Employee (a
 * task assignee, or the subject of employee-scoped goals/feedback), so this
 * keeps those call sites unchanged rather than threading a subject shape
 * through code that never sees a CompanyAccount id.
 */
export async function recalcEmployeePerformance(
  companyId: string,
  employeeId: string,
  now: Date = new Date()
): Promise<number | null> {
  return recalcPersonPerformance(companyId, { kind: "employee", id: employeeId }, now);
}

/**
 * `recalcEmployeePerformance`, but never throws — called from task/goal/
 * feedback-write routes after the primary write already succeeded, the same
 * shape as `safeRecalcEmployeeWorkload` (Rules.md section 4: a side-effect
 * recompute must never turn a saved write into a 500).
 */
export async function safeRecalcEmployeePerformance(
  companyId: string,
  employeeId: string | null
): Promise<void> {
  if (!employeeId) return;

  try {
    await recalcEmployeePerformance(companyId, employeeId);
  } catch (cause) {
    console.error("[performance-recalc-error]", {
      companyId,
      employeeId,
      cause,
    });
  }
}

/**
 * `safeRecalcEmployeePerformance`, widened to either subject kind — used by
 * the goal/feedback routes, which (Plan: performance for all company
 * accounts) may now target a CompanyAccount as well as an Employee.
 */
export async function safeRecalcPersonPerformance(
  companyId: string,
  subject: PerformanceSubject | null
): Promise<void> {
  if (!subject) return;

  try {
    await recalcPersonPerformance(companyId, subject);
  } catch (cause) {
    console.error("[performance-recalc-error]", {
      companyId,
      subject,
      cause,
    });
  }
}

/** Recompute every employee and company account in a company. Best-effort per subject, so one bad record can't stop the sweep. */
export async function recalcCompanyPerformance(
  companyId: string,
  now: Date = new Date()
): Promise<number> {
  const [employees, accounts] = await Promise.all([
    db.employee.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true },
    }),
    db.companyAccount.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true },
    }),
  ]);

  let scored = 0;
  for (const employee of employees) {
    const score = await recalcPersonPerformance(
      companyId,
      { kind: "employee", id: employee.id },
      now
    );
    if (score !== null) scored += 1;
  }
  for (const account of accounts) {
    const score = await recalcPersonPerformance(
      companyId,
      { kind: "account", id: account.id },
      now
    );
    if (score !== null) scored += 1;
  }

  return scored;
}

/**
 * The periodic sweep (Architecture.md's `jobs/recalculatePerformance.ts`
 * names this function, run over HTTP like `recalcAllCompanies` — see that
 * file). Task/goal/feedback writes already recompute the subject they touch
 * immediately, so this is a safety net.
 */
export async function recalcAllCompaniesPerformance(
  now: Date = new Date()
): Promise<{ companies: number; scored: number }> {
  const companies = await db.company.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  let scored = 0;
  for (const company of companies) {
    scored += await recalcCompanyPerformance(company.id, now);
  }

  return { companies: companies.length, scored };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type PerformanceHistoryPoint = { score: unknown; computedAt: Date };

/**
 * A subject's score history, newest first — the timeline PRD.md section 6.5
 * asks for, narrowed to `period` when one is given (Phase 13) so the chart
 * covers the same window as the score above it.
 */
export function loadPerformanceHistory(
  companyId: string,
  subject: PerformanceSubject,
  period: Period | null = null,
  limit = 30
): Promise<PerformanceHistoryPoint[]> {
  return db.performanceRecord.findMany({
    where: {
      companyId,
      ...subjectWhereFor(subject),
      ...(period ? { computedAt: { gte: period.from, lte: period.to } } : {}),
    },
    orderBy: { computedAt: "desc" },
    take: limit,
    select: { score: true, computedAt: true },
  });
}

export type PerformanceQueueRow = {
  id: string;
  fullName: string;
  jobRole: string | null;
  department: { name: string } | null;
  latestScore: unknown | null;
};

export type PerformanceQueuePage = {
  employees: PerformanceQueueRow[];
} & PaginationMeta;

/**
 * The performance list: every employee Owner/Admin/HR may open is every
 * employee in the company; a Manager's is narrowed to their own direct
 * reports, the same split `loadRequestsForApprover` draws for requests.
 *
 * Company-account performance (Plan: performance for all company accounts)
 * is reviewed from that account's own Squad profile, not listed here — this
 * queue mirrors the Employees directory it sits alongside in HRMS mode.
 */
export async function loadPerformanceQueue(
  actor: SessionActor,
  filters: { q?: string; departmentId?: string },
  requestedPage: number
): Promise<PerformanceQueuePage> {
  const where: Record<string, unknown> = {};

  const q = filters.q?.trim();
  if (q) {
    where.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { jobRole: { contains: q, mode: "insensitive" } },
    ];
  }

  if (filters.departmentId) {
    where.departmentId =
      filters.departmentId === "none" ? null : filters.departmentId;
  }

  if (actor.role === "Manager") {
    where.managerAccountId = actor.id;
  }

  const scoped = scopedWhere(actor, where);
  const total = await db.employee.count({ where: scoped });
  const meta = paginationMeta(total, requestedPage);

  const employees = await db.employee.findMany({
    where: scoped,
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      jobRole: true,
      department: { select: { name: true } },
      performanceRecords: {
        orderBy: { computedAt: "desc" },
        take: 1,
        select: { score: true },
      },
    },
    skip: meta.skip,
    take: meta.take,
  });

  return {
    employees: employees.map((employee) => ({
      id: employee.id,
      fullName: employee.fullName,
      jobRole: employee.jobRole,
      department: employee.department,
      latestScore: employee.performanceRecords[0]?.score ?? null,
    })),
    ...meta,
  };
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export type LoadedGoal = {
  id: string;
  title: string;
  description: string | null;
  targetDate: Date | null;
  status: GoalStatus;
  createdAt: Date;
  createdBy: { fullName: string } | null;
};

const goalSelect = {
  id: true,
  title: true,
  description: true,
  targetDate: true,
  status: true,
  createdAt: true,
  createdBy: { select: { fullName: true } },
} as const;

export function loadGoals(
  companyId: string,
  subject: PerformanceSubject
): Promise<LoadedGoal[]> {
  return db.goal.findMany({
    where: { companyId, ...subjectWhereFor(subject), deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: goalSelect,
  });
}

export function createGoal(
  companyId: string,
  subject: PerformanceSubject,
  createdById: string,
  input: CreateGoalInput
): Promise<LoadedGoal> {
  return db.goal.create({
    data: {
      companyId,
      ...subjectWhereFor(subject),
      createdById,
      title: input.title,
      description: input.description || null,
      targetDate: input.targetDate
        ? new Date(`${input.targetDate}T00:00:00.000Z`)
        : null,
    },
    select: goalSelect,
  });
}

export function findGoal(companyId: string, goalId: string) {
  return db.goal.findFirst({
    where: { companyId, id: goalId, deletedAt: null },
    select: { id: true, status: true, employeeId: true, accountId: true },
  });
}

/** Does this goal belong to this subject? Used by the goal-decision route in
 * place of the old bare `goal.employeeId !== employeeId` comparison. */
export function goalBelongsTo(
  goal: { employeeId: string | null; accountId: string | null },
  subject: PerformanceSubject
): boolean {
  return subject.kind === "employee"
    ? goal.employeeId === subject.id
    : goal.accountId === subject.id;
}

export function decideGoal(
  goalId: string,
  status: Extract<GoalStatus, "Achieved" | "Missed">
): Promise<LoadedGoal> {
  return db.goal.update({
    where: { id: goalId },
    data: { status },
    select: goalSelect,
  });
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export type LoadedFeedback = {
  id: string;
  rating: number;
  body: string;
  createdAt: Date;
  givenBy: { fullName: string } | null;
};

const feedbackSelect = {
  id: true,
  rating: true,
  body: true,
  createdAt: true,
  givenBy: { select: { fullName: true } },
} as const;

export function loadFeedback(
  companyId: string,
  subject: PerformanceSubject,
  limit = 50
): Promise<LoadedFeedback[]> {
  return db.feedback.findMany({
    where: { companyId, ...subjectWhereFor(subject) },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: feedbackSelect,
  });
}

export function createFeedback(
  companyId: string,
  subject: PerformanceSubject,
  givenById: string,
  input: CreateFeedbackInput
): Promise<LoadedFeedback> {
  return db.feedback.create({
    data: {
      companyId,
      ...subjectWhereFor(subject),
      givenById,
      rating: Number(input.rating),
      body: input.body,
    },
    select: feedbackSelect,
  });
}

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
 */

// ---------------------------------------------------------------------------
// Shared lookups
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Score computation
// ---------------------------------------------------------------------------

const taskSignalSelect = {
  status: true,
  dueDate: true,
  completedAt: true,
} as const;

/**
 * Everything an employee's score is computed from, each signal carrying the
 * timestamp that places it in time so a period can narrow it
 * (`scopeInputsToPeriod`). Always the full record — the window is applied
 * afterwards, in memory, because these are per-employee lists a page already
 * loads in full.
 *
 * `Goal` has no `decidedAt` column and does not need one: `decideGoal` only
 * ever writes `status`, so a decided goal's `updatedAt` *is* when it was
 * decided.
 */
async function scoreInputsFor(
  companyId: string,
  employeeId: string
): Promise<PeriodPerformanceInput> {
  const [employee, tasks, feedback, goals] = await Promise.all([
    db.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { workloadPercent: true },
    }),
    db.task.findMany({
      where: { companyId, assigneeId: employeeId, deletedAt: null },
      select: taskSignalSelect,
    }),
    db.feedback.findMany({
      where: { companyId, employeeId },
      select: { rating: true, createdAt: true },
    }),
    db.goal.findMany({
      where: { companyId, employeeId, deletedAt: null },
      select: { status: true, updatedAt: true },
    }),
  ]);

  return {
    tasks: tasks as TaskSignal[],
    workloadPercent: employee.workloadPercent
      ? Number(employee.workloadPercent)
      : null,
    feedback,
    goals: goals.map((goal) => ({
      status: goal.status as GoalStatus,
      decidedAt: goal.updatedAt,
    })),
  };
}

/**
 * One employee's score over a window, or over their whole record when
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
  employeeId: string,
  period: Period | null
): Promise<number | null> {
  const input = await scoreInputsFor(companyId, employeeId);
  return calculatePerformanceScore(scopeInputsToPeriod(input, period));
}

/**
 * Recompute one employee's score and, if there is enough data to produce one,
 * append it as a new `PerformanceRecord` — the history timeline
 * Architecture.md's ERD draws, unlike `workloadPercent`'s single cached
 * value. Returns the new score, or `null` if nothing was written.
 */
export async function recalcEmployeePerformance(
  companyId: string,
  employeeId: string,
  now: Date = new Date()
): Promise<number | null> {
  const input = await scoreInputsFor(companyId, employeeId);
  // The stored timeline is an all-time score, unchanged by Phase 13's periods.
  const score = calculatePerformanceScore(scopeInputsToPeriod(input, null));
  if (score === null) return null;

  await db.performanceRecord.create({
    data: { companyId, employeeId, score, computedAt: now },
  });

  return score;
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

/** Recompute every employee in a company. Best-effort per employee, so one bad record can't stop the sweep. */
export async function recalcCompanyPerformance(
  companyId: string,
  now: Date = new Date()
): Promise<number> {
  const employees = await db.employee.findMany({
    where: { companyId, deletedAt: null },
    select: { id: true },
  });

  let scored = 0;
  for (const employee of employees) {
    const score = await recalcEmployeePerformance(companyId, employee.id, now);
    if (score !== null) scored += 1;
  }

  return scored;
}

/**
 * The periodic sweep (Architecture.md's `jobs/recalculatePerformance.ts`
 * names this function, run over HTTP like `recalcAllCompanies` — see that
 * file). Task/goal/feedback writes already recompute the employee they touch
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
 * An employee's score history, newest first — the timeline PRD.md section 6.5
 * asks for, narrowed to `period` when one is given (Phase 13) so the chart
 * covers the same window as the score above it.
 */
export function loadPerformanceHistory(
  companyId: string,
  employeeId: string,
  period: Period | null = null,
  limit = 30
): Promise<PerformanceHistoryPoint[]> {
  return db.performanceRecord.findMany({
    where: {
      companyId,
      employeeId,
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
  employeeId: string
): Promise<LoadedGoal[]> {
  return db.goal.findMany({
    where: { companyId, employeeId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: goalSelect,
  });
}

export function createGoal(
  companyId: string,
  employeeId: string,
  createdById: string,
  input: CreateGoalInput
): Promise<LoadedGoal> {
  return db.goal.create({
    data: {
      companyId,
      employeeId,
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
    select: { id: true, status: true, employeeId: true },
  });
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
  employeeId: string,
  limit = 50
): Promise<LoadedFeedback[]> {
  return db.feedback.findMany({
    where: { companyId, employeeId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: feedbackSelect,
  });
}

export function createFeedback(
  companyId: string,
  employeeId: string,
  givenById: string,
  input: CreateFeedbackInput
): Promise<LoadedFeedback> {
  return db.feedback.create({
    data: {
      companyId,
      employeeId,
      givenById,
      rating: Number(input.rating),
      body: input.body,
    },
    select: feedbackSelect,
  });
}

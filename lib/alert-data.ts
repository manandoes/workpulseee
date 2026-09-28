import { db } from "@/lib/db";
import { generateAlerts } from "@/lib/alerts";
import { completionPercent, isOverdue } from "@/lib/tasks";
import { performanceBand, type PerformanceBand } from "@/lib/performance";
import { isHrLevel, type SessionActor } from "@/lib/permissions";

/**
 * Database access for the early-warning engine (Phases.md Phase 9).
 *
 * Kept separate from `lib/alerts.ts`, the same split every other feature in
 * this codebase draws (`lib/workload.ts`/`workload-data.ts`,
 * `lib/performance.ts`/`performance-data.ts`): this module touches the
 * database, the other is pure and unit-tested directly.
 */

/**
 * Regenerate every alert for a company.
 *
 * Alerts are a live snapshot, not a history (unlike `PerformanceRecord`):
 * this replaces the company's entire `Alert` table in one transaction rather
 * than diffing or appending, since an alert that is no longer triggered
 * should simply stop existing.
 */
export async function recalcCompanyAlerts(
  companyId: string,
  now: Date = new Date()
): Promise<number> {
  const [company, tasks, employees, projects, projectActivity, requests] =
    await Promise.all([
      db.company.findUniqueOrThrow({
        where: { id: companyId },
        select: {
          overloadThresholdPercent: true,
          stalledProjectDays: true,
          agingApprovalDays: true,
        },
      }),
      db.task.findMany({
        where: { companyId, deletedAt: null },
        select: {
          id: true,
          title: true,
          status: true,
          dueDate: true,
          assigneeId: true,
          projectId: true,
        },
      }),
      db.employee.findMany({
        where: { companyId, deletedAt: null },
        select: { id: true, fullName: true, workloadPercent: true },
      }),
      db.project.findMany({
        where: { companyId, deletedAt: null },
        select: { id: true, name: true, status: true },
      }),
      db.task.groupBy({
        by: ["projectId"],
        where: { companyId, deletedAt: null },
        _max: { updatedAt: true },
      }),
      db.request.findMany({
        where: { companyId, deletedAt: null, status: "Pending" },
        select: {
          id: true,
          subject: true,
          type: true,
          status: true,
          createdAt: true,
          employeeId: true,
        },
      }),
    ]);

  const lastActivityByProject = new Map(
    projectActivity.map((row) => [row.projectId, row._max.updatedAt])
  );

  const drafts = generateAlerts({
    tasks,
    employees: employees.map((employee) => ({
      id: employee.id,
      fullName: employee.fullName,
      workloadPercent: employee.workloadPercent
        ? Number(employee.workloadPercent)
        : null,
    })),
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
      lastTaskActivityAt: lastActivityByProject.get(project.id) ?? null,
    })),
    requests,
    overloadThresholdPercent: company.overloadThresholdPercent,
    stalledProjectDays: company.stalledProjectDays,
    agingApprovalDays: company.agingApprovalDays,
    now,
  });

  await db.$transaction([
    db.alert.deleteMany({ where: { companyId } }),
    db.alert.createMany({
      data: drafts.map((draft) => ({
        companyId,
        type: draft.type,
        severity: draft.severity,
        message: draft.message,
        link: draft.link,
        employeeId: draft.employeeId ?? null,
        projectId: draft.projectId ?? null,
      })),
    }),
  ]);

  return drafts.length;
}

export type LoadedAlert = {
  id: string;
  type: string;
  severity: string;
  message: string;
  link: string | null;
  createdAt: Date;
};

const alertSelect = {
  id: true,
  type: true,
  severity: true,
  message: true,
  link: true,
  createdAt: true,
} as const;

/**
 * The alerts a given actor may see: Owner/Admin see everything; a Manager
 * sees only alerts about their own direct reports or the projects they lead;
 * HR sees `AgingApproval` alerts only (unscoped, since HR can decide on any
 * request) — the same three-way split `navigationFor`/`isDeliveryRole` draw
 * elsewhere for what a role manages.
 */
export function loadAlertsFor(actor: SessionActor): Promise<LoadedAlert[]> {
  if (actor.role === "Manager") {
    return db.alert.findMany({
      where: {
        companyId: actor.companyId,
        OR: [
          { employee: { managerAccountId: actor.id } },
          { project: { leadAccountId: actor.id } },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: alertSelect,
    });
  }

  if (isHrLevel(actor)) {
    return db.alert.findMany({
      where: { companyId: actor.companyId, type: "AgingApproval" },
      orderBy: { createdAt: "desc" },
      select: alertSelect,
    });
  }

  return db.alert.findMany({
    where: { companyId: actor.companyId },
    orderBy: { createdAt: "desc" },
    select: alertSelect,
  });
}

// ---------------------------------------------------------------------------
// Dashboard aggregate tiles
// ---------------------------------------------------------------------------

export type WorkloadHeatmapEntry = {
  id: string;
  fullName: string;
  workloadPercent: number | null;
};

export type DeliveryMetrics = {
  activeProjects: number;
  taskCompletionPercent: number | null;
  overdueTasksCount: number;
  workloadHeatmap: WorkloadHeatmapEntry[];
  performanceSnapshot: { averageScore: number; band: PerformanceBand } | null;
};

export type DashboardMetrics = {
  activeEmployees: number;
  pendingApprovalsCount: number;
  reimbursementSummary: { count: number; total: number };
  /** `null` for HR, who administers people and requests, not delivery work. */
  delivery: DeliveryMetrics | null;
};

/**
 * The aggregate dashboard tiles (Phases.md Phase 9), scoped the same way as
 * `loadAlertsFor`: Owner/Admin company-wide, a Manager to their own direct
 * reports and led projects, HR to people and requests only — the same
 * `isDeliveryRole` split that already gates Projects/Tasks/Performance
 * navigation and the workload-settings page.
 */
export async function loadDashboardMetrics(
  actor: SessionActor
): Promise<DashboardMetrics> {
  const isManager = actor.role === "Manager";
  const isHR = isHrLevel(actor);

  const employeeWhere = isManager
    ? {
        companyId: actor.companyId,
        deletedAt: null,
        managerAccountId: actor.id,
      }
    : { companyId: actor.companyId, deletedAt: null };

  const [activeEmployees, pendingRequests] = await Promise.all([
    db.employee.count({ where: { ...employeeWhere, status: "Active" } }),
    db.request.findMany({
      where: {
        companyId: actor.companyId,
        deletedAt: null,
        status: "Pending",
        ...(isManager ? { employee: { managerAccountId: actor.id } } : {}),
      },
      select: { type: true, amount: true },
    }),
  ]);

  const pendingReimbursements = pendingRequests.filter(
    (request) => request.type === "Reimbursement"
  );

  const metrics: DashboardMetrics = {
    activeEmployees,
    pendingApprovalsCount: pendingRequests.length,
    reimbursementSummary: {
      count: pendingReimbursements.length,
      total: pendingReimbursements.reduce(
        (sum, request) => sum + Number(request.amount ?? 0),
        0
      ),
    },
    delivery: null,
  };

  if (isHR) return metrics;

  const projectWhere = isManager
    ? { companyId: actor.companyId, deletedAt: null, leadAccountId: actor.id }
    : { companyId: actor.companyId, deletedAt: null };

  const [activeProjects, projectIds, employees] = await Promise.all([
    db.project.count({ where: { ...projectWhere, status: "Active" } }),
    db.project.findMany({ where: projectWhere, select: { id: true } }),
    db.employee.findMany({
      where: employeeWhere,
      select: { id: true, fullName: true, workloadPercent: true },
    }),
  ]);

  const tasks = await db.task.findMany({
    where: {
      companyId: actor.companyId,
      deletedAt: null,
      projectId: { in: projectIds.map((project) => project.id) },
    },
    select: { status: true, dueDate: true },
  });

  const now = new Date();
  const doneCount = tasks.filter((task) => task.status === "Done").length;

  const latestScores = await db.performanceRecord.findMany({
    where: {
      companyId: actor.companyId,
      employeeId: { in: employees.map((e) => e.id) },
    },
    orderBy: { computedAt: "desc" },
    distinct: ["employeeId"],
    select: { score: true },
  });

  const performanceSnapshot =
    latestScores.length === 0
      ? null
      : (() => {
          const average =
            latestScores.reduce(
              (sum, record) => sum + Number(record.score),
              0
            ) / latestScores.length;
          return { averageScore: average, band: performanceBand(average) };
        })();

  metrics.delivery = {
    activeProjects,
    taskCompletionPercent: completionPercent(tasks.length, doneCount),
    overdueTasksCount: tasks.filter((task) => isOverdue(task, now)).length,
    workloadHeatmap: employees.map((employee) => ({
      id: employee.id,
      fullName: employee.fullName,
      workloadPercent: employee.workloadPercent
        ? Number(employee.workloadPercent)
        : null,
    })),
    performanceSnapshot,
  };

  return metrics;
}

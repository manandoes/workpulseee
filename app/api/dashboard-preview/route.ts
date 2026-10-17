import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { isHrLevel, type SessionActor } from "@/lib/permissions";
import { isOverdue } from "@/lib/tasks";
import { performanceBand } from "@/lib/performance";
import { RequestStatus, type TaskPriority } from "@/lib/generated/prisma/enums";

/**
 * Client-side preview data for dashboard metric tiles.
 *
 * The dashboard page renders aggregate counts server-side; clicking a tile
 * opens a dialog that needs richer per-row data. This lightweight endpoint
 * fetches just enough rows (capped at 15) to fill the preview without the
 * full pagination overhead of the list pages.
 */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.accountType !== "company")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const kind = request.nextUrl.searchParams.get("kind");
  const companyId = actor.companyId;
  const isManager = actor.role === "Manager";

  const baseEmployeeWhere = {
    companyId,
    deletedAt: null,
    ...(isManager ? { managerAccountId: actor.id } : {}),
  };

  const baseRequestWhere = {
    companyId,
    deletedAt: null,
    status: RequestStatus.Pending,
    ...(isManager ? { employee: { managerAccountId: actor.id } } : {}),
  };

  try {
    if (kind === "employees") {
      const employees = await db.employee.findMany({
        where: baseEmployeeWhere,
        select: { fullName: true, workloadPercent: true, jobRole: true },
        orderBy: [
          { workloadPercent: { sort: "desc", nulls: "last" } },
          { fullName: "asc" },
        ],
        take: 15,
      });
      return NextResponse.json({
        kind: "employees",
        employees: employees.map((e) => ({
          fullName: e.fullName,
          workloadPercent: e.workloadPercent,
          jobRole: e.jobRole,
        })),
      });
    }

    if (kind === "requests") {
      const requests = await db.request.findMany({
        where: baseRequestWhere,
        select: {
          id: true,
          subject: true,
          type: true,
          createdAt: true,
          employee: { select: { fullName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 15,
      });
      return NextResponse.json({
        kind: "requests",
        requests: requests.map((r) => ({
          id: r.id,
          subject: r.subject,
          type: r.type,
          createdAt: r.createdAt,
          employeeName: r.employee?.fullName ?? null,
        })),
      });
    }

    if (kind === "reimbursements") {
      const reimbursements = await db.request.findMany({
        where: { ...baseRequestWhere, type: "Reimbursement" as any },
        select: {
          id: true,
          subject: true,
          amount: true,
          createdAt: true,
          employee: { select: { fullName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 15,
      });
      return NextResponse.json({
        kind: "reimbursements",
        reimbursements: reimbursements.map((r) => ({
          id: r.id,
          subject: r.subject,
          amount: Number(r.amount ?? 0),
          createdAt: r.createdAt,
          employeeName: r.employee?.fullName ?? null,
        })),
      });
    }

    if (kind === "projects") {
      const projects = await db.project.findMany({
        where: {
          companyId,
          deletedAt: null,
          ...(isManager ? { leadAccountId: actor.id } : {}),
          status: "Active",
        },
        select: {
          name: true,
          code: true,
          dueDate: true,
          client: { select: { name: true } },
        },
        orderBy: { name: "asc" },
        take: 15,
      });
      return NextResponse.json({
        kind: "projects",
        projects: projects.map((p) => ({
          name: p.name,
          code: p.code,
          dueDate: p.dueDate,
          clientName: p.client?.name ?? null,
        })),
      });
    }

    if (kind === "tasks") {
      const projectWhere = isManager
        ? { leadAccountId: actor.id }
        : {};
      const projects = await db.project.findMany({
        where: { companyId, deletedAt: null, ...projectWhere },
        select: { id: true },
      });
      const now = new Date();
      const tasks = await db.task.findMany({
        where: {
          companyId,
          deletedAt: null,
          projectId: { in: projects.map((p) => p.id) },
          OR: [
            { status: { not: "Done" as any } },
            { AND: [{ status: "Done" as any }, { updatedAt: { lt: now } }] },
          ],
        },
        select: {
          id: true,
          title: true,
          status: true,
          dueDate: true,
          priority: true,
          assignee: { select: { fullName: true } },
          project: { select: { name: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 15,
      });
      return NextResponse.json({
        kind: "tasks",
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          dueDate: t.dueDate,
          priority: t.priority,
          assigneeName: t.assignee?.fullName ?? null,
          projectName: t.project?.name ?? null,
        })),
      });
    }

    if (kind === "performance") {
      const employees = await db.employee.findMany({
        where: baseEmployeeWhere,
        select: { id: true },
      });
      const latestScores = await db.performanceRecord.findMany({
        where: {
          companyId,
          employeeId: { in: employees.map((e) => e.id) },
        },
        orderBy: { computedAt: "desc" },
        distinct: ["employeeId"],
        select: {
          employeeId: true,
          score: true,
          employee: { select: { fullName: true } },
        },
      });
      const snapshot =
        latestScores.length === 0
          ? null
          : (() => {
              const avg =
                latestScores.reduce(
                  (sum, r) => sum + Number(r.score),
                  0
                ) / latestScores.length;
              return {
                averageScore: avg,
                band: performanceBand(avg),
              };
            })();
      const topScores = [...latestScores]
        .sort((a, b) => Number(b.score) - Number(a.score))
        .slice(0, 10)
        .map((r) => ({
          employeeName: r.employee?.fullName ?? null,
          score: Number(r.score),
        }));
      return NextResponse.json({
        kind: "performance",
        snapshot,
        topScores,
      });
    }

    return NextResponse.json(
      { error: `Unknown kind: ${kind}` },
      { status: 400 }
    );
  } catch (err) {
    console.error("[dashboard-preview]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

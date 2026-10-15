import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, unauthorized } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import { TASK_ORDER } from "@/lib/tasks";

/**
 * GET /api/my-tasks — Lightweight task list for the Eisenhower Matrix.
 *
 * Returns all open tasks assigned to the actor (plus their most recent
 * completed tasks) so the matrix can build its catalog. Employees see only
 * their own tasks; company accounts see everything in the company.
 */
export async function GET(_request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  try {
    const tasks = await db.task.findMany({
      where: {
        ...scopedWhere(actor, {
          ...(actor.accountType === "employee"
            ? { assigneeId: actor.id }
            : {}),
        }),
        status: { not: "Done" },
      },
      orderBy: [...TASK_ORDER],
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        assignee: { select: { fullName: true } },
        project: { select: { id: true, name: true } },
      },
    });

    // Also grab recently completed so they appear in the catalog too
    const completed = await db.task.findMany({
      where: {
        ...scopedWhere(actor, {
          ...(actor.accountType === "employee"
            ? { assigneeId: actor.id }
            : {}),
        }),
        status: "Done",
      },
      orderBy: [{ completedAt: { sort: "desc" as const, nulls: "last" } }],
      take: 50,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        assignee: { select: { fullName: true } },
        project: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      tasks: [...tasks, ...completed].map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate?.toISOString() ?? null,
        assigneeName: t.assignee?.fullName ?? null,
        projectName: t.project?.name ?? null,
      })),
    });
  } catch (cause) {
    return apiError("Failed to load tasks.", 500, "internal_error");
  }
}

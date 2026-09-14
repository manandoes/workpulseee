import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  apiError,
  forbidden,
  serverError,
  unauthorized,
  validationError,
  writeFailure,
} from "@/lib/api";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import { taskFilter, taskVisibilityFilter, TASK_ORDER } from "@/lib/tasks";
import {
  findTaskProject,
  resolveTaskWrite,
  unknownProject,
} from "@/lib/task-data";
import { canManageTask, canViewTasks } from "@/lib/permissions";
import { createTaskSchema, taskFiltersSchema } from "@/lib/validations/tasks";
import { safeRecalcEmployeeWorkload } from "@/lib/workload-data";
import { safeRecalcEmployeePerformance } from "@/lib/performance-data";
import { notifyTaskAssigned } from "@/lib/notification-data";

/**
 * GET /api/tasks — the task list for the caller's company.
 *
 * Supports the same search, filters and ordering as the tasks page, so the two
 * can never disagree about what a role is allowed to see.
 */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canViewTasks(actor)) return forbidden();

  const filters = taskFiltersSchema.parse(
    Object.fromEntries(request.nextUrl.searchParams)
  );

  try {
    const tasks = await db.task.findMany({
      // Tenant scoping (Rules.md section 2) — applied last, so a filter can
      // never widen the query beyond the caller's own company. A standalone
      // task is additionally personal to its creator (`taskVisibilityFilter`).
      where: scopedWhere(actor, {
        AND: [taskFilter(filters, new Date()), taskVisibilityFilter(actor)],
      }),
      orderBy: [...TASK_ORDER],
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        estimatedHours: true,
        completedAt: true,
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, fullName: true } },
      },
    });

    return NextResponse.json({ tasks });
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/tasks",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

/** POST /api/tasks — raise a task on a project (Phases.md Phase 5). */
export async function POST(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  // Role checks are server-side and independent of what the UI showed
  // (Rules.md section 3).
  if (!canViewTasks(actor)) return forbidden();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = createTaskSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const projectId = parsed.data.projectId?.trim() ?? "";
    const project = projectId ? await findTaskProject(actor, projectId) : null;
    if (projectId && !project) return writeFailure(unknownProject());

    /**
     * A task on a project inherits that project's ownership, so raising one
     * is the same right as editing the project: any project for an Owner or
     * Admin, and the ones they lead for a Manager. A standalone task has no
     * project to inherit from — it's personal to whoever raises it, which
     * `canManageTask` already grants to its own creator.
     */
    if (!canManageTask(actor, { project, createdById: actor.id })) {
      return forbidden("You can only add tasks to projects you lead.");
    }

    const resolved = await resolveTaskWrite(actor, parsed.data, project);
    if (!resolved.ok) return writeFailure(resolved);

    const task = await db.task.create({
      data: {
        ...resolved.data,
        companyId: actor.companyId,
        createdById: actor.id,
      },
      select: { id: true, title: true, status: true },
    });

    // Phases.md Phase 6 — a new task can put someone's workload up the moment
    // it exists, not after the next sweep.
    await safeRecalcEmployeeWorkload(
      actor.companyId,
      resolved.data.assigneeId ?? null
    );
    // Phases.md Phase 8 — completion/on-time rate can shift with a new task too.
    await safeRecalcEmployeePerformance(
      actor.companyId,
      resolved.data.assigneeId ?? null
    );

    /**
     * Phase 13 — work that lands on someone should say so. Raising a task
     * already unassigned is the backlog, not an event anyone needs telling
     * about, so only an assignee notifies.
     */
    if (resolved.data.assigneeId) {
      await notifyTaskAssigned({
        id: task.id,
        companyId: actor.companyId,
        title: task.title,
        dueDate: resolved.data.dueDate ?? null,
        assigneeId: resolved.data.assigneeId,
        assignedById: actor.id,
      });
    }

    return NextResponse.json({ task }, { status: 201 });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/tasks",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

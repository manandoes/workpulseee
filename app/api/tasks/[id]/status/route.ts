import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  apiError,
  forbidden,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { findTask } from "@/lib/task-data";
import { canUpdateTaskStatus } from "@/lib/permissions";
import { completionFor, completionNoteFor } from "@/lib/tasks";
import { taskStatusSchema } from "@/lib/validations/tasks";
import { safeRecalcEmployeeWorkload } from "@/lib/workload-data";
import { safeRecalcEmployeePerformance } from "@/lib/performance-data";

/**
 * PATCH /api/tasks/[id]/status — move a task through the flow
 * (Phases.md Phase 5).
 *
 * Its own route, like the client and employee status routes, because this is
 * what the board does on every card drop: one small request that changes one
 * thing, rather than a whole task body round-tripped to move a card.
 *
 * Any status may follow any other. A board where "In Review" can only come
 * after "In Progress" is a board people work around, and PRD.md section 6.3
 * describes the flow as the normal path rather than as a gate.
 *
 * Reachable by a company account managing the project (as before) or, since
 * Phases.md Phase 10, by the Employee this task is assigned to, working
 * their own board from `/my-space` — or the Manager/HR login it was allotted
 * to (Plan: allot tasks to a Manager or HR). `canUpdateTaskStatus` covers all
 * three.
 *
 * Moving to Done may carry an optional completion note (Plan: completion
 * note), which the UI asks for at that moment.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/tasks/[id]/status">
) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { id } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = taskStatusSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const task = await findTask(actor, id);
    if (!task) return apiError("Task not found.", 404, "not_found");

    if (!canUpdateTaskStatus(actor, task)) {
      return forbidden(
        "You can only move tasks on projects you lead, or your own tasks."
      );
    }

    const updated = await db.task.update({
      where: { id: task.id },
      data: {
        status: parsed.data.status,
        // Completion follows the status rather than being sent by the client,
        // so the two can never disagree (lib/tasks.ts).
        completedAt: completionFor(
          parsed.data.status,
          task.completedAt,
          new Date()
        ),
        completionNote: completionNoteFor(
          parsed.data.status,
          parsed.data.completionNote,
          task.completionNote
        ),
      },
      select: {
        id: true,
        status: true,
        completedAt: true,
        completionNote: true,
      },
    });

    // Phases.md Phase 6 — moving a task open/closed changes what it costs.
    await safeRecalcEmployeeWorkload(actor.companyId, task.assigneeId);
    // Phases.md Phase 8 — reaching (or leaving) Done moves completion/on-time rate.
    await safeRecalcEmployeePerformance(actor.companyId, task.assigneeId);

    return NextResponse.json({ task: updated });
  } catch (cause) {
    return serverError(
      {
        route: "PATCH /api/tasks/[id]/status",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

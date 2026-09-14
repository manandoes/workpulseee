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
import { findTask } from "@/lib/task-data";
import { applyTimerAction } from "@/lib/task-timer-data";
import { canTrackTaskTime } from "@/lib/permissions";
import { taskTimerSchema } from "@/lib/validations/tasks";
import { safeRecalcEmployeeWorkload } from "@/lib/workload-data";
import { safeRecalcEmployeePerformance } from "@/lib/performance-data";

/**
 * POST /api/tasks/[id]/timer — start, break, stop or finish this task's timer
 * (Phase 12 — task time tracking).
 *
 * Its own route beside `/status` for the same reason that one exists: it is
 * what a button on a card does, one small request that changes one thing.
 *
 * Employee logins only, and only the assignee (`canTrackTaskTime`) — a time
 * entry is a claim about who did the work, so nobody can file one in someone
 * else's name, the same rule `/api/attendance/clock-in` applies to a working
 * day. A manager who needs to move the task still has `/status`.
 */
export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/tasks/[id]/timer">
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

  const parsed = taskTimerSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const task = await findTask(actor, id);
    if (!task) return apiError("Task not found.", 404, "not_found");

    if (!canTrackTaskTime(actor, task)) {
      return forbidden("You can only track time on tasks assigned to you.");
    }

    const resolved = await applyTimerAction(actor, task, parsed.data.action);
    if (!resolved.ok) return writeFailure(resolved);

    // Only a status change moves these figures, and only `start` and `done`
    // ever change one — a break leaves the task exactly where it was.
    if (resolved.status) {
      await safeRecalcEmployeeWorkload(actor.companyId, task.assigneeId);
      await safeRecalcEmployeePerformance(actor.companyId, task.assigneeId);
    }

    return NextResponse.json({ action: parsed.data.action });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/tasks/[id]/timer",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

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
import {
  decideGoal,
  findGoal,
  goalBelongsTo,
  loadAccountSubject,
  loadEmployeeSubject,
  safeRecalcPersonPerformance,
  type PerformanceSubject,
} from "@/lib/performance-data";
import { canEditEmployee, isCompanyAdmin } from "@/lib/permissions";
import { goalDecisionSchema } from "@/lib/validations/performance";

/**
 * PATCH /api/performance/[memberKind]/[memberId]/goals/[goalId] — mark a
 * goal Achieved or Missed (Phases.md Phase 8, widened to company accounts —
 * Plan: performance for all company accounts).
 *
 * One-time, the same shape `PATCH /api/requests/[id]/decision` uses: a goal
 * that has already been decided is refused with 409 rather than re-decided —
 * a changed mind is a fresh goal, not a reopened one.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/performance/[memberKind]/[memberId]/goals/[goalId]">
) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (actor.accountType !== "company") return forbidden();

  const { memberKind, memberId, goalId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = goalDecisionSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    let subject: PerformanceSubject;

    if (memberKind === "account") {
      const account = await loadAccountSubject(actor, memberId);
      if (!account) return apiError("Account not found.", 404, "not_found");
      if (!isCompanyAdmin(actor)) {
        return forbidden(
          "Only owners and admins can decide goals for a company account."
        );
      }
      subject = { kind: "account", id: memberId };
    } else if (memberKind === "employee") {
      const employee = await loadEmployeeSubject(actor, memberId);
      if (!employee) return apiError("Employee not found.", 404, "not_found");
      if (!canEditEmployee(actor, employee)) {
        return forbidden(
          "You can only decide goals for your own direct reports."
        );
      }
      subject = { kind: "employee", id: memberId };
    } else {
      return apiError("Unknown member kind.", 404, "not_found");
    }

    const goal = await findGoal(actor.companyId, goalId);
    if (!goal || !goalBelongsTo(goal, subject)) {
      return apiError("Goal not found.", 404, "not_found");
    }
    if (goal.status !== "Active") {
      return apiError(
        "This goal has already been decided.",
        409,
        "already_decided"
      );
    }

    const updated = await decideGoal(goalId, parsed.data.status);

    // Best-effort: a failed recompute must never fail the decision itself.
    await safeRecalcPersonPerformance(actor.companyId, subject);

    return NextResponse.json({ goal: updated });
  } catch (cause) {
    return serverError(
      {
        route: "PATCH /api/performance/[memberKind]/[memberId]/goals/[goalId]",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

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
  createGoal,
  loadAccountSubject,
  loadEmployeeSubject,
  loadGoals,
  safeRecalcPersonPerformance,
  type PerformanceSubject,
} from "@/lib/performance-data";
import {
  canManageAccountPerformance,
  canManagePerformance,
  canViewAccountPerformance,
  canViewPerformance,
} from "@/lib/permissions";
import { createGoalSchema } from "@/lib/validations/performance";

/**
 * GET/POST /api/performance/[memberKind]/[memberId]/goals — a subject's
 * goals (Phases.md Phase 8's "goal creation/tracking per employee"), widened
 * to company accounts too (Plan: performance for all company accounts).
 *
 * Goals are manager-owned for an employee (`canManagePerformance`: the
 * `ManagePerformance` power or their own reporting manager). A company
 * account has no manager relationship to check, so setting one for an
 * account takes the power itself (`canManageAccountPerformance`), and
 * reading follows `canViewAccountPerformance`.
 */
export async function GET(
  request: Request,
  context: RouteContext<"/api/performance/[memberKind]/[memberId]/goals">
) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { memberKind, memberId } = await context.params;

  try {
    if (memberKind === "account") {
      const account = await loadAccountSubject(actor, memberId);
      if (!account) return apiError("Account not found.", 404, "not_found");
      if (!canViewAccountPerformance(actor, { id: memberId })) {
        return forbidden();
      }

      const goals = await loadGoals(actor.companyId, {
        kind: "account",
        id: memberId,
      });
      return NextResponse.json({ goals });
    }

    if (memberKind !== "employee") {
      return apiError("Unknown member kind.", 404, "not_found");
    }

    const employee = await loadEmployeeSubject(actor, memberId);
    if (!employee) return apiError("Employee not found.", 404, "not_found");
    if (!canViewPerformance(actor, employee)) return forbidden();

    const goals = await loadGoals(actor.companyId, {
      kind: "employee",
      id: memberId,
    });
    return NextResponse.json({ goals });
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/performance/[memberKind]/[memberId]/goals",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/performance/[memberKind]/[memberId]/goals">
) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (actor.accountType !== "company") return forbidden();

  const { memberKind, memberId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = createGoalSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    let subject: PerformanceSubject;

    if (memberKind === "account") {
      const account = await loadAccountSubject(actor, memberId);
      if (!account) return apiError("Account not found.", 404, "not_found");
      if (!canManageAccountPerformance(actor)) {
        return forbidden("You don't have access to set goals for this login.");
      }
      subject = { kind: "account", id: memberId };
    } else if (memberKind === "employee") {
      const employee = await loadEmployeeSubject(actor, memberId);
      if (!employee) return apiError("Employee not found.", 404, "not_found");
      if (!canManagePerformance(actor, employee)) {
        return forbidden(
          "You can only set goals for your own direct reports."
        );
      }
      subject = { kind: "employee", id: memberId };
    } else {
      return apiError("Unknown member kind.", 404, "not_found");
    }

    const goal = await createGoal(
      actor.companyId,
      subject,
      actor.id,
      parsed.data
    );

    // Best-effort: a failed recompute must never fail the goal being saved.
    await safeRecalcPersonPerformance(actor.companyId, subject);

    return NextResponse.json({ goal }, { status: 201 });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/performance/[memberKind]/[memberId]/goals",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

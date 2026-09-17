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
  canEditEmployee,
  canViewPerformance,
  isCompanyAdmin,
} from "@/lib/permissions";
import { createGoalSchema } from "@/lib/validations/performance";

/**
 * GET/POST /api/performance/[memberKind]/[memberId]/goals — a subject's
 * goals (Phases.md Phase 8's "goal creation/tracking per employee"), widened
 * to company accounts too (Plan: performance for all company accounts).
 *
 * Goals are manager-owned for an employee (`canEditEmployee`'s existing
 * scope). A company account has no manager relationship to check, so setting
 * one for an account is Owner/Admin-only — the same `isCompanyAdmin` gate
 * Squad's account branch already uses for that subject's other admin-only
 * panels — while reading follows the same Owner/Admin-or-self split as
 * that account's Attendance panel.
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
      const isSelf = actor.accountType === "company" && actor.id === memberId;
      if (!isCompanyAdmin(actor) && !isSelf) return forbidden();

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
      if (!isCompanyAdmin(actor)) {
        return forbidden(
          "Only owners and admins can set goals for a company account."
        );
      }
      subject = { kind: "account", id: memberId };
    } else if (memberKind === "employee") {
      const employee = await loadEmployeeSubject(actor, memberId);
      if (!employee) return apiError("Employee not found.", 404, "not_found");
      if (!canEditEmployee(actor, employee)) {
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

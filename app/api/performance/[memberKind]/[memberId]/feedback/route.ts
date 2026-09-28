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
  createFeedback,
  loadAccountSubject,
  loadEmployeeSubject,
  loadFeedback,
  safeRecalcPersonPerformance,
  type PerformanceSubject,
} from "@/lib/performance-data";
import {
  canManageAccountPerformance,
  canManagePerformance,
  canViewAccountPerformance,
  canViewPerformance,
} from "@/lib/permissions";
import { createFeedbackSchema } from "@/lib/validations/performance";

/**
 * GET/POST /api/performance/[memberKind]/[memberId]/feedback — the manager
 * feedback log (Phases.md Phase 8), widened to company accounts too (Plan:
 * performance for all company accounts).
 *
 * Visible to the subject immediately on submission (confirmed with the
 * user) — there is no draft/private state, so the GET side uses the same
 * view gate as everything else on this page. Giving feedback follows the
 * same split as goals: `canManagePerformance` for an employee,
 * `canManageAccountPerformance` for a company login.
 */
export async function GET(
  request: Request,
  context: RouteContext<"/api/performance/[memberKind]/[memberId]/feedback">
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

      const feedback = await loadFeedback(actor.companyId, {
        kind: "account",
        id: memberId,
      });
      return NextResponse.json({ feedback });
    }

    if (memberKind !== "employee") {
      return apiError("Unknown member kind.", 404, "not_found");
    }

    const employee = await loadEmployeeSubject(actor, memberId);
    if (!employee) return apiError("Employee not found.", 404, "not_found");
    if (!canViewPerformance(actor, employee)) return forbidden();

    const feedback = await loadFeedback(actor.companyId, {
      kind: "employee",
      id: memberId,
    });
    return NextResponse.json({ feedback });
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/performance/[memberKind]/[memberId]/feedback",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/performance/[memberKind]/[memberId]/feedback">
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

  const parsed = createFeedbackSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    let subject: PerformanceSubject;

    if (memberKind === "account") {
      const account = await loadAccountSubject(actor, memberId);
      if (!account) return apiError("Account not found.", 404, "not_found");
      if (!canManageAccountPerformance(actor)) {
        return forbidden(
          "You don't have access to give feedback to this login."
        );
      }
      subject = { kind: "account", id: memberId };
    } else if (memberKind === "employee") {
      const employee = await loadEmployeeSubject(actor, memberId);
      if (!employee) return apiError("Employee not found.", 404, "not_found");
      if (!canManagePerformance(actor, employee)) {
        return forbidden(
          "You can only give feedback to your own direct reports."
        );
      }
      subject = { kind: "employee", id: memberId };
    } else {
      return apiError("Unknown member kind.", 404, "not_found");
    }

    const feedback = await createFeedback(
      actor.companyId,
      subject,
      actor.id,
      parsed.data
    );

    // Best-effort: a failed recompute must never fail the feedback being saved.
    await safeRecalcPersonPerformance(actor.companyId, subject);

    return NextResponse.json({ feedback }, { status: 201 });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/performance/[memberKind]/[memberId]/feedback",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

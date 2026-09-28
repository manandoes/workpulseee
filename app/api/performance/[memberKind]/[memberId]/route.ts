import { NextResponse } from "next/server";
import { apiError, forbidden, serverError, unauthorized } from "@/lib/api";
import { getActor } from "@/lib/auth";
import {
  loadAccountSubject,
  loadEmployeeSubject,
  loadPerformanceHistory,
} from "@/lib/performance-data";
import {
  canViewAccountPerformance,
  canViewPerformance,
} from "@/lib/permissions";

/**
 * GET /api/performance/[memberKind]/[memberId] — one subject's score history
 * (Phases.md Phase 8's "performance history timeline"), widened to company
 * accounts too (Plan: performance for all company accounts) — mirrors
 * `/squad/[memberKind]/[memberId]`'s URL shape.
 *
 * Loaded through the tenant filter first, so an id from another company
 * reads as "not found" rather than leaking that the record exists
 * (Rules.md section 2). An employee subject follows `canViewPerformance`; a
 * company-account subject `canViewAccountPerformance`.
 */
export async function GET(
  request: Request,
  context: RouteContext<"/api/performance/[memberKind]/[memberId]">
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

      const history = await loadPerformanceHistory(actor.companyId, {
        kind: "account",
        id: memberId,
      });
      return NextResponse.json({ history });
    }

    if (memberKind !== "employee") {
      return apiError("Unknown member kind.", 404, "not_found");
    }

    const employee = await loadEmployeeSubject(actor, memberId);
    if (!employee) return apiError("Employee not found.", 404, "not_found");
    if (!canViewPerformance(actor, employee)) return forbidden();

    const history = await loadPerformanceHistory(actor.companyId, {
      kind: "employee",
      id: memberId,
    });
    return NextResponse.json({ history });
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/performance/[memberKind]/[memberId]",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

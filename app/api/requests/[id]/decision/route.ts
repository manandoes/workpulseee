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
import { findRequest } from "@/lib/request-data";
import { notifyRequestDecided } from "@/lib/notification-data";
import { canApproveRequests, canDecideOnRequest } from "@/lib/permissions";
import { decisionSchema } from "@/lib/validations/requests";

/**
 * PATCH /api/requests/[id]/decision — approve or reject a request
 * (Phases.md Phase 7).
 *
 * Its own route, like the task status route, because this is one small
 * action distinct from ever editing a request's own fields (which nothing in
 * this phase supports — a request is submitted, then decided).
 *
 * A decision is one-time: refusing to re-decide an already-decided request
 * keeps `approverId`/`decidedAt` meaning "the one decision", not "the most
 * recent of possibly several".
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/requests/[id]/decision">
) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canApproveRequests(actor)) return forbidden();

  const { id } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = decisionSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const existing = await findRequest(actor, id);
    if (!existing) return apiError("Request not found.", 404, "not_found");

    if (!canDecideOnRequest(actor, existing)) {
      return forbidden("You can only decide on your own team's requests.");
    }

    if (existing.status !== "Pending") {
      return apiError(
        "This request has already been decided.",
        409,
        "already_decided"
      );
    }

    const decidedAt = new Date();

    const updated = await db.request.update({
      where: { id: existing.id },
      data: {
        status: parsed.data.status,
        // Two-nullable-FK: a company account fills `approverId`, an Employee
        // deciding via a `DecideRequests` grant fills `approverEmployeeId`.
        ...(actor.accountType === "company"
          ? { approverId: actor.id }
          : { approverEmployeeId: actor.id }),
        decisionNote: parsed.data.decisionNote || null,
        decidedAt,
      },
      select: {
        id: true,
        status: true,
        decisionNote: true,
        decidedAt: true,
        subject: true,
        employee: {
          select: {
            id: true,
            fullName: true,
            companyEmail: true,
            personalEmail: true,
          },
        },
      },
    });

    await notifyRequestDecided({
      id: updated.id,
      companyId: actor.companyId,
      subject: updated.subject,
      status: updated.status,
      decisionNote: updated.decisionNote,
      employee: updated.employee,
    });

    return NextResponse.json({
      request: {
        id: updated.id,
        status: updated.status,
        decisionNote: updated.decisionNote,
        decidedAt: updated.decidedAt,
      },
    });
  } catch (cause) {
    return serverError(
      {
        route: "PATCH /api/requests/[id]/decision",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

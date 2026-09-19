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
import { canManageRecruitment } from "@/lib/permissions";
import { updateApplicant } from "@/lib/recruitment-data";
import { updateApplicationSchema } from "@/lib/validations/recruitment";

/**
 * PATCH /api/hiring/applications/[applicationId] — move an applicant along the
 * pipeline and/or add an internal note.
 *
 * One route for both because they are one user action: a reviewer rejecting a
 * candidate types the reason in the same breath, and two requests would let
 * the stage change land without the note explaining it.
 */
export async function PATCH(
  request: Request,
  context: RouteContext<"/api/hiring/applications/[applicationId]">
) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManageRecruitment(actor)) {
    return forbidden("Only owners, admins and anyone granted hiring can do that.");
  }

  const { applicationId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = updateApplicationSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  if (!parsed.data.stage && !parsed.data.note) {
    return apiError("Nothing to change.", 400, "empty_update");
  }

  try {
    const result = await updateApplicant(actor, applicationId, parsed.data);
    if (!result.ok) return writeFailure(result);

    return NextResponse.json({ ok: true });
  } catch (cause) {
    return serverError(
      {
        route: "PATCH /api/hiring/applications/[applicationId]",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

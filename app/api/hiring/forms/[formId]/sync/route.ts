import { NextResponse } from "next/server";
import { forbidden, serverError, unauthorized, writeFailure } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { canManageRecruitment } from "@/lib/permissions";
import { syncGoogleResponses } from "@/lib/google-forms-data";

/**
 * POST /api/hiring/forms/[formId]/sync — pull Google Form responses in.
 *
 * Manual rather than scheduled: this repo's background work lives in
 * `app/api/jobs/*` behind a cron secret, and a per-form Google poll for every
 * company on every tick is a much bigger commitment than the feature needs.
 * The button is honest about when it last ran, which is what the user actually
 * wants to know.
 */
export async function POST(
  _request: Request,
  context: RouteContext<"/api/hiring/forms/[formId]/sync">
) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManageRecruitment(actor)) {
    return forbidden("Only owners, admins and anyone granted hiring can do that.");
  }

  const { formId } = await context.params;

  try {
    const result = await syncGoogleResponses(actor, formId);
    if (!result.ok) return writeFailure(result);

    return NextResponse.json({
      imported: result.imported,
      total: result.total,
    });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/hiring/forms/[formId]/sync",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

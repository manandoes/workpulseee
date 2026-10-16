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
import { canManageBranding } from "@/lib/permissions";
import { feedbackRecipientSettingsSchema } from "@/lib/validations/settings";

/**
 * PATCH /api/settings/feedback-recipients — update the email addresses that
 * receive user-submitted feedback (Plan: software feedback button).
 *
 * Owner-only (`canManageBranding`), same shape as
 * `app/api/settings/branding/route.ts`.
 */
export async function PATCH(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  if (!canManageBranding(actor)) {
    return forbidden("Only the owner can change feedback recipients.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = feedbackRecipientSettingsSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    await db.company.update({
      where: { id: actor.companyId },
      data: { feedbackRecipients: (parsed.data.feedbackRecipients?.trim() || null) },
    });

    return NextResponse.json({ ok: true });
  } catch (cause) {
    return serverError(
      {
        route: "PATCH /api/settings/feedback-recipients",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

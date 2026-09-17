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
import { brandColorSchema } from "@/lib/validations/settings";

/**
 * PATCH /api/settings/branding — change the dashboard's brand color
 * (Plan: brand color).
 *
 * Company-wide, unlike the theme toggle, so it is Owner-only
 * (`canManageBranding`) and persisted on `Company` rather than a cookie.
 */
export async function PATCH(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  if (!canManageBranding(actor)) {
    return forbidden("Only the owner can change the brand color.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = brandColorSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const brandColor = parsed.data.brandColor.toLowerCase();

    await db.company.update({
      where: { id: actor.companyId },
      data: { brandColor },
    });

    return NextResponse.json({ brandColor });
  } catch (cause) {
    return serverError(
      {
        route: "PATCH /api/settings/branding",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

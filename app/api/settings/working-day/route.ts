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
import { canManageCompanySettings } from "@/lib/permissions";
import { timeInputToMinutes } from "@/lib/timezone";
import { workingDaySettingsSchema } from "@/lib/validations/settings";

/**
 * PATCH /api/settings/working-day — change when the working day ends, and the
 * zone that is measured in.
 *
 * Owner/Admin only, the same gate as the alert thresholds
 * (`canManageCompanySettings`): this decides when everybody in the company is
 * nudged to clock out and when an unanswered session is closed for them,
 * which is company-wide policy rather than a team-level dial.
 *
 * No sweep is kicked off here. `sweepLogoutReminders` recomputes every
 * decision from stored timestamps on its next run, so a change to this setting
 * applies from then on — including to sessions that are already open.
 */
export async function PATCH(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  if (!canManageCompanySettings(actor)) {
    return forbidden("Only owners and admins can change the working day.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = workingDaySettingsSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  // Non-null by the schema's own refinement, which parsed the same string.
  const endOfDayMinutes = timeInputToMinutes(parsed.data.endOfDay)!;

  try {
    const updated = await db.company.update({
      where: { id: actor.companyId },
      data: { endOfDayMinutes, timeZone: parsed.data.timeZone },
      select: { endOfDayMinutes: true, timeZone: true },
    });

    return NextResponse.json(updated);
  } catch (cause) {
    return serverError(
      {
        route: "PATCH /api/settings/working-day",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

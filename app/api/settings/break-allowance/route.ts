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
import { canManageBreakAllowance } from "@/lib/permissions";
import { breakAllowanceSettingsSchema } from "@/lib/validations/settings";

/**
 * PATCH /api/settings/break-allowance — change how many minutes of break each
 * person gets per working day, the figure the break overlay counts down from.
 *
 * Owner/Admin/HR (`canManageBreakAllowance`): break policy is HR's call.
 * Applies immediately, including to a break already in progress — the overlay
 * recomputes what is left on the next navigation.
 */
export async function PATCH(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  if (!canManageBreakAllowance(actor)) {
    return forbidden(
      "Only owners, admins and HR can change the break allowance."
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = breakAllowanceSettingsSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const updated = await db.company.update({
      where: { id: actor.companyId },
      data: { dailyBreakMinutes: Number(parsed.data.dailyBreakMinutes) },
      select: { dailyBreakMinutes: true },
    });

    return NextResponse.json(updated);
  } catch (cause) {
    return serverError(
      {
        route: "PATCH /api/settings/break-allowance",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

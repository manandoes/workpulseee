import type { NextRequest } from "next/server";
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
import { canManagePermissionGrants } from "@/lib/permissions";
import { changeLevel } from "@/lib/permission-grants-data";
import { changeLevelSchema } from "@/lib/validations/permission-grants";

/**
 * PATCH /api/company-accounts/[id] — move a company login to another level
 * (Admin, Manager, HR Head, HR Team) from the Authority page (Plan: access
 * levels).
 *
 * Owner only, deliberately narrower than inviting (`canManageCompanyAccounts`,
 * Owner or Admin): a level is a bundle of powers, and handing out powers is
 * the Owner's alone. The Owner's own login can never be moved, and nobody can
 * be moved *to* Owner (`changeLevelSchema`). The person's overrides are
 * cleared in the same transaction — they adjusted the old level.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/company-accounts/[id]">
) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManagePermissionGrants(actor)) {
    return forbidden("Only the owner can change someone's level.");
  }

  const { id } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = changeLevelSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const resolved = await changeLevel(actor, id, parsed.data.role);
    if (!resolved.ok) return writeFailure(resolved);

    return NextResponse.json({ ok: true });
  } catch (cause) {
    return serverError(
      {
        route: "PATCH /api/company-accounts/[id]",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

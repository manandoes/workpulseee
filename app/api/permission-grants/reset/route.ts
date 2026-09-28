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
import { resetPowers } from "@/lib/permission-grants-data";
import { resetPowersSchema } from "@/lib/validations/permission-grants";

/**
 * POST /api/permission-grants/reset — drop every override for one person, so
 * they follow their level's defaults again (Plan: access levels). Owner only.
 */
export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManagePermissionGrants(actor)) return forbidden();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = resetPowersSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const resolved = await resetPowers(actor, parsed.data.subject);
    if (!resolved.ok) return writeFailure(resolved);

    return NextResponse.json({ ok: true });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/permission-grants/reset",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

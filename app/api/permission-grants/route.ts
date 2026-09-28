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
import { loadAuthorityPeople, setPower } from "@/lib/permission-grants-data";
import { setPowerSchema } from "@/lib/validations/permission-grants";

/**
 * GET /api/permission-grants — everyone in the company with their level and
 * the Owner's overrides, for the Authority page (Plan: access levels). Owner
 * only.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManagePermissionGrants(actor)) return forbidden();

  try {
    const people = await loadAuthorityPeople(actor);
    return NextResponse.json({ people });
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/permission-grants",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

/**
 * POST /api/permission-grants — switch one power on or off for one person
 * (Owner only). Applies on that person's next request: `getActor()` reads
 * overrides fresh every time.
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

  const parsed = setPowerSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const resolved = await setPower(
      actor,
      parsed.data.subject,
      parsed.data.permission,
      parsed.data.enabled
    );
    if (!resolved.ok) return writeFailure(resolved);

    return NextResponse.json({ ok: true });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/permission-grants",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

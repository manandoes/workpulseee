import { NextResponse } from "next/server";
import {
  apiError,
  forbidden,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api";
import { getActor } from "@/lib/auth";
import { canManagePermissionGrants } from "@/lib/permissions";
import { loadGrantsForCompany, setGrant } from "@/lib/permission-grants-data";
import { setGrantSchema } from "@/lib/validations/permission-grants";

/** GET /api/permission-grants — every employee's active grants (Owner only). */
export async function GET() {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManagePermissionGrants(actor)) return forbidden();

  try {
    const employees = await loadGrantsForCompany(actor);
    return NextResponse.json({ employees });
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

/** POST /api/permission-grants — grant or revoke one permission (Owner only). */
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

  const parsed = setGrantSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const resolved = await setGrant(
      actor,
      parsed.data.employeeId,
      parsed.data.permission,
      parsed.data.granted
    );
    if (!resolved.ok) {
      return apiError(resolved.message, resolved.status, "invalid_reference");
    }

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

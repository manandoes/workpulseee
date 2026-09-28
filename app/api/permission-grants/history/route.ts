import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  forbidden,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api";
import { getActor } from "@/lib/auth";
import { canManagePermissionGrants } from "@/lib/permissions";
import { loadPowerHistory } from "@/lib/permission-grants-data";
import { powerHistoryQuerySchema } from "@/lib/validations/permission-grants";

/**
 * GET /api/permission-grants/history?kind=employee|account&id=… — the latest
 * Authority changes to one person's access: who changed what, and when (Plan:
 * access levels). Owner only.
 */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManagePermissionGrants(actor)) return forbidden();

  const parsed = powerHistoryQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!parsed.success) return validationError(parsed.error);

  try {
    const history = await loadPowerHistory(actor, parsed.data);
    return NextResponse.json({ history });
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/permission-grants/history",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

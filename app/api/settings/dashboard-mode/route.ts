import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, forbidden, unauthorized, validationError } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { DASHBOARD_MODE_COOKIE } from "@/lib/permissions";
import { dashboardModeSchema } from "@/lib/validations/settings";

/**
 * POST /api/settings/dashboard-mode — switch the sidebar between its HRMS
 * and PMS slices (Plan: dashboard-mode toggle).
 *
 * A display preference, not tenant data, so unlike every other route in
 * `app/api/settings/` this never touches Prisma — it just sets a cookie the
 * dashboard layout and page read back on the next request. Company accounts
 * only: an Employee's nav is a fixed self-service set that ignores mode
 * entirely (`navigationFor` in `lib/permissions.ts`), so there is nothing for
 * them to switch.
 */
export async function POST(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  if (actor.accountType !== "company") {
    return forbidden("Only company accounts can switch dashboard mode.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = dashboardModeSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  const response = NextResponse.json({ mode: parsed.data.mode });
  response.cookies.set(DASHBOARD_MODE_COOKIE, parsed.data.mode, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, unauthorized, validationError } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { THEME_COOKIE } from "@/lib/permissions";
import { themeSettingsSchema } from "@/lib/validations/settings";

/**
 * POST /api/settings/theme — switch the dashboard between its light and dark
 * palette (Plan: theme toggle).
 *
 * A personal display preference, not tenant data — like
 * `app/api/settings/dashboard-mode/route.ts`, this never touches Prisma, it
 * just sets a cookie the dashboard layout reads back on the next request.
 * Unlike dashboard mode, every actor (employee or company) can use it.
 */
export async function POST(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = themeSettingsSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  const response = NextResponse.json({ theme: parsed.data.theme });
  response.cookies.set(THEME_COOKIE, parsed.data.theme, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

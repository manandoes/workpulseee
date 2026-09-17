import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { saveConnection } from "@/lib/calendar-data";
import { exchangeCode, fetchUserEmail } from "@/lib/google-calendar";
import { verifyOAuthState } from "@/lib/google-calendar-crypto";

/**
 * GET /api/calendar/google/callback — Google redirects here after consent.
 *
 * A broken round-trip (bad `state`, a denied consent, a failed exchange) must
 * not throw a 500 — it redirects back to `/calendar?error=...` instead, the
 * same "degrade gracefully" rule the whole integration follows.
 */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const errorRedirect = (reason: string) =>
    NextResponse.redirect(
      new URL(`/calendar?error=${reason}`, request.nextUrl.origin)
    );

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state) return errorRedirect("missing_params");

  const payload = verifyOAuthState(state, {
    actorId: actor.id,
    companyId: actor.companyId,
  });
  if (!payload) return errorRedirect("invalid_state");

  const tokens = await exchangeCode(code);
  if (!tokens) return errorRedirect("exchange_failed");

  const email = await fetchUserEmail(tokens.accessToken);
  if (!email) return errorRedirect("no_email");

  await saveConnection(actor, {
    googleEmail: email,
    refreshToken: tokens.refreshToken,
    scope: "openid email calendar.events",
  });

  return NextResponse.redirect(
    new URL("/calendar?connected=1", request.nextUrl.origin)
  );
}

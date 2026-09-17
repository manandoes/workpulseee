import { NextResponse } from "next/server";
import { apiError, unauthorized } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { buildAuthUrl } from "@/lib/google-calendar";
import {
  googleCalendarConfigured,
  signOAuthState,
} from "@/lib/google-calendar-crypto";

/**
 * GET /api/calendar/google/connect — start the OAuth handshake.
 *
 * A missing Google Cloud client is not a server error, it is an unfinished
 * setup step (Plan.md — "the whole feature degrades to a disabled ... button
 * ... when the env vars are absent"), so this returns a typed 503 rather than
 * throwing, and the UI checks the same `googleCalendarConfigured()` before
 * ever showing the connect button as enabled.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return unauthorized();

  if (!googleCalendarConfigured()) {
    return apiError(
      "Google Calendar is not configured for this app yet.",
      503,
      "not_configured"
    );
  }

  const state = signOAuthState({
    actorId: actor.id,
    companyId: actor.companyId,
    accountType: actor.accountType,
  });

  const url = buildAuthUrl(state);
  if (!url) {
    return apiError(
      "Google Calendar is not configured for this app yet.",
      503,
      "not_configured"
    );
  }

  return NextResponse.redirect(url);
}

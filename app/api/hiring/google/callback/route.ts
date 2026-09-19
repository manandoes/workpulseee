import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { forbidden, unauthorized } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { canManageRecruitment } from "@/lib/permissions";
import {
  FORMS_SCOPE,
  exchangeFormsCode,
  fetchFormsUserEmail,
} from "@/lib/google-forms";
import { saveFormsConnection } from "@/lib/google-forms-data";
import { verifyOAuthState } from "@/lib/google-calendar-crypto";

/**
 * GET /api/hiring/google/callback — Google redirects here after consent.
 *
 * A broken round-trip (bad `state`, a denied consent, a failed exchange) must
 * not throw a 500 — it redirects back to `/hiring?error=...` instead, the same
 * "degrade gracefully" rule the calendar integration follows.
 */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManageRecruitment(actor)) {
    return forbidden("Only owners, admins and anyone granted hiring can do that.");
  }

  const errorRedirect = (reason: string) =>
    NextResponse.redirect(
      new URL(`/hiring?error=${reason}`, request.nextUrl.origin)
    );

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state) return errorRedirect("missing_params");

  const payload = verifyOAuthState(state, {
    actorId: actor.id,
    companyId: actor.companyId,
  });
  if (!payload) return errorRedirect("invalid_state");

  const tokens = await exchangeFormsCode(code);
  if (!tokens) return errorRedirect("exchange_failed");

  const email = await fetchFormsUserEmail(tokens.accessToken);
  if (!email) return errorRedirect("no_email");

  await saveFormsConnection({
    companyId: actor.companyId,
    connectedById: actor.accountType === "company" ? actor.id : null,
    googleEmail: email,
    refreshToken: tokens.refreshToken,
    scope: FORMS_SCOPE,
  });

  return NextResponse.redirect(
    new URL("/hiring?connected=1", request.nextUrl.origin)
  );
}

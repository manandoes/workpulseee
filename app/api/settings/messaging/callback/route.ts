import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { unauthorized, forbidden } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { canManageMessagingSettings } from "@/lib/permissions";
import { db } from "@/lib/db";
import { verifyOAuthState } from "@/lib/google-calendar-crypto";
import {
  exchangeGoogleCode,
  fetchGoogleUserEmail,
} from "@/lib/google-oauth";
import { encryptRefreshToken } from "@/lib/company-google-chat-config";

/**
 * GET /api/settings/messaging/callback — Google redirects here after consent.
 *
 * Mirrors `app/api/calendar/google/callback/route.ts` exactly: a broken
 * round-trip redirects back to `/settings?error=...` rather than throwing
 * a 500, so the settings page never breaks when Google's OAuth flow fails.
 */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManageMessagingSettings(actor)) {
    return forbidden("Only the owner can configure messaging.");
  }

  const errorRedirect = (reason: string) =>
    NextResponse.redirect(
      new URL(`/settings?error=messaging-${reason}`, request.nextUrl.origin)
    );

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state) return errorRedirect("missing_params");

  const payload = verifyOAuthState(state, {
    actorId: actor.id,
    companyId: actor.companyId,
  });
  if (!payload) return errorRedirect("invalid_state");

  const tokens = await exchangeGoogleCode(
    code,
    `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/settings/messaging/callback`
  );
  if (!tokens) return errorRedirect("exchange_failed");

  const email = await fetchGoogleUserEmail(tokens.accessToken);
  if (!email) return errorRedirect("no_email");

  await db.company.update({
    where: { id: actor.companyId },
    data: {
      googleChatRefreshTokenEncrypted: encryptRefreshToken(tokens.refreshToken),
      googleChatConnectedAt: new Date(),
      googleChatConnectedByEmail: email,
      googleChatEnabled: true,
    },
  });

  return NextResponse.redirect(
    new URL("/settings?google-chat=connected", request.nextUrl.origin)
  );
}

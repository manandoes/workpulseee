import { NextResponse } from "next/server";
import { apiError, forbidden, unauthorized } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { canManageRecruitment } from "@/lib/permissions";
import { buildFormsAuthUrl, googleFormsConfigured } from "@/lib/google-forms";
import { signOAuthState } from "@/lib/google-calendar-crypto";

/**
 * GET /api/hiring/google/connect — start the Forms OAuth handshake.
 *
 * The connection is company-wide (see `GoogleFormsConnection`), so unlike the
 * calendar's personal connect this is gated on `canManageRecruitment` rather
 * than merely being signed in — one person is linking an account the whole
 * company's hiring will run through.
 *
 * A missing Google Cloud client is an unfinished setup step, not a server
 * error, so it returns a typed 503 and the UI keeps the button disabled.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManageRecruitment(actor)) {
    return forbidden("Only owners, admins and anyone granted hiring can do that.");
  }

  if (!googleFormsConfigured()) {
    return apiError(
      "Google Forms is not configured for this app yet.",
      503,
      "not_configured"
    );
  }

  const state = signOAuthState({
    actorId: actor.id,
    companyId: actor.companyId,
    accountType: actor.accountType,
  });

  const url = buildFormsAuthUrl(state);
  if (!url) {
    return apiError(
      "Google Forms is not configured for this app yet.",
      503,
      "not_configured"
    );
  }

  return NextResponse.redirect(url);
}

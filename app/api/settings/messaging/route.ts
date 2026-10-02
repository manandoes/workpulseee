import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  apiError,
  forbidden,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageMessagingSettings } from "@/lib/permissions";
import { messagingSettingsSchema } from "@/lib/validations/settings";
import { buildGoogleAuthUrl } from "@/lib/google-oauth";
import { signOAuthState } from "@/lib/google-calendar-crypto";

/**
 * GET  /api/settings/messaging       — read current provider state.
 * POST /api/settings/messaging/connect — return the Google OAuth consent URL.
 * PATCH /api/settings/messaging       — persist new provider flags.
 */

export async function GET() {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManageMessagingSettings(actor)) {
    return forbidden("Only the owner can change messaging settings.");
  }

  try {
    const company = await db.company.findUniqueOrThrow({
      where: { id: actor.companyId },
      select: {
        messagingProvider: true,
        googleChatEnabled: true,
        googleChatConnectedByEmail: true,
        googleChatConnectedAt: true,
      },
    });
    return NextResponse.json(company);
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/settings/messaging",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

export async function POST() {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManageMessagingSettings(actor)) {
    return forbidden("Only the owner can change messaging settings.");
  }

  const redirectUri = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/settings/messaging/callback`;
  const statePayload = signOAuthState({
    actorId: actor.id,
    companyId: actor.companyId,
    accountType: actor.accountType,
  });

  const authUrl = buildGoogleAuthUrl({
    scope: [
      "https://www.googleapis.com/auth/chat.spaces",
      "https://www.googleapis.com/auth/chat.messages",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "),
    redirectUri,
    state: statePayload,
  });

  if (!authUrl) {
    return serverError(
      {
        route: "POST /api/settings/messaging/connect",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      new Error("Google OAuth is not configured (missing env vars)")
    );
  }

  return NextResponse.json({ authUrl });
}

export async function PATCH(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManageMessagingSettings(actor)) {
    return forbidden("Only the owner can change messaging settings.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = messagingSettingsSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const company = await db.company.update({
      where: { id: actor.companyId },
      data: {
        messagingProvider: parsed.data.messagingProvider,
        googleChatEnabled: parsed.data.googleChatEnabled,
      },
      select: {
        messagingProvider: true,
        googleChatEnabled: true,
      },
    });

    return NextResponse.json(company);
  } catch (cause) {
    return serverError(
      {
        route: "PATCH /api/settings/messaging",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

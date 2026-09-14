import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  apiError,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api";
import { getActor } from "@/lib/auth";
import {
  loadChannelSettings,
  saveChannelSettings,
} from "@/lib/notification-data";
import { channelSettingsSchema } from "@/lib/validations/notifications";

/**
 * The signed-in person's own notification channels (Phase 13).
 *
 * No permission check beyond being signed in, and no id in the path: these are
 * your own settings and there is no route here that can read or write anyone
 * else's. Both handlers work for an Employee and a CompanyAccount — the actor
 * decides which column the row hangs off, inside `lib/notification-data.ts`.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return unauthorized();

  try {
    const settings = await loadChannelSettings(actor);
    return NextResponse.json({ settings });
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/notifications/preferences",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

export async function PATCH(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = channelSettingsSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    await saveChannelSettings(actor, parsed.data);
    const settings = await loadChannelSettings(actor);
    return NextResponse.json({ settings });
  } catch (cause) {
    return serverError(
      {
        route: "PATCH /api/notifications/preferences",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

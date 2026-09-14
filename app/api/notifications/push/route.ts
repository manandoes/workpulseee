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
  deletePushSubscription,
  savePushSubscription,
} from "@/lib/notification-data";
import {
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
} from "@/lib/validations/notifications";

/**
 * Web Push subscriptions for the signed-in person (Phase 13).
 *
 * POST records the browser the request came from; DELETE forgets it. Both are
 * scoped to the caller, so one person can never register or remove a browser
 * on somebody else's behalf.
 *
 * The browser is the source of truth for whether it is subscribed — it can
 * revoke permission without telling the server — so POST is an upsert keyed on
 * the endpoint and DELETE is idempotent. Neither reports "already done" as a
 * failure.
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

  const parsed = pushSubscriptionSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    await savePushSubscription(actor, {
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    });

    return NextResponse.json({ subscribed: true }, { status: 201 });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/notifications/push",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

export async function DELETE(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = pushUnsubscribeSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    await deletePushSubscription(actor, parsed.data.endpoint);
    return NextResponse.json({ subscribed: false });
  } catch (cause) {
    return serverError(
      {
        route: "DELETE /api/notifications/push",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

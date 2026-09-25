import { NextResponse } from "next/server";
import { apiError, serverError, unauthorized } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { sendWhatsAppTest } from "@/lib/notification-data";

/**
 * POST /api/notifications/whatsapp — send yourself a WhatsApp message on the
 * number on your profile, through the Meta WhatsApp Business Cloud API.
 *
 * Notifications already go out over WhatsApp on their own: `deliver` in
 * `lib/notification-data.ts` fans every notification to whichever channels the
 * recipient has on, and `lib/whatsapp.ts` is the Meta transport it uses. So
 * this route is not another way to send notifications — it is the
 * acknowledgement that channel was missing. Push gets one for free (the
 * browser confirms the subscription); a hand-typed phone number does not, and
 * a wrong-but-valid number otherwise fails silently forever.
 *
 * It takes no request body on purpose. The recipient is the caller's own
 * stored number, read server-side. Accepting a `to` would make an ordinary
 * signed-in session able to send WhatsApp messages to any number on earth,
 * billed per conversation to the company's Meta account.
 */

/**
 * One test per minute per person.
 *
 * Every send opens a billable conversation with Meta, and the button sits next
 * to a form people submit repeatedly. The cooldown is the difference between a
 * misread button and a bill.
 *
 * In-process, so each server instance keeps its own: a deployment running
 * several can let a few extra through. That is accepted rather than solved
 * with a table — the ceiling this protects is cost, not access, the caller can
 * only ever reach their own phone, and a shared store for it would be the
 * first piece of infrastructure this app needs solely for a test button.
 */
const COOLDOWN_MS = 60_000;
const lastSentAt = new Map<string, number>();

/**
 * Drop entries that are past their cooldown, so a long-lived process does not
 * accumulate one per person who ever pressed the button. Swept on each call
 * rather than on a timer: the map only ever holds the people who tested within
 * the last minute, so this stays trivially small.
 */
function sweep(now: number): void {
  for (const [key, at] of lastSentAt) {
    if (now - at >= COOLDOWN_MS) lastSentAt.delete(key);
  }
}

/** What the person is told for each way the send can fail. */
const FAILURE_MESSAGES = {
  no_phone:
    "Add a mobile number with its country code, save, then send the test.",
  channel_off: "Turn WhatsApp on and save before sending a test message.",
  not_configured:
    "WhatsApp is not set up on this server yet. Ask an administrator to finish the Meta configuration.",
  failed: "Could not send the message. Check the number and try again.",
} as const;

/** The HTTP status each failure deserves. */
const FAILURE_STATUSES = {
  no_phone: 400,
  channel_off: 400,
  // The caller did nothing wrong: the server is missing its credentials.
  not_configured: 503,
  failed: 502,
} as const;

export async function POST() {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const now = Date.now();
  sweep(now);

  const previous = lastSentAt.get(actor.id);
  if (previous !== undefined && now - previous < COOLDOWN_MS) {
    return apiError(
      "A test message was just sent. Wait a minute before sending another.",
      429,
      "rate_limited"
    );
  }

  /**
   * Recorded before the send, not after: a provider call that hangs or throws
   * must still hold the cooldown, or a failing number becomes a retry loop
   * against a paid API.
   */
  lastSentAt.set(actor.id, now);

  try {
    const result = await sendWhatsAppTest(actor);

    if (!result.ok) {
      /**
       * Nothing was spent on a request we refused before reaching Meta, so the
       * cooldown is released — otherwise somebody who forgot to save their
       * number waits a minute to be told so a second time.
       */
      if (result.reason === "no_phone" || result.reason === "channel_off") {
        lastSentAt.delete(actor.id);
      }

      return apiError(
        FAILURE_MESSAGES[result.reason],
        FAILURE_STATUSES[result.reason],
        result.reason
      );
    }

    return NextResponse.json({ sent: true, phone: result.phone });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/notifications/whatsapp",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

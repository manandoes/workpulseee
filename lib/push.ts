import webpush, { WebPushError } from "web-push";
import { db } from "@/lib/db";

/**
 * Web Push delivery (Architecture.md section 7's delivery half).
 *
 * Follows `lib/mailer.ts`'s contract: not configured means log and report that
 * nothing was sent, never throw. The difference is that one notification fans
 * out to every browser the person has subscribed — work laptop, home laptop,
 * phone — so this reports how many of them it reached.
 *
 * ## Why `web-push` rather than a hand-rolled fetch
 *
 * Unlike Resend and Meta, a push service takes no API key. Authenticity comes
 * from a VAPID ES256 JWT signed per request, and the payload must be encrypted
 * to the browser's own key with ECDH P-256 + HKDF-SHA256 + AES128GCM (RFC 8291)
 * so the relaying push service cannot read it. That is exactly what this
 * library does, and it is the wrong kind of code to reimplement by hand.
 *
 * ## Generating the keys
 *
 *     npx web-push generate-vapid-keys
 *
 * The public key goes in `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (the browser needs it
 * to subscribe), the private key in `VAPID_PRIVATE_KEY`. They are a pair: change
 * one and every existing subscription is dead.
 */
export type PushResult = {
  /** Browsers the payload actually reached. */
  sent: number;
  /** Subscriptions the push service reported gone, and which were deleted. */
  pruned: number;
};

/**
 * A button on a push notification, answered in the service worker without
 * opening the app. `action` is the identifier `public/sw.js` switches on;
 * `endpoint` is the app route it POSTs to, which keeps the decision about
 * what a button *does* here on the server rather than hard-coded into a
 * cached service worker that updates on its own schedule.
 */
export type PushAction = {
  action: string;
  title: string;
  endpoint: string;
};

/** What a push notification renders as. Read by `public/sw.js`. */
export type PushPayload = {
  title: string;
  body: string;
  /** Where clicking the notification should go, e.g. `/tasks`. */
  link: string | null;
  /** Ties the click back to the bell so it can be marked read. */
  notificationId: string;
  /**
   * Buttons on the notification itself. Only the logout reminder sets these:
   * everything else is a sentence you click through to. Browsers cap how many
   * they render (two, in practice) and silently drop the rest.
   */
  actions?: PushAction[];
};

/**
 * Configure the library from the environment, once.
 *
 * Returns false when the keys are absent, which is the normal state in local
 * development and must stay a no-op rather than an error.
 */
function configured(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:noreply@example.com";

  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

/**
 * Push one notification to every browser this person has subscribed.
 *
 * `subscriptions` are read by the caller, which already has the recipient in
 * hand — this function is only the delivery half.
 */
export async function sendPush(
  subscriptions: {
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }[],
  payload: PushPayload
): Promise<PushResult> {
  if (subscriptions.length === 0) return { sent: 0, pruned: 0 };

  if (!configured()) {
    console.info(
      `[push] Push delivery is not configured; not sending.\n  subscriptions: ${subscriptions.length}\n  title: ${payload.title}`
    );
    return { sent: 0, pruned: 0 };
  }

  const body = JSON.stringify(payload);
  const dead: string[] = [];
  let sent = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          body
        );
        sent += 1;
      } catch (cause) {
        /**
         * 404 and 410 are the push service saying this browser is gone for
         * good — the user cleared site data, or uninstalled. Keeping the row
         * would retry a dead address on every future notification forever, so
         * it is collected here and deleted below. Every other failure is
         * transient (the service is down, we are rate limited) and the row
         * stays.
         */
        if (
          cause instanceof WebPushError &&
          (cause.statusCode === 404 || cause.statusCode === 410)
        ) {
          dead.push(subscription.id);
        } else {
          console.error("[push] Could not deliver to a subscription", {
            statusCode:
              cause instanceof WebPushError ? cause.statusCode : undefined,
            cause,
          });
        }
      }
    })
  );

  if (dead.length > 0) {
    try {
      await db.pushSubscription.deleteMany({ where: { id: { in: dead } } });
    } catch (cause) {
      // Pruning is housekeeping; failing at it must not fail the send.
      console.error("[push] Could not prune dead subscriptions", { cause });
    }
  }

  return { sent, pruned: dead.length };
}

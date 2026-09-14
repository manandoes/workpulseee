/**
 * WhatsApp delivery through the Meta WhatsApp Business Cloud API.
 *
 * Mirrors `lib/mailer.ts` deliberately, down to the return type: a direct
 * `fetch` rather than an SDK, and when the credentials are not configured the
 * message is logged to the server console instead of being sent, so local
 * development works without silently pretending a message went out.
 *
 * ## Why every message is a template
 *
 * Meta only allows free-form WhatsApp text inside the 24-hour window opened by
 * the *user* messaging the business first. Every notification this app sends is
 * business-initiated and outside that window, so it must be a template that
 * Meta has approved in advance. There is no code path that can avoid this.
 *
 * ## The template this expects
 *
 * One approved UTILITY template covers every notification type, which keeps
 * approval to a single round-trip with Meta and keeps the cost model simple.
 * Create it in WhatsApp Manager with the name in `WHATSAPP_TEMPLATE_NAME`
 * (default `workpulse_notification`), category Utility, and a body of exactly
 * two variables:
 *
 *     Hi {{1}},
 *
 *     {{2}}
 *
 *     Open Talking Lens Media to see the details.
 *
 * `{{1}}` is the recipient's name and `{{2}}` is the same sentence the in-app
 * bell shows, so the wording lives in `lib/notifications.ts` and never has to
 * be re-approved when it changes.
 *
 * Each message sent opens a billable conversation with Meta.
 */
export type WhatsAppResult =
  | { delivered: true }
  | {
      delivered: false;
      reason: "not_configured" | "provider_error" | "invalid_recipient";
    };

type SendArgs = {
  /** E.164, already validated by `isDeliverablePhone`. */
  to: string;
  recipientName: string;
  message: string;
};

/**
 * Pinned rather than floating: Meta ships breaking changes between versions and
 * an unpinned URL would start failing on their schedule rather than ours.
 */
const GRAPH_API_VERSION = "v21.0";

export async function sendWhatsApp({
  to,
  recipientName,
  message,
}: SendArgs): Promise<WhatsAppResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const template =
    process.env.WHATSAPP_TEMPLATE_NAME ?? "workpulse_notification";
  const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? "en";

  if (!token || !phoneNumberId) {
    console.info(
      `[whatsapp] WhatsApp delivery is not configured; not sending.\n  to: ${to}\n  body:\n${message}`
    );
    return { delivered: false, reason: "not_configured" };
  }

  /**
   * Meta wants the number in E.164 without the leading `+`. Guarded rather
   * than assumed: a number that reached here malformed would otherwise bill a
   * conversation to nobody.
   */
  const recipient = to.startsWith("+") ? to.slice(1) : to;
  if (!/^[1-9]\d{7,14}$/.test(recipient)) {
    return { delivered: false, reason: "invalid_recipient" };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipient,
          type: "template",
          template: {
            name: template,
            language: { code: language },
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: recipientName },
                  { type: "text", text: message },
                ],
              },
            ],
          },
        }),
      }
    );

    if (!response.ok) {
      /**
       * Meta's error body carries the code and a human-readable reason, which
       * is what makes a failure diagnosable — a rejected template name and an
       * expired token are both a 400 otherwise. The recipient's number is
       * deliberately not logged (Rules.md section 4).
       */
      const detail = await readProviderError(response);
      console.error("[whatsapp] Provider rejected the message", {
        status: response.status,
        ...detail,
      });
      return { delivered: false, reason: "provider_error" };
    }

    return { delivered: true };
  } catch (cause) {
    console.error("[whatsapp] Could not reach the provider", { cause });
    return { delivered: false, reason: "provider_error" };
  }
}

/**
 * The diagnosable part of a Meta error response.
 *
 * Reading the body can itself fail on a truncated response, and a logging
 * helper must never be the thing that throws, so anything unparseable simply
 * yields no detail.
 */
async function readProviderError(
  response: Response
): Promise<{ code?: number; detail?: string }> {
  try {
    const body: unknown = await response.json();

    if (body && typeof body === "object" && "error" in body) {
      const error = (body as { error: unknown }).error;
      if (error && typeof error === "object") {
        const { code, message } = error as { code?: number; message?: string };
        return { code, detail: message };
      }
    }

    return {};
  } catch {
    return {};
  }
}

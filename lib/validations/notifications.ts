import { z } from "zod";
import { normalizePhone } from "@/lib/notifications";

/**
 * Validation for notification channel settings and push subscriptions
 * (Rules.md section 4 — every request body is validated before anything
 * touches the database).
 */

/**
 * A phone number, accepted as typed and stored as E.164.
 *
 * Empty clears the number. Anything else must be resolvable to E.164 by
 * `normalizePhone`, which refuses to guess a country code — so the error
 * message names one, because "invalid phone number" does not tell somebody
 * typing a local number what is actually wrong.
 */
const phone = z
  .string()
  .trim()
  .refine((value) => value === "" || normalizePhone(value) !== null, {
    message: "Include the country code, for example +919876543210",
  })
  .transform((value) => (value === "" ? null : normalizePhone(value)));

export const channelSettingsSchema = z.object({
  emailEnabled: z.boolean(),
  whatsappEnabled: z.boolean(),
  pushEnabled: z.boolean(),
  /** Absent leaves the stored number alone; empty clears it. */
  phone: phone.optional(),
});

/**
 * A browser's push subscription, in the shape its own
 * `PushSubscription.toJSON()` produces — so the client can post it through
 * unchanged rather than reshaping something it did not author.
 */
export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .regex(/^https:\/\//, "Expected a push service URL."),
  keys: z.object({
    p256dh: z.string().trim().min(1),
    auth: z.string().trim().min(1),
  }),
});

/** Unsubscribing needs only the endpoint that identifies the browser. */
export const pushUnsubscribeSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .regex(/^https:\/\//, "Expected a push service URL."),
});

/**
 * What the server receives, after the phone field has been normalised to E.164
 * or null.
 */
export type ChannelSettingsInput = z.infer<typeof channelSettingsSchema>;

/**
 * What the *form* holds, before that transform runs: an empty text input is an
 * empty string, not null. React Hook Form binds to this side of the schema.
 */
export type ChannelSettingsFormValues = z.input<typeof channelSettingsSchema>;
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

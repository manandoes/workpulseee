import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";

/**
 * Razorpay integration (Plan: billing).
 *
 * Unlike email/WhatsApp/Google Calendar, this cannot degrade gracefully when
 * unconfigured — there is no meaningful "log the payment to the console
 * instead" fallback for money — so a missing key throws rather than silently
 * no-oping, and the caller (an API route) turns that into a 500 the same way
 * every other unexpected failure is handled (`lib/api.ts`'s `serverError`).
 */
function requireEnv(name: "RAZORPAY_KEY_ID" | "RAZORPAY_KEY_SECRET"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env and configure Razorpay.`
    );
  }
  return value;
}

let client: Razorpay | null = null;

function getClient(): Razorpay {
  if (!client) {
    client = new Razorpay({
      key_id: requireEnv("RAZORPAY_KEY_ID"),
      key_secret: requireEnv("RAZORPAY_KEY_SECRET"),
    });
  }
  return client;
}

export type CreateOrderArgs = {
  amountInPaise: number;
  currency?: string;
  /** Shown in the Razorpay dashboard; also doubles as an idempotency hint. */
  receipt: string;
  notes?: Record<string, string>;
};

/** Creates a Razorpay order for the client's Checkout widget to open. */
export async function createRazorpayOrder({
  amountInPaise,
  currency = "INR",
  receipt,
  notes,
}: CreateOrderArgs): Promise<{ id: string; amount: number; currency: string }> {
  const order = await getClient().orders.create({
    amount: amountInPaise,
    currency,
    receipt,
    notes,
  });

  return {
    id: order.id,
    amount: Number(order.amount),
    currency: order.currency,
  };
}

/**
 * Verifies a completed Checkout payment against the key secret.
 *
 * Razorpay's documented scheme: `HMAC-SHA256(order_id + "|" + payment_id,
 * key_secret)` must equal the signature the client received. Compared with
 * `timingSafeEqual`, the same constant-time discipline
 * `lib/invites.ts`'s `tokenHashMatches` already uses for token comparisons —
 * this is the one place in the app that decides whether real money was
 * actually received, so it gets the same rigor.
 */
export function verifyRazorpaySignature({
  orderId,
  paymentId,
  signature,
}: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const expected = createHmac("sha256", requireEnv("RAZORPAY_KEY_SECRET"))
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");
  if (expectedBuffer.length !== signatureBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, signatureBuffer);
}

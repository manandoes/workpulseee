import { z } from "zod";
import { MAX_EXTRA_SEATS_PER_ORDER, SUBSCRIBABLE_PLANS } from "@/lib/plans";

/**
 * Validation schemas for the billing API routes (Rules.md section 4 —
 * request bodies are validated before anything touches the database).
 */

const planName = z.enum(
  SUBSCRIBABLE_PLANS as [string, ...string[]]
) as z.ZodType<(typeof SUBSCRIBABLE_PLANS)[number]>;

/**
 * `POST /api/billing/orders` — a plan purchase/renewal or an extra-seats
 * top-up. A discriminated union rather than two endpoints, since both create
 * a `Payment` row and a Razorpay order the same way and differ only in what
 * they buy.
 */
export const createOrderSchema = z.discriminatedUnion("purpose", [
  z.object({ purpose: z.literal("plan"), plan: planName }),
  z.object({
    purpose: z.literal("seats"),
    seats: z.number().int().min(1).max(MAX_EXTRA_SEATS_PER_ORDER),
  }),
]);

/** `POST /api/billing/verify` — the fields Razorpay Checkout's success handler returns. */
export const verifyOrderSchema = z.object({
  razorpay_order_id: z.string().trim().min(1),
  razorpay_payment_id: z.string().trim().min(1),
  razorpay_signature: z.string().trim().min(1),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type VerifyOrderInput = z.infer<typeof verifyOrderSchema>;

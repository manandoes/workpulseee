import type { SubscriptionPlan } from "@/lib/generated/prisma/enums";

/**
 * The three self-serve subscription tiers (Plan: Razorpay billing).
 *
 * Single source of truth for names, employee caps and prices — both
 * `components/marketing/pricing-section.tsx` (the public pricing page) and
 * `lib/billing.ts` (the actual paywall) read from here, so the number a
 * visitor is quoted and the number that gates checkout can never drift apart.
 *
 * Prices are in paise (minor units), like every other money column in this
 * schema (`Project.value`, `Payment.amount`) — never a float. Razorpay itself
 * only ever bills in the account's settlement currency, so — unlike the
 * marketing page's USD display for non-Indian visitors — checkout always
 * charges the INR amount here regardless of the visitor's detected currency.
 */
export const PLAN_CONFIG: Record<
  SubscriptionPlan,
  { name: string; maxEmployees: number; priceInPaise: number; priceLabel: string }
> = {
  Starter: {
    name: "Starter",
    maxEmployees: 10,
    priceInPaise: 200_000,
    priceLabel: "₹2,000",
  },
  Growth: {
    name: "Growth",
    maxEmployees: 20,
    priceInPaise: 320_000,
    priceLabel: "₹3,200",
  },
  Scale: {
    name: "Scale",
    maxEmployees: 50,
    priceInPaise: 600_000,
    priceLabel: "₹6,000",
  },
};

export const SUBSCRIBABLE_PLANS = Object.keys(
  PLAN_CONFIG
) as SubscriptionPlan[];

/** A billing period is always 30 days, per the manual-renewal model. */
export const BILLING_PERIOD_DAYS = 30;

/**
 * ₹200 ($2.5) per extra employee seat, purchased one at a time or in bulk —
 * requirement: "ask 200/- or 2.5$ per employee". One-time, cumulative, never
 * expires (see `Subscription.extraSeats`).
 */
export const EXTRA_SEAT_PRICE_PAISE = 20_000;

export const MAX_EXTRA_SEATS_PER_ORDER = 500;

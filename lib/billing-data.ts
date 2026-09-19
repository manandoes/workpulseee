import { db } from "@/lib/db";
import { assertSameCompany } from "@/lib/tenant";
import type { SessionActor } from "@/lib/permissions";
import { createRazorpayOrder, verifyRazorpaySignature } from "@/lib/razorpay";
import {
  BILLING_PERIOD_DAYS,
  EXTRA_SEAT_PRICE_PAISE,
  PLAN_CONFIG,
} from "@/lib/plans";
import type { CreateOrderInput, VerifyOrderInput } from "@/lib/validations/billing";
import type { WriteFailure } from "@/lib/api";

/**
 * Database access for billing (Plan: Razorpay billing).
 *
 * Shared by `POST /api/billing/orders` and `POST /api/billing/verify` so the
 * order/payment bookkeeping and the subscription activation rules exist in
 * exactly one place — the same "resolver shared by the routes that mutate
 * it" shape `lib/employee-data.ts`'s `resolveEmployeeWrite` already uses.
 */

export type OrderResolution =
  | {
      ok: true;
      razorpayOrderId: string;
      amountInPaise: number;
      currency: string;
    }
  | WriteFailure;

/**
 * Creates (or reuses) the company's `Subscription` row and opens a Razorpay
 * order against it.
 *
 * A "seats" order requires a subscription to already exist — buying extra
 * seats before ever choosing a base plan has no cap to add them to. A "plan"
 * order upserts the row: `plan` is written immediately so `Payment.plan`
 * (below) and the dashboard both agree on what is being bought, but `status`
 * and `currentPeriodEnd` are left untouched until `verifyBillingPayment`
 * confirms the money actually arrived — an unpaid or abandoned order must
 * never grant access.
 */
export async function createBillingOrder(
  actor: SessionActor,
  input: CreateOrderInput
): Promise<OrderResolution> {
  let subscription = await db.subscription.findUnique({
    where: { companyId: actor.companyId },
  });

  if (input.purpose === "seats" && !subscription) {
    return {
      ok: false,
      status: 400,
      code: "no_plan",
      message: "Subscribe to a plan before buying extra employee seats.",
    };
  }

  const amountInPaise =
    input.purpose === "plan"
      ? PLAN_CONFIG[input.plan].priceInPaise
      : input.seats * EXTRA_SEAT_PRICE_PAISE;

  if (input.purpose === "plan") {
    subscription = subscription
      ? await db.subscription.update({
          where: { id: subscription.id },
          data: { plan: input.plan },
        })
      : await db.subscription.create({
          data: { companyId: actor.companyId, plan: input.plan },
        });
  }

  // Not null past this point: either found above, or just created/updated.
  const subscriptionId = subscription!.id;

  const receipt = `${actor.companyId}-${Date.now()}`;
  const order = await createRazorpayOrder({
    amountInPaise,
    receipt,
    notes: {
      companyId: actor.companyId,
      purpose: input.purpose,
      ...(input.purpose === "plan"
        ? { plan: input.plan }
        : { seats: String(input.seats) }),
    },
  });

  await db.payment.create({
    data: {
      companyId: actor.companyId,
      subscriptionId,
      purpose: input.purpose === "plan" ? "PlanSubscription" : "ExtraSeats",
      plan: input.purpose === "plan" ? input.plan : null,
      seats: input.purpose === "seats" ? input.seats : null,
      amount: amountInPaise,
      razorpayOrderId: order.id,
    },
  });

  return {
    ok: true,
    razorpayOrderId: order.id,
    amountInPaise: order.amount,
    currency: order.currency,
  };
}

export type VerifyResolution = { ok: true } | WriteFailure;

/**
 * Verifies a completed Checkout payment and activates its subscription
 * effect. Idempotent: a `Payment` already `Paid` (e.g. the client retried the
 * verify call) is treated as success without writing again.
 */
export async function verifyBillingPayment(
  actor: SessionActor,
  input: VerifyOrderInput
): Promise<VerifyResolution> {
  const payment = await db.payment.findUnique({
    where: { razorpayOrderId: input.razorpay_order_id },
  });

  if (!payment) {
    return {
      ok: false,
      status: 404,
      code: "not_found",
      message: "That order was not found.",
    };
  }
  // Tenant check (Rules.md section 2) — a payment record fetched by its
  // Razorpay id, not through a company-scoped query, so it is verified here.
  assertSameCompany(actor, payment);

  if (payment.status === "Paid") return { ok: true };

  const signatureValid = verifyRazorpaySignature({
    orderId: input.razorpay_order_id,
    paymentId: input.razorpay_payment_id,
    signature: input.razorpay_signature,
  });

  if (!signatureValid) {
    await db.payment.update({
      where: { id: payment.id },
      data: { status: "Failed" },
    });
    return {
      ok: false,
      status: 400,
      code: "signature_invalid",
      message: "Payment could not be verified.",
    };
  }

  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "Paid",
        razorpayPaymentId: input.razorpay_payment_id,
        razorpaySignature: input.razorpay_signature,
      },
    });

    if (payment.purpose === "PlanSubscription") {
      const currentPeriodEnd = new Date(
        Date.now() + BILLING_PERIOD_DAYS * 24 * 60 * 60 * 1000
      );
      await tx.subscription.update({
        where: { id: payment.subscriptionId },
        data: {
          plan: payment.plan!,
          status: "Active",
          currentPeriodEnd,
        },
      });
    } else {
      await tx.subscription.update({
        where: { id: payment.subscriptionId },
        data: { extraSeats: { increment: payment.seats! } },
      });
    }
  });

  return { ok: true };
}

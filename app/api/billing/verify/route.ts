import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  apiError,
  forbidden,
  serverError,
  unauthorized,
  validationError,
  writeFailure,
} from "@/lib/api";
import { getRawActor } from "@/lib/auth";
import { canManageBilling } from "@/lib/permissions";
import { verifyBillingPayment } from "@/lib/billing-data";
import { verifyOrderSchema } from "@/lib/validations/billing";

/**
 * POST /api/billing/verify — confirms a completed Razorpay Checkout payment
 * and activates its effect (Plan: Razorpay billing).
 *
 * `getRawActor`, same reasoning as `POST /api/billing/orders`: this is the
 * call that turns an unsubscribed company into a subscribed one, so it
 * cannot itself require an active subscription.
 *
 * Known limitation of this manual-renewal, no-webhook design: if the
 * browser closes after Razorpay confirms payment but before this call
 * completes, the `Payment` row stays `Created` and the company is not
 * activated even though it paid. There is no automatic reconciliation for
 * that case yet — the Owner would need to contact support, or a webhook
 * (`payment.captured`) could be added later as a safety net.
 */
export async function POST(request: NextRequest) {
  const actor = await getRawActor();
  if (!actor) return unauthorized();

  if (!canManageBilling(actor)) {
    return forbidden("Only the company owner can manage billing.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = verifyOrderSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const resolved = await verifyBillingPayment(actor, parsed.data);
    if (!resolved.ok) return writeFailure(resolved);

    return NextResponse.json({ ok: true });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/billing/verify",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

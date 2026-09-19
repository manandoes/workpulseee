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
import { createBillingOrder } from "@/lib/billing-data";
import { createOrderSchema } from "@/lib/validations/billing";

/**
 * POST /api/billing/orders — open a Razorpay order for a plan purchase/renewal
 * or an extra-seats top-up (Plan: Razorpay billing).
 *
 * Uses `getRawActor`, not `getActor` — the whole point of this route is to
 * let an Owner pay while their company is still unsubscribed, so it cannot
 * go through the gate that route would apply.
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

  const parsed = createOrderSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const resolved = await createBillingOrder(actor, parsed.data);
    if (!resolved.ok) return writeFailure(resolved);

    return NextResponse.json(
      {
        razorpayOrderId: resolved.razorpayOrderId,
        amountInPaise: resolved.amountInPaise,
        currency: resolved.currency,
      },
      { status: 201 }
    );
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/billing/orders",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

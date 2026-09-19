"use client";

import { useState } from "react";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { Button } from "@/components/ui/button";
import { PLAN_CONFIG, EXTRA_SEAT_PRICE_PAISE, SUBSCRIBABLE_PLANS } from "@/lib/plans";
import type { SubscriptionPlan } from "@/lib/generated/prisma/enums";

/**
 * Owner-only billing card (Settings -> Billing, Plan: Razorpay billing).
 * Only ever rendered for the Owner (`canManageBilling` checked on the
 * settings page before mounting this) — a company already known to have an
 * active subscription, since `app/(dashboard)/layout.tsx` would have
 * redirected to `/billing` otherwise.
 */
export function BillingSettingsCard({
  plan,
  currentPeriodEnd,
  extraSeats,
  employeeCap,
  employeesUsed,
}: {
  plan: SubscriptionPlan;
  currentPeriodEnd: string;
  extraSeats: number;
  employeeCap: number;
  employeesUsed: number;
}) {
  const [changingPlan, setChangingPlan] = useState(false);
  const [seats, setSeats] = useState(5);
  const currentPlan = PLAN_CONFIG[plan];
  const renewalDate = new Date(currentPeriodEnd).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <dt className="text-text-secondary text-meta">Plan</dt>
          <dd className="text-brand-brown font-semibold">{currentPlan.name}</dd>
        </div>
        <div>
          <dt className="text-text-secondary text-meta">Renews</dt>
          <dd className="font-medium">{renewalDate}</dd>
        </div>
        <div>
          <dt className="text-text-secondary text-meta">Employees</dt>
          <dd className="font-medium">
            {employeesUsed} / {employeeCap}
          </dd>
        </div>
        <div>
          <dt className="text-text-secondary text-meta">Extra seats bought</dt>
          <dd className="font-medium">{extraSeats}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-3">
        <CheckoutButton
          order={{ purpose: "plan", plan }}
          label={`Renew ${currentPlan.name} now`}
          redirectTo="/settings"
        />
        <Button variant="outline" onClick={() => setChangingPlan((value) => !value)}>
          {changingPlan ? "Cancel" : "Change plan"}
        </Button>
      </div>

      {changingPlan ? (
        <div className="border-border flex flex-col gap-3 rounded-lg border p-4">
          <p className="text-text-secondary text-meta">
            Switching plans starts a fresh 30-day period under the new plan
            immediately — it does not stack with time remaining on the
            current one.
          </p>
          <div className="flex flex-wrap gap-3">
            {SUBSCRIBABLE_PLANS.filter((id) => id !== plan).map((id) => (
              <CheckoutButton
                key={id}
                order={{ purpose: "plan", plan: id }}
                label={`Switch to ${PLAN_CONFIG[id].name} (${PLAN_CONFIG[id].priceLabel}/mo)`}
                redirectTo="/settings"
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="border-border flex flex-col gap-3 rounded-lg border p-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-medium">Buy extra employee seats</h3>
          <p className="text-text-secondary text-meta">
            ₹{(EXTRA_SEAT_PRICE_PAISE / 100).toLocaleString("en-IN")} per seat,
            one-time, added to your cap permanently.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={500}
            value={seats}
            onChange={(event) =>
              setSeats(Math.max(1, Number(event.target.value) || 1))
            }
            className="border-border w-20 rounded-lg border px-3 py-2"
            aria-label="Number of extra seats"
          />
          <CheckoutButton
            order={{ purpose: "seats", seats }}
            label={`Buy ${seats} seat${seats === 1 ? "" : "s"} (₹${(
              (seats * EXTRA_SEAT_PRICE_PAISE) /
              100
            ).toLocaleString("en-IN")})`}
            redirectTo="/settings"
          />
        </div>
      </div>
    </div>
  );
}

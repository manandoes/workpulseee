import { Card, CardContent } from "@/components/ui/card";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { PLAN_CONFIG, SUBSCRIBABLE_PLANS } from "@/lib/plans";

/**
 * The Owner's plan picker on `/billing` (Plan: Razorpay billing) — one card
 * per self-serve tier, sourced from `lib/plans.ts` so it can never disagree
 * with the marketing pricing page or the actual checkout amount.
 */
export function PlanPicker({ redirectTo }: { redirectTo: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {SUBSCRIBABLE_PLANS.map((planId) => {
        const plan = PLAN_CONFIG[planId];
        return (
          <Card key={planId}>
            <CardContent className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-1">
                <h3 className="text-h3 text-brand-brown font-semibold">
                  {plan.name}
                </h3>
                <p className="text-text-secondary text-meta">
                  Up to {plan.maxEmployees} employees
                </p>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-brand-brown text-h2 font-semibold">
                  {plan.priceLabel}
                </span>
                <span className="text-text-secondary text-meta">/ month</span>
              </div>
              <CheckoutButton
                order={{ purpose: "plan", plan: planId }}
                label={`Subscribe to ${plan.name}`}
                redirectTo={redirectTo}
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

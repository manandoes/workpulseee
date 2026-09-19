import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/marketing/section";
import { detectPricingCurrency, type Currency } from "@/lib/pricing";
import { PLAN_CONFIG } from "@/lib/plans";

/**
 * Pricing (PRD.md section 6.0). Flat monthly fee per company, based on the
 * employee-count bracket — not per-user. Currency is picked by the visitor's
 * IP-derived country (India -> INR, everywhere else -> USD); see
 * `lib/pricing.ts`.
 *
 * The three self-serve tiers' names/caps/INR prices come from `lib/plans.ts`
 * — the same config `/billing` checkout actually charges — so this page can
 * never quote a number checkout disagrees with. USD display prices (shown to
 * non-Indian visitors) and the non-self-serve Enterprise tier stay local:
 * Razorpay checkout only ever charges in INR (see `lib/plans.ts`'s own
 * comment), so there is nothing in `lib/plans.ts` for a USD price to match.
 */
const PLANS = [
  {
    name: PLAN_CONFIG.Starter.name,
    upToEmployees: PLAN_CONFIG.Starter.maxEmployees,
    price: { INR: PLAN_CONFIG.Starter.priceLabel, USD: "$25" },
    description: "For small teams putting their operations in one place.",
    features: [
      "Up to 10 employees",
      "Projects, tasks, and requests",
      "Employee self-service",
      "Email support",
    ],
    cta: "Get started",
    featured: false,
  },
  {
    name: PLAN_CONFIG.Growth.name,
    upToEmployees: PLAN_CONFIG.Growth.maxEmployees,
    price: { INR: PLAN_CONFIG.Growth.priceLabel, USD: "$40" },
    discountLabel: "20% off",
    description: "For growing teams that need workload and performance visibility.",
    features: [
      "Up to 20 employees",
      "Workload intelligence",
      "Performance tracking & goals",
      "Client financials & margins",
      "Early-warning alerts",
    ],
    cta: "Get started",
    featured: true,
  },
  {
    name: PLAN_CONFIG.Scale.name,
    upToEmployees: PLAN_CONFIG.Scale.maxEmployees,
    price: { INR: PLAN_CONFIG.Scale.priceLabel, USD: "$75" },
    discountLabel: "40% off",
    description: "For larger agencies with custom process and security needs.",
    features: [
      "Up to 50 employees",
      "Everything in Growth",
      "Custom alert thresholds",
      "Priority support",
    ],
    cta: "Get started",
    featured: false,
  },
  {
    name: "Enterprise",
    upToEmployees: null,
    price: { INR: "Custom", USD: "Custom" },
    description: "Need help? For agencies past 50 employees or with bespoke needs.",
    features: [
      "Everything in Scale",
      "Custom contract & billing",
      "Onboarding & migration help",
      "Dedicated support",
    ],
    cta: "Contact us",
    featured: false,
  },
] as const;

export async function PricingSection() {
  const currency: Currency = await detectPricingCurrency();

  return (
    <Section id="pricing" className="bg-surface">
      <SectionHeading
        title="Simple plans that grow with your team"
        description="Every plan includes your own isolated company workspace. Flat monthly price per company, billed in your local currency."
      />

      <div className="mt-14 grid gap-6 lg:grid-cols-4">
        {PLANS.map((plan) => {
          const isCustom = plan.price.INR === "Custom";
          const price = plan.price[currency];

          return (
            <div
              key={plan.name}
              className={cn(
                "border-brand-brown-light bg-surface relative flex flex-col gap-6 rounded-lg border-2 p-6",
                plan.featured && "border-brand-brown"
              )}
            >
              {plan.featured ? (
                <span className="bg-brand-yellow text-brand-brown absolute -top-3.5 left-6 rounded-full px-3 py-1 text-xs font-bold tracking-wide uppercase">
                  Most picked
                </span>
              ) : null}
              <div className="flex flex-col gap-2">
                <h3 className="text-brand-brown text-xl font-bold tracking-tight">
                  {plan.name}
                </h3>
                <p className="text-text-secondary">{plan.description}</p>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-brand-brown text-display font-semibold">
                    {price}
                  </span>
                  {!isCustom ? (
                    <span className="text-text-secondary text-meta">
                      / month
                    </span>
                  ) : null}
                </div>
                {"discountLabel" in plan ? (
                  <span className="text-brand-brown-soft text-meta font-medium">
                    {plan.discountLabel} applied
                  </span>
                ) : null}
              </div>

              <ul className="flex flex-1 flex-col gap-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check
                      aria-hidden
                      className="text-brand-brown-soft mt-0.5 size-4 shrink-0"
                      strokeWidth={1.5}
                    />
                    <span className="text-text-secondary">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                size="lg"
                variant={plan.featured ? "default" : "outline"}
              >
                <Link href={isCustom ? "/contact" : "/register"}>
                  {plan.cta}
                  <span className="sr-only">{` — ${plan.name} plan`}</span>
                </Link>
              </Button>
            </div>
          );
        })}
      </div>

      <p className="text-text-secondary text-meta mt-8 text-center">
        {currency === "INR"
          ? "Prices shown in INR. "
          : "Prices shown in USD. "}
        Nothing is charged today.
      </p>
    </Section>
  );
}

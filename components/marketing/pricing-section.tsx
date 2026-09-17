import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/marketing/section";
import { detectPricingCurrency, type Currency } from "@/lib/pricing";

/**
 * Pricing (PRD.md section 6.0). Flat monthly fee per company, based on the
 * employee-count bracket — not per-user. Currency is picked by the visitor's
 * IP-derived country (India -> INR, everywhere else -> USD); see
 * `lib/pricing.ts`.
 */
const PLANS = [
  {
    name: "Starter",
    upToEmployees: 10,
    price: { INR: "₹2,000", USD: "$25" },
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
    name: "Growth",
    upToEmployees: 20,
    price: { INR: "₹3,200", USD: "$40" },
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
    name: "Scale",
    upToEmployees: 50,
    price: { INR: "₹6,000", USD: "$75" },
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
        eyebrow="Pricing"
        title="Simple plans that grow with your team"
        description="Every plan includes your own isolated company workspace. Flat monthly price per company, billed in your local currency."
      />

      <div className="mt-12 grid gap-6 lg:grid-cols-4">
        {PLANS.map((plan) => {
          const isCustom = plan.price.INR === "Custom";
          const price = plan.price[currency];

          return (
            <div
              key={plan.name}
              className={cn(
                "border-border bg-surface flex flex-col gap-6 rounded-xl border p-6",
                plan.featured && "border-brand-yellow"
              )}
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-h3 text-brand-brown font-semibold">
                    {plan.name}
                  </h3>
                  {plan.featured ? (
                    <span className="bg-brand-yellow-light text-brand-brown text-meta rounded-full px-2.5 py-1 font-medium">
                      Most popular
                    </span>
                  ) : null}
                </div>
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

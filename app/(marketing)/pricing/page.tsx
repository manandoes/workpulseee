import type { Metadata } from "next";
import { PricingSection } from "@/components/marketing/pricing-section";
import { FaqSection } from "@/components/marketing/faq-section";
import { CtaBand } from "@/components/marketing/cta-band";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple per-user plans for agencies of every size. Every plan includes your own isolated company workspace.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <>
      <PricingSection />
      <FaqSection />
      <CtaBand />
    </>
  );
}

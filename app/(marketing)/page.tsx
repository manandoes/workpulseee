import type { Metadata } from "next";
import { Hero } from "@/components/marketing/hero";
import { FeaturesSection } from "@/components/marketing/features-section";
import { HowItWorksSection } from "@/components/marketing/how-it-works-section";
import { PricingSection } from "@/components/marketing/pricing-section";
import { TestimonialsSection } from "@/components/marketing/testimonials-section";
import { FaqSection } from "@/components/marketing/faq-section";
import { CtaBand } from "@/components/marketing/cta-band";

export const metadata: Metadata = {
  title: "WorkPulse — Run your whole agency from one dashboard",
  description:
    "An all-in-one operating dashboard for agencies that connects employees, projects, tasks, performance, expenses, and internal operations in one place.",
};

export default function LandingPage() {
  return (
    <>
      <Hero />
      <FeaturesSection />
      <HowItWorksSection />
      <PricingSection />
      <TestimonialsSection />
      <FaqSection />
      <CtaBand />
    </>
  );
}

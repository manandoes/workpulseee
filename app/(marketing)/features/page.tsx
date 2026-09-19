import type { Metadata } from "next";
import { FeaturesSection } from "@/components/marketing/features-section";
import { HowItWorksSection } from "@/components/marketing/how-it-works-section";
import { CtaBand } from "@/components/marketing/cta-band";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Company dashboard, employee management, tasks and projects, workload intelligence, performance tracking, employee requests, and client financials.",
  alternates: { canonical: "/features" },
};

export default function FeaturesPage() {
  return (
    <>
      <FeaturesSection />
      <HowItWorksSection />
      <CtaBand />
    </>
  );
}

import type { Metadata } from "next";
import { FaqSection } from "@/components/marketing/faq-section";
import { CtaBand } from "@/components/marketing/cta-band";

export const metadata: Metadata = {
  title: "FAQ — WorkPulse",
  description:
    "Answers about data isolation, employee visibility, inviting your team, and how company and employee logins differ.",
};

export default function FaqPage() {
  return (
    <>
      <FaqSection />
      <CtaBand />
    </>
  );
}

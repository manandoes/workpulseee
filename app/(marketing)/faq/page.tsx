import type { Metadata } from "next";
import { FaqSection } from "@/components/marketing/faq-section";
import { CtaBand } from "@/components/marketing/cta-band";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Answers about data isolation, employee visibility, inviting your team, and how company and employee logins differ.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  return (
    <>
      <FaqSection />
      <CtaBand />
    </>
  );
}

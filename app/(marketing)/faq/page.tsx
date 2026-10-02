import type { Metadata } from "next";
import { FaqSection } from "@/components/marketing/faq-section";
import { CtaBand } from "@/components/marketing/cta-band";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Answers about data isolation, employee visibility, inviting your team, and how company and employee logins differ.",
  alternates: { canonical: "/faq" },
  openGraph: {
    images: [
      {
        url: "https://workpulse.automovalabs.tech/workpulse-mark.png",
        width: 1200,
        height: 630,
        alt: "WorkPulse frequently asked questions",
      },
    ],
  },
};

export default function FaqPage() {
  return (
    <>
      <FaqSection />
      <CtaBand />
    </>
  );
}

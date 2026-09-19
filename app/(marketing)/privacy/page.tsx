import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/marketing/page-placeholder";

// Placeholder content ("the policy has not been drafted yet") — noindexed
// until real copy lands, and excluded from `app/sitemap.ts` to match. Remove
// both exclusions together once this is written.
export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How WorkPulse handles your company's data, including tenant isolation.",
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return (
    <PagePlaceholder
      title="Privacy Policy"
      description="This page will explain what data WorkPulse stores, how each company's data is kept isolated from every other company, and how long it is retained."
      note="Placeholder page. The policy has not been drafted yet and must be written or reviewed by a qualified professional before launch."
    />
  );
}

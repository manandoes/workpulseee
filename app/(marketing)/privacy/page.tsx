import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/marketing/page-placeholder";

export const metadata: Metadata = {
  title: "Privacy Policy — WorkPulse",
  description:
    "How WorkPulse handles your company's data, including tenant isolation.",
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

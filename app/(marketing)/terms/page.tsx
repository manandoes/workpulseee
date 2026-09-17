import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/marketing/page-placeholder";

export const metadata: Metadata = {
  title: "Terms of Service — WorkPulse",
  description: "The terms that govern use of WorkPulse.",
};

export default function TermsPage() {
  return (
    <PagePlaceholder
      title="Terms of Service"
      description="These terms will set out what you can expect from WorkPulse and what we ask of you in return."
      note="Placeholder page. The terms have not been drafted yet and must be written or reviewed by a qualified professional before launch."
    />
  );
}

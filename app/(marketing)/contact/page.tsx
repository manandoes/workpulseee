import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/marketing/page-placeholder";

export const metadata: Metadata = {
  title: "Contact — WorkPulse",
  description: "Get in touch with the WorkPulse team.",
};

export default function ContactPage() {
  return (
    <PagePlaceholder
      title="Contact us"
      description="We'd like to hear what your agency is running on today and where it breaks down."
      note="A contact form and support address will be added here once they are set up. No contact details have been published yet."
    />
  );
}

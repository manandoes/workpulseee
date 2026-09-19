import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { FAQS } from "@/components/marketing/faq-section";

const SITE_URL = "https://workpulse.automovalabs.tech";

/**
 * Organization + SoftwareApplication + FAQPage structured data for every
 * marketing page — one script here rather than per-page, since the facts it
 * states (who WorkPulse is, what it is) don't vary by page. `FAQPage` reuses
 * `FaqSection`'s own `FAQS` array so the schema can never drift from the
 * visible copy.
 */
function StructuredData() {
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "WorkPulse",
        url: SITE_URL,
        logo: `${SITE_URL}/workpulse-mark.png`,
      },
      {
        "@type": "SoftwareApplication",
        name: "WorkPulse",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: SITE_URL,
        description:
          "An all-in-one operating dashboard for agencies that connects employees, projects, tasks, performance, expenses, and internal operations in one place.",
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQS.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // Our own data only (fixed org facts + this file's own FAQS array) —
      // never user input, so this is not an XSS vector.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

/**
 * Public marketing shell (Architecture.md section 3.1) — no auth required,
 * server-rendered for SEO.
 */
export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <StructuredData />
      <SiteHeader />
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

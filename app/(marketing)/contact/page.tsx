import type { Metadata } from "next";
import { ContactForm } from "@/components/marketing/contact-form";

const SITE_URL = "https://workpulse.automovalabs.tech";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch with the WorkPulse team.",
  alternates: { canonical: "/contact" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/contact`,
    title: "Contact Us — WorkPulse",
    description: "Get in touch with the WorkPulse team.",
    images: [
      {
        url: `${SITE_URL}/workpulse-mark.png`,
        width: 1200,
        height: 630,
        alt: "WorkPulse contact us",
      },
    ],
  },
};

export default function ContactPage() {
  return (
    <section className="w-full px-6 py-16 sm:py-24">
      <div className="mx-auto w-full max-w-170">
        <h1 className="text-brand-brown text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          Contact us
        </h1>
        <p className="text-text-secondary mt-4 text-lg">
          Have a question, feedback, or need support? We&rsquo;d like to hear
          from you.
        </p>

        <div className="mt-10 flex flex-col gap-8">
          <ContactForm />

          <div className="flex flex-col gap-4 border-brand-brown-light rounded-lg border-2 p-6">
            <h2 className="text-brand-brown text-lg font-semibold">
              Other ways to reach us
            </h2>
            <ul className="flex flex-col gap-2 text-text-secondary">
              <li>
                <span className="font-medium text-foreground">Email:</span>{" "}
                <a
                  href="mailto:team@automovalabs.tech"
                  className="text-brand-brown hover:underline"
                >
                  team@automovalabs.tech
                </a>
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Website:
                </span>{" "}
                <a
                  href={SITE_URL}
                  className="text-brand-brown hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {SITE_URL}
                </a>
              </li>
            </ul>
            <p className="text-text-secondary text-sm">
              We typically respond within 1–2 business days. For urgent
              matters, email us directly.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

import type { Metadata } from "next";

const SITE_URL = "https://workpulse.automovalabs.tech";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that govern your use of WorkPulse, including accounts, acceptable use, and liability.",
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/terms`,
    title: "Terms of Service — WorkPulse",
    description:
      "The terms that govern your use of WorkPulse, including accounts, acceptable use, and liability.",
    images: [
      {
        url: `${SITE_URL}/workpulse-mark.png`,
        width: 1200,
        height: 630,
        alt: "WorkPulse terms of service",
      },
    ],
  },
};

export default function TermsPage() {
  return (
    <section className="w-full px-6 py-16 sm:py-24">
      <div className="mx-auto w-full max-w-195">
        <h1 className="text-brand-brown text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          Terms of Service
        </h1>
        <p className="text-text-secondary mt-4 text-sm">
          Last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>

        <div className="mt-10 flex flex-col gap-10 text-pretty">
          <TermsSection
            title="1. Acceptance of terms"
            content={
              "By creating an account or using WorkPulse, you agree to these Terms of Service (&ldquo;Terms&rdquo;) and our Privacy Policy. If you are using WorkPulse on behalf of a company, you represent that you have the authority to bind that company to these Terms."
            }
          />

          <TermsSection
            title="2. Description of service"
            content={
              "WorkPulse is a cloud-based platform that provides agency and team management tools, including employee management, project tracking, task assignment, performance scoring, attendance, expense management, and internal communication. The service is delivered as a Software-as-a-Service (&ldquo;SaaS&rdquo;) product."
            }
          />

          <TermsSection
            title="3. Accounts and access"
            content={
              "You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account. You must provide accurate and complete registration information and keep it up to date.\n\n" +
              "We reserve the right to suspend or terminate accounts that violate these Terms or are inactive for an extended period. Upon termination, you may export your data for 30 days before permanent deletion, subject to our Privacy Policy."
            }
          />

          <TermsSection
            title="4. Company and employee roles"
            content={
              "WorkPulse supports two login types: company accounts (admins, managers, HR) and employee accounts. Each company account owns a separate workspace. Only the company owner or an admin with appropriate permissions can invite employees or manage company settings. Employees can only access data their role permits them to see."
            }
          />

          <TermsSection
            title="5. Acceptable use"
            content={
              "You agree not to:\n\n" +
              "Use WorkPulse for any unlawful purpose or in violation of any third-party rights.\n\n" +
              "Attempt to access another company&rsquo;s data, reverse-engineer the service, or circumvent security measures.\n\n" +
              "Use the service to transmit malware, spam, or abusive content.\n\n" +
              "Resell or redistribute WorkPulse access without a written agreement from us.\n\n" +
              "Use automated scraping or bulk extraction of data except through documented APIs."
            }
          />

          <TermsSection
            title="6. Intellectual property"
            content={
              "WorkPulse and its original content, features, and functionality — including the WorkPulse name, logo, and design — are owned by Automova Labs and are protected by intellectual property laws. You retain ownership of the data you input into WorkPulse, but you grant us a license to use, store, and process that data solely to provide the service."
            }
          />

          <TermsSection
            title="7. Fees and payment"
            content={
              "WorkPulse may offer free and paid subscription plans. Paid plans are billed on a recurring basis (monthly or annual) through the payment method you provide. All fees are exclusive of taxes, which you are responsible for paying. We may change pricing with 30 days&rsquo; notice; changes will not affect your current billing cycle."
            }
          />

          <TermsSection
            title="8. Service availability"
            content={
              "We aim to provide WorkPulse with high availability but do not guarantee uninterrupted or error-free service. We may perform scheduled maintenance with reasonable advance notice. In the event of extended downtime, we will endeavour to communicate through available channels."
            }
          />

          <TermsSection
            title="9. Limitation of liability"
            content={
              "To the maximum extent permitted by law, WorkPulse is provided &ldquo;as is&rdquo; without warranties of any kind, either express or implied. Automova Labs shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of or inability to use the service, including loss of data or business interruption, even if advised of the possibility of such damages.\n\n" +
              "Our total liability to you for any claim arising out of these Terms shall not exceed the amount you paid us in the 12 months preceding the claim."
            }
          />

          <TermsSection
            title="10. Indemnification"
            content={
              "You agree to indemnify and hold harmless Automova Labs and its officers, employees, and agents from any claims, damages, or expenses (including reasonable legal fees) arising out of your violation of these Terms or your violation of any rights of a third party."
            }
          />

          <TermsSection
            title="11. Termination"
            content={
              "You may terminate your account at any time by contacting us or using the self-service deletion flow. We may suspend or terminate your account if you breach these Terms, fail to pay applicable fees, or for any reason with 30 days&rsquo; written notice. Upon termination, your right to use the service ceases immediately, and data will be handled according to our Privacy Policy."
            }
          />

          <TermsSection
            title="12. Changes to these terms"
            content={
              "We may amend these Terms from time to time. We will notify you of material changes by posting the updated Terms on this page and updating the &ldquo;Last updated&rdquo; date. Continued use of WorkPulse after the changes take effect constitutes your acceptance of the revised Terms."
            }
          />

          <TermsSection
            title="13. Governing law"
            content={
              `These Terms are governed by the laws of India, without regard to conflict of law principles. Any disputes arising under these Terms shall be resolved in the courts located in [your jurisdiction].`
            }
          />

          <TermsSection
            title="14. Contact"
            content={
              `If you have any questions about these Terms, please contact us at:\n\n` +
              `Email: team@automovalabs.tech\n` +
              `Website: ${SITE_URL}/contact`
            }
          />
        </div>
      </div>
    </section>
  );
}

function TermsSection({ title, content }: { title: string; content: string }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-brand-brown text-xl font-semibold">{title}</h2>
      <div className="text-text-secondary whitespace-pre-line leading-relaxed">
        {content}
      </div>
    </div>
  );
}

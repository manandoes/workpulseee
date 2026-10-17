import type { Metadata } from "next";

const SITE_URL = "https://workpulse.automovalabs.tech";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How WorkPulse handles your company's data, including tenant isolation, retention, and your rights.",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/privacy`,
    title: "Privacy Policy — WorkPulse",
    description:
      "How WorkPulse handles your company's data, including tenant isolation, retention, and your rights.",
    images: [
      {
        url: `${SITE_URL}/workpulse-mark.png`,
        width: 1200,
        height: 630,
        alt: "WorkPulse privacy policy",
      },
    ],
  },
};

export default function PrivacyPage() {
  return (
    <section className="w-full px-6 py-16 sm:py-24">
      <div className="mx-auto w-full max-w-195">
        <h1 className="text-brand-brown text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          Privacy Policy
        </h1>
        <p className="text-text-secondary mt-4 text-sm">
          Last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>

        <div className="mt-10 flex flex-col gap-10 text-pretty">
          <PrivacySection
            title="1. Who we are"
            content={
              "WorkPulse is developed and operated by Automova Labs. Our website is " +
              `${SITE_URL}. When we say &ldquo;we,&rdquo;&nbsp;&ldquo;us,&rdquo; or &ldquo;WorkPulse,&rdquo; we mean Automova Labs and its affiliates.`
            }
          />

          <PrivacySection
            title="2. What data we collect"
            content={
              "We collect data in three categories:\n\n" +
              "Company account data — the email address and name you provide when registering a company account, plus any profile information you add.\n\n" +
              "Employee data — names, email addresses, job titles, attendance records, task history, performance scores, and any files or messages you choose to store in WorkPulse.\n\n" +
              "Usage and diagnostic data — anonymised metrics about how the product is used, crash reports, and performance logs. This data is never linked back to a specific person."
            }
          />

          <PrivacySection
            title="3. How we use your data"
            content={
              "We use your data to:\n\n" +
              "Deliver the WorkPulse service — hosting your company workspace, running calculations, and sending the notifications you configure.\n\n" +
              "Communicate with you — sending password resets, invite links, billing receipts, and product updates that are essential to your account.\n\n" +
              "Improve the product — analysing aggregated, anonymised usage patterns to fix bugs and prioritise features.\n\n" +
              "Comply with legal obligations — responding to lawful requests, preventing fraud, and enforcing our Terms of Service."
            }
          />

          <PrivacySection
            title="4. Tenant isolation"
            content={
              "WorkPulse is a multi-tenant platform. Each company&rsquo;s data is logically isolated at the database level using a per-company identifier on every record. One company can never query another company&rsquo;s data through the API. Access is further restricted by role — an employee in Company&nbsp;A cannot see Company&nbsp;B&rsquo;s projects, employees, or financials, regardless of what they know about the system."
            }
          />

          <PrivacySection
            title="5. Data retention"
            content={
              "We retain your data for as long as your company account is active. When a company deletes its account, we erase all associated company and employee data within 30 days. Backup copies are purged within 90 days. We may retain anonymised, aggregated statistics indefinitely for product improvement purposes.\n\n" +
              "Employee data is retained for as long as the employee&rsquo;s account is active or as required by applicable law (for example, labour-law record-keeping obligations)."
            }
          />

          <PrivacySection
            title="6. Data sharing and third parties"
            content={
              "We do not sell your data. We share data only in these circumstances:\n\n" +
              "Service providers — we use trusted third-party providers for email delivery, analytics, and hosting. These providers process data only on our instructions and are contractually bound to protect it.\n\n" +
              "Legal requirements — we may disclose data when required by law, court order, or government request.\n\n" +
              "Business transfers — in the event of a merger, acquisition, or sale of assets, your data may be transferred as part of that transaction under continued confidentiality obligations."
            }
          />

          <PrivacySection
            title="7. Your rights"
            content={
              "Depending on your jurisdiction, you may have the right to:\n\n" +
              "Access — request a copy of the personal data we hold about you.\n\n" +
              "Rectification — correct inaccurate personal data.\n\n" +
              "Erasure — request deletion of your personal data, subject to legal retention obligations.\n\n" +
              "Portability — receive your data in a structured, machine-readable format.\n\n" +
              "Objection — object to processing based on legitimate interests.\n\n" +
              "To exercise any of these rights, email us at team@automovalabs.tech. We will respond within 30 days."
            }
          />

          <PrivacySection
            title="8. Security"
            content={
              "We implement industry-standard technical and organisational measures to protect your data, including encryption in transit (TLS), encryption at rest, regular security testing, and access controls based on role. No system is perfectly secure, and we encourage you to use strong passwords and enable two-factor authentication where available."
            }
          />

          <PrivacySection
            title="9. Cookies and tracking"
            content={
              "WorkPulse uses essential cookies for authentication and session management. We do not use advertising cookies or third-party tracking pixels. Analytics are limited to anonymised, aggregated metrics that cannot identify individual users."
            }
          />

          <PrivacySection
            title="10. Children&rsquo;s privacy"
            content={
              "WorkPulse is not intended for use by children under the age of 16. We do not knowingly collect personal data from children. If you believe a child has provided us with personal data, please contact us and we will delete it promptly."
            }
          />

          <PrivacySection
            title="11. International transfers"
            content={
              "WorkPulse is operated from India. Data may be processed and stored on servers located outside your country of residence. By using WorkPulse, you consent to the transfer of your data to these jurisdictions. We ensure that appropriate safeguards — such as standard contractual clauses — are in place for any cross-border data transfers."
            }
          />

          <PrivacySection
            title="12. Changes to this policy"
            content={
              "We may update this privacy policy from time to time. We will notify you of material changes by posting the new policy on this page and updating the &ldquo;Last updated&rdquo; date. We encourage you to review this policy periodically."
            }
          />

          <PrivacySection
            title="13. Contact us"
            content={
              `If you have any questions about this privacy policy or our data practices, please contact us at:\n\n` +
              `Email: team@automovalabs.tech\n` +
              `Website: ${SITE_URL}/contact`
            }
          />
        </div>
      </div>
    </section>
  );
}

function PrivacySection({ title, content }: { title: string; content: string }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-brand-brown text-xl font-semibold">{title}</h2>
      <div className="text-text-secondary whitespace-pre-line leading-relaxed">
        {content}
      </div>
    </div>
  );
}

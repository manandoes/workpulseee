import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { canSendBulkEmail } from "@/lib/permissions";
import { loadBulkEmails } from "@/lib/bulk-email-data";
import { AUDIENCE_LABELS } from "@/lib/bulk-email";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { BulkEmailForm } from "@/components/communications/bulk-email-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Email" };

/**
 * Compose a company-wide email, plus the log of what has already been sent
 * (Plan: bulk email). The log is deliberately on the same page as the
 * composer: "has this already gone out?" is the question worth answering
 * before someone sends it twice.
 */
export default async function CommunicationsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canSendBulkEmail(actor)) redirect("/dashboard");

  const sent = await loadBulkEmails(actor);

  return (
    <>
      <PageHeader
        title="Email the company"
        description="Send a message to everyone, to one group, or to specific people. Emails go out from your company's configured sender."
      />

      <Card>
        <CardContent className="py-2">
          <BulkEmailForm />
        </CardContent>
      </Card>

      <section className="mt-8">
        <h2 className="text-h3 text-brand-brown mb-3 font-semibold">
          Recently sent
        </h2>

        {sent.length === 0 ? (
          <p className="text-text-secondary">Nothing has been sent yet.</p>
        ) : (
          <ul className="border-border divide-border bg-surface flex flex-col divide-y overflow-hidden rounded-xl border">
            {sent.map((email) => (
              <li
                key={email.id}
                className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="text-foreground block truncate font-medium">
                    {email.subject}
                  </span>
                  <span className="text-text-secondary text-meta">
                    {AUDIENCE_LABELS[email.audience]}
                    {email.sentBy ? ` · ${email.sentBy.fullName}` : ""} ·{" "}
                    {formatDateTime(email.createdAt)}
                  </span>
                </span>
                <span className="text-text-secondary text-meta shrink-0">
                  Reached {email.deliveredCount} of {email.recipientCount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

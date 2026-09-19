import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pencil } from "lucide-react";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageRecruitment } from "@/lib/permissions";
import { loadApplicants, loadHiringForm } from "@/lib/recruitment-data";
import { loadFormsConnection } from "@/lib/google-forms-data";
import { QUESTION_TYPE_LABELS } from "@/lib/recruitment";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { FormStatusBadge } from "@/components/recruitment/status-badges";
import { PublishControls } from "@/components/recruitment/publish-controls";
import { ApplicantPipeline } from "@/components/recruitment/applicant-pipeline";

export const metadata: Metadata = { title: "Opening" };

/**
 * One opening: how to publish it, who has applied, and what it asks
 * (Plan: hiring).
 *
 * The applicant list comes first and the question list last, because after the
 * first day this page is opened to read applicants, not to re-read the form
 * the reader wrote themselves.
 */
export default async function HiringFormPage({
  params,
}: PageProps<"/hiring/[formId]">) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canManageRecruitment(actor)) redirect("/dashboard");

  const { formId } = await params;

  const form = await loadHiringForm(actor, formId);
  if (!form) notFound();

  const [applicants, connection, company] = await Promise.all([
    loadApplicants(actor, formId),
    loadFormsConnection(actor.companyId),
    db.company.findUniqueOrThrow({
      where: { id: actor.companyId },
      select: { slug: true },
    }),
  ]);

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://workpulse.tech";
  const publicUrl = `${origin}/${company.slug}/recruitmentform/${form.slug}`;

  return (
    <>
      <PageHeader
        title={form.title}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <FormStatusBadge status={form.status} />
            <span>
              {[
                form.team,
                form.location,
                form.employmentType?.replace(/([a-z])([A-Z])/g, "$1 $2"),
              ]
                .filter(Boolean)
                .join(" · ") || "No team or location set"}
            </span>
          </span>
        }
        action={
          applicants.length === 0 ? (
            <Button variant="outline" asChild>
              <Link href={`/hiring/${form.id}/edit`}>
                <Pencil aria-hidden className="size-4" strokeWidth={1.5} />
                Edit form
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-10">
        <PublishControls
          formId={form.id}
          status={form.status}
          destination={form.destination}
          publicUrl={publicUrl}
          googleResponderUrl={form.googleResponderUrl}
          googleEditUrl={form.googleEditUrl}
          googleSyncedAt={form.googleSyncedAt}
          googleConnected={connection !== null}
          questionCount={form.questions.length}
        />

        <section className="flex flex-col gap-4">
          <h2 className="text-h2 text-brand-brown font-semibold">
            Applicants
          </h2>
          <ApplicantPipeline formId={form.id} applicants={applicants} />
        </section>

        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-h2 text-brand-brown font-semibold">
              What this form asks
            </h2>
            <p className="text-text-secondary mt-1">
              Name, email address and phone number are collected on every form.
              {applicants.length > 0
                ? " These questions are locked now that people have applied — their answers are attached to them."
                : ""}
            </p>
          </div>

          {form.questions.length === 0 ? (
            <p className="text-text-secondary">
              No questions yet. Applicants would only give their contact
              details.
            </p>
          ) : (
            <ol className="border-border divide-border divide-y rounded-xl border">
              {form.questions.map((question, index) => (
                <li key={question.id} className="flex gap-4 px-5 py-4">
                  <span className="text-text-secondary tabular-nums">
                    {index + 1}
                  </span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-brand-brown font-medium">
                      {question.label}
                      {question.required ? (
                        <span className="text-danger-text" aria-label="required">
                          {" "}
                          *
                        </span>
                      ) : null}
                    </span>
                    <span className="text-text-secondary text-meta">
                      {QUESTION_TYPE_LABELS[question.type]}
                      {question.options.length > 0
                        ? ` — ${question.options.join(", ")}`
                        : ""}
                    </span>
                    {question.helpText ? (
                      <span className="text-text-secondary text-meta">
                        {question.helpText}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}

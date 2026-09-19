import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { getActor } from "@/lib/auth";
import { canManageRecruitment } from "@/lib/permissions";
import { loadApplicant } from "@/lib/recruitment-data";
import { formatFileSize } from "@/lib/files";
import { formatDateTime } from "@/lib/format";
import { resolveRequestTimeZone } from "@/lib/timezone-request";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { StageBadge } from "@/components/recruitment/status-badges";
import { ApplicantActions } from "@/components/recruitment/applicant-actions";

export const metadata: Metadata = { title: "Applicant" };

/**
 * One candidate's whole file (Plan: hiring).
 *
 * Laid out as the document it is: their answers in the order they were asked,
 * with the decision controls and the internal history beside them rather than
 * interleaved — a reviewer reads the file, then acts on it.
 */
export default async function ApplicantPage({
  params,
}: PageProps<"/hiring/[formId]/applicants/[applicationId]">) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canManageRecruitment(actor)) redirect("/dashboard");

  const { formId, applicationId } = await params;

  const applicant = await loadApplicant(actor, applicationId);
  if (!applicant || applicant.formId !== formId) notFound();

  const timeZone = await resolveRequestTimeZone();

  return (
    <>
      <Link
        href={`/hiring/${formId}`}
        className="text-text-secondary hover:text-brand-brown mb-4 inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" strokeWidth={1.5} />
        {applicant.formTitle}
      </Link>

      <PageHeader
        title={applicant.fullName}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StageBadge stage={applicant.stage} />
            <a
              href={`mailto:${applicant.email}`}
              className="underline-offset-4 hover:underline"
            >
              {applicant.email}
            </a>
            {applicant.phone ? <span>{applicant.phone}</span> : null}
            <span>
              Applied {formatDateTime(applicant.submittedAt, timeZone)}
              {applicant.source === "GoogleForm" ? " via Google Forms" : ""}
            </span>
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardContent className="flex flex-col gap-6 py-2">
            <h2 className="text-h3 text-brand-brown font-semibold">
              Their answers
            </h2>

            {applicant.answers.length === 0 ? (
              <p className="text-text-secondary">
                This form asked for contact details only.
              </p>
            ) : (
              <dl className="flex flex-col gap-6">
                {applicant.answers.map((answer) => (
                  <div key={answer.questionId} className="flex flex-col gap-1.5">
                    <dt className="text-text-secondary text-meta font-medium">
                      {answer.label}
                    </dt>
                    <dd className="text-text-primary">
                      {answer.file ? (
                        <a
                          href={`/api/files/${answer.file.id}`}
                          className="text-info-text inline-flex items-center gap-2 underline underline-offset-4"
                        >
                          <Download
                            aria-hidden
                            className="size-4"
                            strokeWidth={1.5}
                          />
                          {answer.file.name}
                          <span className="text-text-secondary text-meta">
                            {formatFileSize(answer.file.sizeBytes)}
                          </span>
                        </a>
                      ) : answer.values.length > 0 ? (
                        <ul className="list-inside list-disc">
                          {answer.values.map((value) => (
                            <li key={value}>{value}</li>
                          ))}
                        </ul>
                      ) : answer.value ? (
                        <p className="max-w-prose whitespace-pre-wrap">
                          {answer.value}
                        </p>
                      ) : (
                        <span className="text-text-secondary">
                          Not answered
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="py-2">
              <ApplicantActions
                applicationId={applicant.id}
                stage={applicant.stage}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-4 py-2">
              <h2 className="text-h3 text-brand-brown font-semibold">
                Internal notes
              </h2>

              {applicant.notes.length === 0 ? (
                <p className="text-text-secondary">
                  No notes yet.
                </p>
              ) : (
                <ol className="flex flex-col gap-4">
                  {applicant.notes.map((note) => (
                    <li key={note.id} className="flex flex-col gap-1">
                      <p className="text-text-primary whitespace-pre-wrap">
                        {note.body}
                      </p>
                      <p className="text-text-secondary text-meta">
                        {note.authorName} ·{" "}
                        {formatDateTime(note.createdAt, timeZone)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

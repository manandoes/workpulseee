import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Plus } from "lucide-react";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageRecruitment } from "@/lib/permissions";
import { loadHiringForms } from "@/lib/recruitment-data";
import { loadFormsConnection } from "@/lib/google-forms-data";
import { googleFormsConfigured } from "@/lib/google-forms";
import { EmptyState, PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { FormStatusBadge } from "@/components/recruitment/status-badges";
import { GoogleConnectionCard } from "@/components/recruitment/google-connection-card";

export const metadata: Metadata = { title: "Hiring" };

/**
 * Every opening the company has run, live ones first (Plan: hiring).
 *
 * Live forms sort ahead of drafts and closed ones because the question this
 * page answers on most visits is "who has applied since yesterday", not "what
 * did we post last spring".
 */
export default async function HiringPage({
  searchParams,
}: PageProps<"/hiring">) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canManageRecruitment(actor)) redirect("/dashboard");

  const [forms, connection, company, params] = await Promise.all([
    loadHiringForms(actor),
    loadFormsConnection(actor.companyId),
    db.company.findUniqueOrThrow({
      where: { id: actor.companyId },
      select: { slug: true },
    }),
    searchParams,
  ]);

  const live = forms.filter((form) => form.status === "Live");
  const past = forms.filter((form) => form.status !== "Live");

  return (
    <>
      <PageHeader
        title="Hiring"
        description="Build an application form, publish it on your own careers URL or as a Google Form, and work through everyone who applies."
        action={
          <Button asChild>
            <Link href="/hiring/new">
              <Plus aria-hidden className="size-4" strokeWidth={1.5} />
              New form
            </Link>
          </Button>
        }
      />

      <GoogleConnectionCard
        connection={connection}
        configured={googleFormsConfigured()}
        justConnected={params.connected === "1"}
        error={typeof params.error === "string" ? params.error : null}
      />

      {forms.length === 0 ? (
        <EmptyState
          title="No openings yet"
          description="A recruitment form collects a candidate's name, email and phone, plus whatever else you ask. Build one and publish it when you are ready."
          action={
            <Button asChild>
              <Link href="/hiring/new">Build your first form</Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-10">
          <FormSection
            heading="Live"
            emptyNote="Nothing is accepting applications right now."
            forms={live}
            companySlug={company.slug}
          />
          <FormSection
            heading="Drafts and past openings"
            emptyNote="Everything you have built is live."
            forms={past}
            companySlug={company.slug}
          />
        </div>
      )}
    </>
  );
}

function FormSection({
  heading,
  emptyNote,
  forms,
  companySlug,
}: {
  heading: string;
  emptyNote: string;
  forms: Awaited<ReturnType<typeof loadHiringForms>>;
  companySlug: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-h2 text-brand-brown font-semibold">{heading}</h2>

      {forms.length === 0 ? (
        <p className="text-text-secondary">{emptyNote}</p>
      ) : (
        <ul className="border-border divide-border divide-y rounded-xl border">
          {forms.map((form) => (
            <li key={form.id}>
              <Link
                href={`/hiring/${form.id}`}
                className="hover:bg-surface-muted focus-visible:ring-brand-yellow flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-brand-brown truncate font-medium">
                      {form.title}
                    </span>
                    <FormStatusBadge status={form.status} />
                  </div>
                  <span className="text-text-secondary text-meta truncate">
                    {[form.team, form.location].filter(Boolean).join(" · ") ||
                      "No team or location set"}
                    {" — "}
                    {form.destination === "GoogleForm"
                      ? "Google Form"
                      : `/${companySlug}/recruitmentform/${form.slug}`}
                  </span>
                </div>

                <div className="flex items-center gap-6">
                  <Count
                    value={form.applicantCount}
                    label={form.applicantCount === 1 ? "applicant" : "applicants"}
                  />
                  <Count
                    value={form.newApplicantCount}
                    label="unreviewed"
                    // The only number on this page worth colouring: it is the
                    // one that means someone has work waiting.
                    highlight={form.newApplicantCount > 0}
                  />
                  <ArrowRight
                    aria-hidden
                    className="text-text-secondary size-4"
                    strokeWidth={1.5}
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Count({
  value,
  label,
  highlight = false,
}: {
  value: number;
  label: string;
  highlight?: boolean;
}) {
  return (
    <span className="flex flex-col items-end">
      <span
        className={
          highlight
            ? "text-brand-brown font-semibold"
            : "text-text-secondary font-medium"
        }
      >
        {value}
      </span>
      <span className="text-text-secondary text-meta">{label}</span>
    </span>
  );
}

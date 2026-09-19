import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  loadPublicCompany,
  loadPublicForm,
} from "@/lib/recruitment-public-data";
import { closedReason, isAcceptingApplications } from "@/lib/recruitment";
import { ApplicationFile } from "@/components/recruitment/application-file";
import { formatDate } from "@/lib/format";

const EMPLOYMENT_LABELS: Record<string, string> = {
  FullTime: "Full time",
  PartTime: "Part time",
  Contract: "Contract",
  Intern: "Internship",
};

export async function generateMetadata({
  params,
}: PageProps<"/[companySlug]/recruitmentform/[formSlug]">): Promise<Metadata> {
  const { companySlug, formSlug } = await params;
  const company = await loadPublicCompany(companySlug);
  // `title.absolute` bypasses the root layout's "%s — WorkPulse" template —
  // a tenant's public careers page shouldn't advertise the vendor in the tab.
  if (!company) return { title: { absolute: "Not found" } };

  const form = await loadPublicForm(company.id, formSlug);
  if (!form) return { title: { absolute: `Openings — ${company.name}` } };

  return {
    title: { absolute: `${form.title} — ${company.name}` },
    description: form.summary ?? `Apply for ${form.title} at ${company.name}.`,
  };
}

/**
 * The application file (Plan: hiring; direction contract "The Application
 * File").
 *
 * The header states the role and its facts, then the file itself opens
 * immediately — there is no landing section to scroll past. A candidate who
 * followed this link has already decided to look; making them hunt for the
 * first question is the category default this page refuses.
 */
export default async function RecruitmentFormPage({
  params,
}: PageProps<"/[companySlug]/recruitmentform/[formSlug]">) {
  const { companySlug, formSlug } = await params;

  const company = await loadPublicCompany(companySlug);
  if (!company) notFound();

  const form = await loadPublicForm(company.id, formSlug);
  if (!form) notFound();

  // A Google-hosted opening answers somewhere else entirely; sending the
  // candidate there is the whole point of that destination.
  if (form.destination === "GoogleForm" && form.googleResponderUrl) {
    redirect(form.googleResponderUrl);
  }

  const facts = [
    form.team ? { label: "Team", value: form.team } : null,
    form.location ? { label: "Location", value: form.location } : null,
    form.employmentType
      ? { label: "Type", value: EMPLOYMENT_LABELS[form.employmentType]! }
      : null,
    form.closesAt
      ? {
          label: "Closes",
          value: formatDate(form.closesAt),
        }
      : null,
  ].filter((fact): fact is { label: string; value: string } => fact !== null);

  const closed = closedReason(form);

  return (
    <main id="main" className="flex flex-1 flex-col">
      <header className="border-b border-(--file-rule)">
        {/*
          A letterhead, not an eyebrow over the heading: the company owns the
          sheet, so its name sits on its own ruled line above the document
          rather than as a label the title has to carry.
        */}
        <div className="border-b border-(--file-rule)">
          <p className="text-(--file-ink) mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-3 text-sm font-medium lg:px-8">
            <span
              aria-hidden
              className="h-3.5 w-1 rounded-full bg-(--file-accent)"
            />
            {company.name}
          </p>
        </div>

        <div className="mx-auto w-full max-w-6xl px-4 pt-10 pb-8 lg:px-8">
          <h1 className="text-(--file-ink) text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {form.title}
          </h1>
          {form.summary ? (
            <p className="text-(--file-muted) mt-3 max-w-prose text-lg">
              {form.summary}
            </p>
          ) : null}
        </div>

        {facts.length > 0 ? (
          <div className="border-t border-(--file-rule)">
            <dl className="mx-auto flex w-full max-w-6xl flex-wrap gap-x-12 gap-y-4 px-4 py-4 lg:px-8">
              {facts.map((fact) => (
                <div key={fact.label} className="flex flex-col gap-0.5">
                  <dt className="text-(--file-muted) text-xs font-medium tracking-wide uppercase">
                    {fact.label}
                  </dt>
                  <dd className="text-(--file-ink)">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </header>

      {closed || !isAcceptingApplications(form) ? (
        <section className="mx-auto w-full max-w-2xl px-4 py-24 text-center">
          <h2 className="text-(--file-ink) text-2xl font-semibold">
            {closed ?? "This opening is closed."}
          </h2>
          <p className="text-(--file-muted) mx-auto mt-3 max-w-prose">
            {company.name} is no longer taking applications for this role. Any
            application already sent is still with them.
          </p>
        </section>
      ) : (
        <div className="pt-10">
          <ApplicationFile
            form={form}
            companyName={company.name}
            submitUrl={`/api/public/recruitment/${companySlug}/${formSlug}`}
          />
        </div>
      )}
    </main>
  );
}

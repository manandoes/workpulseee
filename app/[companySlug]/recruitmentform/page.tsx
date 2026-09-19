import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import {
  loadPublicCompany,
  loadPublicForms,
} from "@/lib/recruitment-public-data";
import { isAcceptingApplications } from "@/lib/recruitment";

export async function generateMetadata({
  params,
}: PageProps<"/[companySlug]/recruitmentform">): Promise<Metadata> {
  const { companySlug } = await params;
  const company = await loadPublicCompany(companySlug);

  // `title.absolute` bypasses the root layout's "%s — WorkPulse" template —
  // a tenant's public careers page shouldn't advertise the vendor in the tab.
  return company
    ? {
        title: { absolute: `Open roles — ${company.name}` },
        description: `Apply to work at ${company.name}.`,
      }
    : { title: { absolute: "Not found" } };
}

/**
 * The company's openings (Plan: hiring).
 *
 * With exactly one open role this redirects straight into it: the URL a
 * company hands out is `/{slug}/recruitmentform`, and an index page holding a
 * single link is a click charged for nothing. With several, it lists them —
 * and closed ones stay listed so an old link explains itself rather than
 * 404ing, which reads as a broken company.
 */
export default async function RecruitmentIndexPage({
  params,
}: PageProps<"/[companySlug]/recruitmentform">) {
  const { companySlug } = await params;

  const company = await loadPublicCompany(companySlug);
  if (!company) notFound();

  const forms = await loadPublicForms(company.id);
  const open = forms.filter((form) => isAcceptingApplications(form));

  if (open.length === 1) {
    redirect(`/${companySlug}/recruitmentform/${open[0]!.slug}`);
  }

  return (
    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-16 lg:px-8">
      <p className="text-(--file-muted) text-sm font-medium">
        {company.name}
      </p>
      <h1 className="text-(--file-ink) mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
        Open roles
      </h1>

      {forms.length === 0 ? (
        <p className="text-(--file-muted) mt-6 max-w-prose text-lg">
          {company.name} is not hiring through this page right now. Nothing here
          is out of date — there is simply nothing open.
        </p>
      ) : (
        <ul className="mt-10 border-t border-(--file-rule)">
          {forms.map((form) => {
            const accepting = isAcceptingApplications(form);

            return (
              <li
                key={form.id}
                className="border-b border-(--file-rule)"
              >
                <Link
                  href={`/${companySlug}/recruitmentform/${form.slug}`}
                  className="group flex flex-wrap items-center gap-x-6 gap-y-2 py-6 focus-visible:ring-2 focus-visible:ring-(--file-accent) focus-visible:outline-none"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-(--file-ink) text-xl font-medium group-hover:underline group-hover:underline-offset-4">
                      {form.title}
                    </span>
                    <span className="text-(--file-muted)">
                      {[form.team, form.location].filter(Boolean).join(" · ") ||
                        "Remote or on site"}
                    </span>
                  </div>

                  {accepting ? (
                    <ArrowRight
                      aria-hidden
                      className="text-(--file-muted) size-5 transition-transform group-hover:translate-x-1"
                      strokeWidth={1.5}
                    />
                  ) : (
                    <span className="text-(--file-muted) text-sm">
                      Closed
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

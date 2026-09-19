import { notFound } from "next/navigation";
import { loadPublicCompany } from "@/lib/recruitment-public-data";
import { readableTextOn } from "@/lib/recruitment";

/**
 * The public applicant shell (Plan: hiring).
 *
 * Outside both the dashboard and the marketing site on purpose: this page is
 * the *company's*, not WorkPulse's, so it carries no product navigation a
 * candidate has no use for and no sign-in prompt for an account they do not
 * have.
 *
 * The company's own `brandColor` is resolved here and published as the
 * `--file-*` custom properties every child reads. The foreground on that
 * colour is computed (`readableTextOn`) rather than assumed: an Owner picks
 * the brand colour from a plain colour input, and a dark brand with dark text
 * on it would be unreadable on the one page WorkPulse shows to strangers.
 */
export default async function RecruitmentLayout({
  children,
  params,
}: LayoutProps<"/[companySlug]/recruitmentform">) {
  const { companySlug } = await params;
  const company = await loadPublicCompany(companySlug);
  if (!company) notFound();

  return (
    <div
      style={
        {
          "--file-paper": "#FFFBF2",
          // Headings keep Design.md § 3's `brand-brown`; body sits a step
          // darker. One ink for both would flatten the head/body step the
          // whole document reads by.
          "--file-head": "#4A3A2C",
          "--file-ink": "#2E2317",
          // Design.md's `text-secondary` (#8A7A66) measures ~4.2:1 on this
          // cream and misses the AA floor; this is the same hue darkened to
          // ~5.3:1, which the one page strangers read has to clear.
          "--file-muted": "#7A6653",
          "--file-rule": "#E9DFCB",
          "--file-required": "#B03A3A",
          "--file-accent": company.brandColor,
          "--file-on-accent": readableTextOn(company.brandColor),
          // The surfaces the page does not draw still belong to it: the caret,
          // and the form-control palette the browser picks from `color-scheme`.
          caretColor: "var(--file-head)",
          colorScheme: "light",
        } as React.CSSProperties
      }
      className="flex min-h-full flex-1 flex-col bg-(--file-paper) selection:bg-(--file-accent) selection:text-(--file-on-accent)"
    >
      {children}

      <footer className="border-t border-(--file-rule) py-6">
        <p className="text-(--file-muted) mx-auto w-full max-w-6xl px-4 text-xs lg:px-8">
          {company.name} collects these answers to consider your application.
          Hiring runs on WorkPulse.
        </p>
      </footer>
    </div>
  );
}

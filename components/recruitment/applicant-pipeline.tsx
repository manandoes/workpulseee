"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "cn";
import { formatDate } from "@/lib/format";
import { APPLICATION_STAGES } from "@/lib/recruitment";
import { StageBadge } from "@/components/recruitment/status-badges";
import type { ApplicationStage } from "@/lib/generated/prisma/enums";
import type { ApplicantListItem } from "@/lib/recruitment-data";

/**
 * Everyone who applied to one opening (Plan: hiring).
 *
 * A table, not a drag-and-drop board. A board looks like a pipeline but makes
 * the two things reviewers actually do — read a file, and compare candidates —
 * harder than a scannable list does, and it cannot show a phone number, a
 * submission date and a stage at once on a laptop screen.
 *
 * Filtering is client-side because the whole list is already here: a single
 * opening's applicants is tens of rows, not thousands, and a round trip per
 * filter click would be slower for no gain.
 */
export function ApplicantPipeline({
  formId,
  applicants,
}: {
  formId: string;
  applicants: ApplicantListItem[];
}) {
  const [stage, setStage] = useState<ApplicationStage | "All">("All");

  const counts = APPLICATION_STAGES.reduce<Record<string, number>>(
    (totals, value) => {
      totals[value] = applicants.filter(
        (applicant) => applicant.stage === value
      ).length;
      return totals;
    },
    {}
  );

  const shown =
    stage === "All"
      ? applicants
      : applicants.filter((applicant) => applicant.stage === stage);

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Filter by stage" className="flex flex-wrap gap-1">
        <FilterTab
          active={stage === "All"}
          onClick={() => setStage("All")}
          label="Everyone"
          count={applicants.length}
        />
        {APPLICATION_STAGES.map((value) => (
          <FilterTab
            key={value}
            active={stage === value}
            onClick={() => setStage(value)}
            label={value}
            count={counts[value] ?? 0}
          />
        ))}
      </nav>

      {shown.length === 0 ? (
        <p className="text-text-secondary border-border rounded-xl border border-dashed px-5 py-10 text-center">
          {applicants.length === 0
            ? "Nobody has applied yet. Share the link above."
            : "Nobody is at this stage."}
        </p>
      ) : (
        <div className="border-border overflow-x-auto rounded-xl border">
          <table className="w-full text-left">
            <thead className="bg-surface-muted text-text-secondary text-meta">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Applicant
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Contact
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Stage
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Applied
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {shown.map((applicant) => (
                <tr key={applicant.id} className="hover:bg-surface-muted">
                  <td className="px-4 py-3">
                    <Link
                      href={`/hiring/${formId}/applicants/${applicant.id}`}
                      className="text-brand-brown focus-visible:ring-brand-yellow rounded font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                    >
                      {applicant.fullName}
                    </Link>
                    {applicant.source === "GoogleForm" ? (
                      <span className="text-text-secondary text-meta block">
                        via Google Forms
                      </span>
                    ) : null}
                  </td>
                  <td className="text-text-secondary px-4 py-3">
                    <a
                      href={`mailto:${applicant.email}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {applicant.email}
                    </a>
                    {applicant.phone ? (
                      <span className="text-meta block">{applicant.phone}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <StageBadge stage={applicant.stage} />
                  </td>
                  <td className="text-text-secondary px-4 py-3">
                    {formatDate(applicant.submittedAt)}
                  </td>
                  <td className="text-text-secondary px-4 py-3">
                    {applicant.noteCount || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "focus-visible:ring-brand-yellow rounded-lg px-3 py-1.5 font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
        active
          ? "bg-brand-yellow-light text-brand-brown"
          : "text-text-secondary hover:text-brand-brown hover:bg-surface-muted"
      )}
    >
      {label}{" "}
      <span className={active ? "text-brand-brown" : "text-text-secondary"}>
        {count}
      </span>
    </button>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  loadFeedback,
  loadGoals,
  loadPeriodScore,
  loadPerformanceBreakdown,
} from "@/lib/performance-data";
import { performancePeriodLabel, resolvePeriod } from "@/lib/performance";
import { performancePeriodSchema } from "@/lib/validations/performance";
import { formatDate } from "@/lib/format";
import { resolveRequestTimeZone } from "@/lib/timezone-request";
import { PerformanceScoreBadge } from "@/components/performance/score-badge";
import { BreakdownTiles } from "@/components/performance/breakdown-tiles";
import { DayBreakdownPanel } from "@/components/performance/day-breakdown-panel";
import { GoalList } from "@/components/performance/goal-views";
import { FeedbackList } from "@/components/performance/feedback-views";
import { PrintButton } from "@/components/performance/print-button";

export const metadata: Metadata = { title: "My Growth report" };

/**
 * A single-column, print-oriented version of `/my-space/growth` (Plan:
 * growth page parity) — the same report `/performance/[memberKind]/
 * [memberId]/report` gives an admin reviewing someone else, scoped to the
 * signed-in employee directly rather than taking an id param.
 */
export default async function MyGrowthReportPage({
  searchParams,
}: PageProps<"/my-space/growth/report">) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.accountType !== "employee") redirect("/dashboard");

  const { period: preset = "all", from, to } = performancePeriodSchema.parse(
    await searchParams
  );
  const now = new Date();
  const period = resolvePeriod(preset, from, to, now);
  const subject = { kind: "employee" as const, id: actor.id };
  const timeZone = await resolveRequestTimeZone();

  const [employee, periodScore, breakdown, goals, feedback] = await Promise.all([
    db.employee.findUniqueOrThrow({
      where: { id: actor.id },
      select: { fullName: true, jobRole: true },
    }),
    loadPeriodScore(actor.companyId, subject, period),
    loadPerformanceBreakdown(actor.companyId, subject, period, now, timeZone),
    loadGoals(actor.companyId, subject),
    loadFeedback(actor.companyId, subject),
  ]);

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-8 print:max-w-none">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 text-brand-brown font-semibold">
            {employee.fullName}
          </h1>
          {employee.jobRole ? (
            <p className="text-text-secondary">{employee.jobRole}</p>
          ) : null}
          <p className="text-text-secondary text-meta mt-1">
            Performance report · {performancePeriodLabel(preset)}
            {period
              ? ` (${formatDate(period.from)} – ${formatDate(period.to)})`
              : ""}
            {" · "}Generated {formatDate(now)}
          </p>
        </div>
        <PrintButton />
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-h3 text-brand-brown font-semibold">
          Overall score
        </h2>
        <PerformanceScoreBadge
          score={periodScore}
          emptyLabel={
            period ? "Nothing to score in this period" : "Not yet scored"
          }
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h3 text-brand-brown font-semibold">
          Breakdown by parameter
        </h2>
        <BreakdownTiles breakdown={breakdown} />
        <DayBreakdownPanel days={breakdown.days} defaultOpen />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h3 text-brand-brown font-semibold">Goals</h2>
        <GoalList subject={subject} goals={goals} mayDecide={false} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h3 text-brand-brown font-semibold">Feedback</h2>
        <FeedbackList feedback={feedback} />
      </section>
    </div>
  );
}

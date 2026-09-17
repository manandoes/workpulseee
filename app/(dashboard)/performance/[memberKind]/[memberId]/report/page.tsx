import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import {
  loadFeedback,
  loadGoals,
  loadPeriodScore,
  loadPerformanceBreakdown,
} from "@/lib/performance-data";
import {
  performancePeriodLabel,
  resolvePeriod,
  type PerformancePeriodPreset,
} from "@/lib/performance";
import { performancePeriodSchema } from "@/lib/validations/performance";
import { formatDate } from "@/lib/format";
import { canViewPerformance, isCompanyAdmin } from "@/lib/permissions";
import { PerformanceScoreBadge } from "@/components/performance/score-badge";
import { BreakdownTiles } from "@/components/performance/breakdown-tiles";
import { GoalList } from "@/components/performance/goal-views";
import { FeedbackList } from "@/components/performance/feedback-views";
import { PrintButton } from "@/components/performance/print-button";

export const metadata: Metadata = { title: "Performance report — WorkPulse" };

/**
 * A single-column, print-oriented version of `/performance/[memberKind]/
 * [memberId]` (Phases.md Phase 8 extension), widened to company accounts too
 * (Plan: performance for all company accounts) — everything an admin
 * reviews about one person's performance in one page, so the browser's
 * "Save as PDF" print dialog (`PrintButton`) produces a reviewable document.
 * `app/(dashboard)/layout.tsx` hides the sidebar/header with `print:hidden`
 * so only this content prints.
 *
 * Same guard as the page it summarises — re-checked here rather than trusted
 * from a link, the same defence-in-depth every `[id]`-shaped route in this
 * app applies (Rules.md section 3).
 */
export default async function PerformanceReportPage({
  params,
  searchParams,
}: PageProps<"/performance/[memberKind]/[memberId]/report">) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.accountType !== "company") redirect("/my-space");

  const { memberKind, memberId } = await params;
  if (memberKind !== "employee" && memberKind !== "account") notFound();

  const { period: preset = "all", from, to } = performancePeriodSchema.parse(
    await searchParams
  );
  const now = new Date();
  const period = resolvePeriod(preset, from, to, now);

  if (memberKind === "account") {
    const account = await db.companyAccount.findFirst({
      where: { id: memberId, companyId: actor.companyId, deletedAt: null },
      select: { id: true, fullName: true, role: true },
    });
    if (!account) notFound();
    if (!isCompanyAdmin(actor) && actor.id !== account.id) notFound();

    const subject = { kind: "account" as const, id: account.id };
    const [periodScore, breakdown, goals, feedback] = await Promise.all([
      loadPeriodScore(actor.companyId, subject, period),
      loadPerformanceBreakdown(actor.companyId, subject, period, now),
      loadGoals(actor.companyId, subject),
      loadFeedback(actor.companyId, subject),
    ]);

    return (
      <ReportBody
        name={account.fullName}
        role={account.role}
        preset={preset}
        period={period}
        now={now}
        periodScore={periodScore}
        breakdown={breakdown}
        subject={subject}
        goals={goals}
        feedback={feedback}
      />
    );
  }

  const employee = await db.employee.findFirst({
    where: scopedWhere(actor, { id: memberId }),
    select: {
      id: true,
      fullName: true,
      jobRole: true,
      managerId: true,
      managerAccountId: true,
    },
  });

  if (!employee) notFound();
  if (!canViewPerformance(actor, employee)) notFound();

  const subject = { kind: "employee" as const, id: employee.id };
  const [periodScore, breakdown, goals, feedback] = await Promise.all([
    loadPeriodScore(actor.companyId, subject, period),
    loadPerformanceBreakdown(actor.companyId, subject, period, now),
    loadGoals(actor.companyId, subject),
    loadFeedback(actor.companyId, subject),
  ]);

  return (
    <ReportBody
      name={employee.fullName}
      role={employee.jobRole}
      preset={preset}
      period={period}
      now={now}
      periodScore={periodScore}
      breakdown={breakdown}
      subject={subject}
      goals={goals}
      feedback={feedback}
    />
  );
}

function ReportBody({
  name,
  role,
  preset,
  period,
  now,
  periodScore,
  breakdown,
  subject,
  goals,
  feedback,
}: {
  name: string;
  role: string | null;
  preset: PerformancePeriodPreset;
  period: ReturnType<typeof resolvePeriod>;
  now: Date;
  periodScore: number | null;
  breakdown: Awaited<ReturnType<typeof loadPerformanceBreakdown>>;
  subject: Parameters<typeof GoalList>[0]["subject"];
  goals: Awaited<ReturnType<typeof loadGoals>>;
  feedback: Awaited<ReturnType<typeof loadFeedback>>;
}) {
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-8 print:max-w-none">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 text-brand-brown font-semibold">{name}</h1>
          {role ? <p className="text-text-secondary">{role}</p> : null}
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

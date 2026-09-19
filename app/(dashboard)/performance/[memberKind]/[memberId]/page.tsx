import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileDown } from "lucide-react";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import {
  loadFeedback,
  loadGoals,
  loadPerformanceBreakdown,
  loadPerformanceHistory,
  loadPeriodScore,
} from "@/lib/performance-data";
import { resolvePeriod } from "@/lib/performance";
import { performancePeriodSchema } from "@/lib/validations/performance";
import { canEditEmployee, canViewPerformance, isCompanyAdmin } from "@/lib/permissions";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PeriodFilter } from "@/components/performance/period-filter";
import { PeriodScore } from "@/components/performance/period-score";
import { ScoreHistoryChart } from "@/components/performance/score-history-chart";
import { ScoreTrend } from "@/components/performance/score-trend";
import { BreakdownTiles } from "@/components/performance/breakdown-tiles";
import { DayBreakdownPanel } from "@/components/performance/day-breakdown-panel";
import { resolveRequestTimeZone } from "@/lib/timezone-request";
import { GoalList } from "@/components/performance/goal-views";
import { GoalForm } from "@/components/performance/goal-form";
import { FeedbackList } from "@/components/performance/feedback-views";
import { FeedbackForm } from "@/components/performance/feedback-form";

export const metadata: Metadata = { title: "Performance" };

/**
 * One subject's performance page (Phases.md Phase 8): score history, goals,
 * and manager feedback — widened to company accounts too (Plan: performance
 * for all company accounts), the same `[memberKind]/[memberId]` URL shape
 * `/squad/[memberKind]/[memberId]` already established.
 *
 * The Manager-scoped queue already filters an employee out of a Manager's
 * list, but direct navigation could still reach another manager's report by
 * id — `canViewPerformance` is re-checked here and a mismatch reads as
 * "not found", the same guard `/requests/[id]` uses (Rules.md section 3). A
 * company account has no manager relationship to check, so it follows the
 * same Owner/Admin-or-self split Squad's account branch already uses for its
 * Attendance panel.
 */
export default async function PerformanceMemberPage({
  params,
  searchParams,
}: PageProps<"/performance/[memberKind]/[memberId]">) {
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
  const timeZone = await resolveRequestTimeZone();

  const reportQuery = new URLSearchParams({ period: preset });
  if (from) reportQuery.set("from", from);
  if (to) reportQuery.set("to", to);

  if (memberKind === "account") {
    const account = await db.companyAccount.findFirst({
      where: { id: memberId, companyId: actor.companyId, deletedAt: null },
      select: { id: true, fullName: true, role: true },
    });
    if (!account) notFound();

    const isSelf = actor.id === account.id;
    const mayDecide = isCompanyAdmin(actor);
    if (!mayDecide && !isSelf) notFound();

    const subject = { kind: "account" as const, id: account.id };
    const [periodScore, history, breakdown, goals, feedback] = await Promise.all([
      loadPeriodScore(actor.companyId, subject, period),
      loadPerformanceHistory(actor.companyId, subject, period),
      loadPerformanceBreakdown(actor.companyId, subject, period, now, timeZone),
      loadGoals(actor.companyId, subject),
      loadFeedback(actor.companyId, subject),
    ]);

    const chartHistory = [...history].reverse().map((point) => ({
      score: Number(point.score),
      computedAt: point.computedAt,
    }));

    return (
      <>
        <PageHeader
          title={account.fullName}
          description={account.role}
          action={
            <div className="flex items-center gap-4">
              <Link
                href="/squad"
                className="text-brand-brown inline-flex items-center gap-1.5 text-sm underline-offset-4 hover:underline"
              >
                <ArrowLeft aria-hidden className="size-4" />
                Back to squad
              </Link>
              <Button asChild variant="outline">
                <Link href={`/performance/account/${account.id}/report?${reportQuery}`}>
                  <FileDown aria-hidden className="size-4" />
                  Download report
                </Link>
              </Button>
            </div>
          }
        />

        <Card>
          <CardContent className="flex flex-col gap-4 py-2">
            <h2 className="text-h3 text-brand-brown font-semibold">Score</h2>
            <PeriodFilter
              basePath={`/performance/account/${account.id}`}
              period={preset}
              from={from ?? ""}
              to={to ?? ""}
            />
            <PeriodScore score={periodScore} period={period} />
            <ScoreTrend history={chartHistory} />
            <ScoreHistoryChart history={chartHistory} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-4 py-2">
            <h2 className="text-h3 text-brand-brown font-semibold">
              Breakdown
            </h2>
            <BreakdownTiles breakdown={breakdown} />
            <DayBreakdownPanel days={breakdown.days} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-4 py-2">
            <h2 className="text-h3 text-brand-brown font-semibold">Goals</h2>
            <GoalList subject={subject} goals={goals} mayDecide={mayDecide} />
            {mayDecide ? <GoalForm subject={subject} /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-4 py-2">
            <h2 className="text-h3 text-brand-brown font-semibold">
              Feedback
            </h2>
            <FeedbackList feedback={feedback} />
            {mayDecide ? <FeedbackForm subject={subject} /> : null}
          </CardContent>
        </Card>
      </>
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

  const mayDecide = canEditEmployee(actor, employee);
  const subject = { kind: "employee" as const, id: employee.id };

  const [periodScore, history, breakdown, goals, feedback] = await Promise.all([
    loadPeriodScore(actor.companyId, subject, period),
    loadPerformanceHistory(actor.companyId, subject, period),
    loadPerformanceBreakdown(actor.companyId, subject, period, now, timeZone),
    loadGoals(actor.companyId, subject),
    loadFeedback(actor.companyId, subject),
  ]);

  const chartHistory = [...history].reverse().map((point) => ({
    score: Number(point.score),
    computedAt: point.computedAt,
  }));

  return (
    <>
      <PageHeader
        title={employee.fullName}
        description={employee.jobRole ?? undefined}
        action={
          <div className="flex items-center gap-4">
            <Link
              href="/performance"
              className="text-brand-brown inline-flex items-center gap-1.5 text-sm underline-offset-4 hover:underline"
            >
              <ArrowLeft aria-hidden className="size-4" />
              Back to performance
            </Link>
            <Button asChild variant="outline">
              <Link href={`/performance/employee/${employee.id}/report?${reportQuery}`}>
                <FileDown aria-hidden className="size-4" />
                Download report
              </Link>
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-4 py-2">
          <h2 className="text-h3 text-brand-brown font-semibold">Score</h2>
          <PeriodFilter
            basePath={`/performance/employee/${employee.id}`}
            period={preset}
            from={from ?? ""}
            to={to ?? ""}
          />
          <PeriodScore score={periodScore} period={period} />
          <ScoreTrend history={chartHistory} />
          <ScoreHistoryChart history={chartHistory} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 py-2">
          <h2 className="text-h3 text-brand-brown font-semibold">
            Breakdown
          </h2>
          <BreakdownTiles breakdown={breakdown} />
          <DayBreakdownPanel days={breakdown.days} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 py-2">
          <h2 className="text-h3 text-brand-brown font-semibold">Goals</h2>
          <GoalList subject={subject} goals={goals} mayDecide={mayDecide} />
          {mayDecide ? <GoalForm subject={subject} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 py-2">
          <h2 className="text-h3 text-brand-brown font-semibold">Feedback</h2>
          <FeedbackList feedback={feedback} />
          {mayDecide ? <FeedbackForm subject={subject} /> : null}
        </CardContent>
      </Card>
    </>
  );
}

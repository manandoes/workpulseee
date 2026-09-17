import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileDown } from "lucide-react";
import { getActor } from "@/lib/auth";
import {
  loadFeedback,
  loadGoals,
  loadPerformanceBreakdown,
  loadPerformanceHistory,
  loadPeriodScore,
} from "@/lib/performance-data";
import { resolvePeriod } from "@/lib/performance";
import { performancePeriodSchema } from "@/lib/validations/performance";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PeriodFilter } from "@/components/performance/period-filter";
import { PeriodScore } from "@/components/performance/period-score";
import { ScoreHistoryChart } from "@/components/performance/score-history-chart";
import { BreakdownTiles } from "@/components/performance/breakdown-tiles";
import { GoalList } from "@/components/performance/goal-views";
import { FeedbackList } from "@/components/performance/feedback-views";

export const metadata: Metadata = { title: "My Growth — WorkPulse" };

/**
 * An employee's own performance page (PRD.md section 6.9 — "My Growth":
 * goals, performance, feedback, achievements).
 *
 * Self-view only, the same pattern as `/my-space/requests` — goals and
 * feedback are manager-owned, so this is read-only with no forms.
 *
 * Shows the same parameter breakdown the admin performance view shows for
 * this same employee (Plan: growth page parity) via `loadPerformanceBreakdown`
 * — the same `BreakdownTiles` card `/performance/[memberKind]/[memberId]`
 * renders, just scoped to the signed-in employee directly.
 */
export default async function MyGrowthPage({
  searchParams,
}: PageProps<"/my-space/growth">) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.accountType !== "employee") redirect("/dashboard");

  const { period: preset = "all", from, to } = performancePeriodSchema.parse(
    await searchParams
  );
  const now = new Date();
  const period = resolvePeriod(preset, from, to, now);
  const subject = { kind: "employee" as const, id: actor.id };

  const reportQuery = new URLSearchParams({ period: preset });
  if (from) reportQuery.set("from", from);
  if (to) reportQuery.set("to", to);

  const [periodScore, history, breakdown, goals, feedback] = await Promise.all([
    loadPeriodScore(actor.companyId, subject, period),
    loadPerformanceHistory(actor.companyId, subject, period),
    loadPerformanceBreakdown(actor.companyId, subject, period, now),
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
        title="My Growth"
        description="Your performance score, goals and feedback."
        action={
          <Button asChild variant="outline">
            <Link href={`/my-space/growth/report?${reportQuery}`}>
              <FileDown aria-hidden className="size-4" />
              Download report
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-4 py-2">
          <h2 className="text-h3 text-brand-brown font-semibold">Score</h2>
          <PeriodFilter
            basePath="/my-space/growth"
            period={preset}
            from={from ?? ""}
            to={to ?? ""}
          />
          <PeriodScore score={periodScore} period={period} />
          <ScoreHistoryChart history={chartHistory} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 py-2">
          <h2 className="text-h3 text-brand-brown font-semibold">
            Breakdown
          </h2>
          <BreakdownTiles breakdown={breakdown} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 py-2">
          <h2 className="text-h3 text-brand-brown font-semibold">Goals</h2>
          <GoalList subject={subject} goals={goals} mayDecide={false} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 py-2">
          <h2 className="text-h3 text-brand-brown font-semibold">Feedback</h2>
          <FeedbackList feedback={feedback} />
        </CardContent>
      </Card>
    </>
  );
}

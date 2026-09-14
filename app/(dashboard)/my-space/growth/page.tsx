import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import {
  loadFeedback,
  loadGoals,
  loadPerformanceHistory,
  loadPeriodScore,
} from "@/lib/performance-data";
import { resolvePeriod } from "@/lib/performance";
import { performancePeriodSchema } from "@/lib/validations/performance";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PeriodFilter } from "@/components/performance/period-filter";
import { PeriodScore } from "@/components/performance/period-score";
import { ScoreHistoryChart } from "@/components/performance/score-history-chart";
import { GoalList } from "@/components/performance/goal-views";
import { FeedbackList } from "@/components/performance/feedback-views";

export const metadata: Metadata = { title: "My Growth — Talking Lens Media" };

/**
 * An employee's own performance page (PRD.md section 6.9 — "My Growth":
 * goals, performance, feedback, achievements).
 *
 * Self-view only, the same pattern as `/my-space/requests` — goals and
 * feedback are manager-owned, so this is read-only with no forms.
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
  const period = resolvePeriod(preset, from, to, new Date());

  const [periodScore, history, goals, feedback] = await Promise.all([
    loadPeriodScore(actor.companyId, actor.id, period),
    loadPerformanceHistory(actor.companyId, actor.id, period),
    loadGoals(actor.companyId, actor.id),
    loadFeedback(actor.companyId, actor.id),
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
          <h2 className="text-h3 text-brand-brown font-semibold">Goals</h2>
          <GoalList employeeId={actor.id} goals={goals} mayDecide={false} />
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

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import {
  loadFeedback,
  loadGoals,
  loadPerformanceHistory,
  loadPeriodScore,
} from "@/lib/performance-data";
import { resolvePeriod } from "@/lib/performance";
import { performancePeriodSchema } from "@/lib/validations/performance";
import { canEditEmployee, canViewPerformance } from "@/lib/permissions";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PeriodFilter } from "@/components/performance/period-filter";
import { PeriodScore } from "@/components/performance/period-score";
import { ScoreHistoryChart } from "@/components/performance/score-history-chart";
import { GoalList } from "@/components/performance/goal-views";
import { GoalForm } from "@/components/performance/goal-form";
import { FeedbackList } from "@/components/performance/feedback-views";
import { FeedbackForm } from "@/components/performance/feedback-form";

export const metadata: Metadata = { title: "Performance — Talking Lens Media" };

/**
 * One employee's performance page (Phases.md Phase 8): score history,
 * goals, and manager feedback.
 *
 * The Manager-scoped queue already filters an employee out of a Manager's
 * list, but direct navigation could still reach another manager's report by
 * id — `canViewPerformance` is re-checked here and a mismatch reads as
 * "not found", the same guard `/requests/[id]` uses (Rules.md section 3).
 */
export default async function EmployeePerformancePage({
  params,
  searchParams,
}: PageProps<"/performance/[id]">) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.accountType !== "company") redirect("/my-space");

  const { id } = await params;
  const { period: preset = "all", from, to } = performancePeriodSchema.parse(
    await searchParams
  );
  const period = resolvePeriod(preset, from, to, new Date());

  const employee = await db.employee.findFirst({
    where: scopedWhere(actor, { id }),
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

  const [periodScore, history, goals, feedback] = await Promise.all([
    loadPeriodScore(actor.companyId, employee.id, period),
    loadPerformanceHistory(actor.companyId, employee.id, period),
    loadGoals(actor.companyId, employee.id),
    loadFeedback(actor.companyId, employee.id),
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
          <Link
            href="/performance"
            className="text-brand-brown inline-flex items-center gap-1.5 text-sm underline-offset-4 hover:underline"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Back to performance
          </Link>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-4 py-2">
          <h2 className="text-h3 text-brand-brown font-semibold">Score</h2>
          <PeriodFilter
            basePath={`/performance/${employee.id}`}
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
          <GoalList
            employeeId={employee.id}
            goals={goals}
            mayDecide={mayDecide}
          />
          {mayDecide ? <GoalForm employeeId={employee.id} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 py-2">
          <h2 className="text-h3 text-brand-brown font-semibold">Feedback</h2>
          <FeedbackList feedback={feedback} />
          {mayDecide ? <FeedbackForm employeeId={employee.id} /> : null}
        </CardContent>
      </Card>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ListPlus } from "lucide-react";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  loadAlertsFor,
  loadDashboardMetrics,
  recalcCompanyAlerts,
  type LoadedAlert,
} from "@/lib/alert-data";
import { formatMoney, formatPercent } from "@/lib/format";
import { performanceBandLabel } from "@/lib/performance";
import {
  canViewTasks,
  DASHBOARD_MODE_COOKIE,
  type DashboardMode,
} from "@/lib/permissions";
import { loadOpenBreak, loadOpenSession } from "@/lib/attendance-data";
import { PageHeader } from "@/components/dashboard/page-header";
import { MetricTile } from "@/components/dashboard/metric-tile";
import { WorkloadHeatmap } from "@/components/dashboard/workload-heatmap";
import { AlertsPanel } from "@/components/dashboard/alerts-panel";
import { AttendanceWidget } from "@/components/attendance/attendance-widget";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Dashboard — WorkPulse" };

/**
 * Role-aware company dashboard (Phases.md Phase 9 — "Admin/Owner sees one
 * dashboard with live counts and a red/yellow/green exceptions panel"),
 * rewired for the HRMS/PMS toggle (Plan: dashboard-mode toggle).
 *
 * `loadDashboardMetrics` already splits its result into people tiles
 * (`activeEmployees`/`pendingApprovalsCount`/`reimbursementSummary`) and a
 * distinct `delivery` bucket — Owner/Admin/Manager get both, HR gets
 * `delivery: null` (Phases.md Phase 9's "HR sees people and requests only").
 * That existing split maps directly onto HRMS vs PMS: this page renders one
 * side or the other of the same already-scoped data rather than loading
 * anything differently per mode.
 *
 * Alerts follow the same split: `AgingApproval` is people-and-requests work
 * (HRMS), the other three types are delivery work (PMS) — `loadAlertsFor`
 * already narrows HR to `AgingApproval` alone, so an HR actor sees the same
 * alerts in HRMS mode they always did, and none in PMS mode (consistent with
 * their `delivery: null` metrics).
 */
const DELIVERY_ALERT_TYPES = new Set([
  "OverdueTask",
  "StalledProject",
  "OverloadedEmployee",
]);

function alertsForMode(alerts: LoadedAlert[], mode: DashboardMode) {
  return alerts.filter((alert) =>
    mode === "pms"
      ? DELIVERY_ALERT_TYPES.has(alert.type)
      : !DELIVERY_ALERT_TYPES.has(alert.type)
  );
}

const TITLES: Record<string, string> = {
  Owner: "Company dashboard",
  Admin: "Company dashboard",
  Manager: "Team dashboard",
  HR: "HR dashboard",
};

const DESCRIPTIONS: Record<DashboardMode, string> = {
  hrms: "People, requests, and approvals.",
  pms: "Projects, tasks, and delivery.",
};

export default async function DashboardPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.accountType !== "company") redirect("/my-space");

  const cookieStore = await cookies();
  const mode: DashboardMode =
    cookieStore.get(DASHBOARD_MODE_COOKIE)?.value === "pms" ? "pms" : "hrms";

  const [company] = await Promise.all([
    db.company.findUniqueOrThrow({
      where: { id: actor.companyId },
      select: { currency: true },
    }),
    recalcCompanyAlerts(actor.companyId),
  ]);

  const [metrics, alerts, openSession, openBreak] = await Promise.all([
    loadDashboardMetrics(actor),
    loadAlertsFor(actor),
    loadOpenSession(actor),
    loadOpenBreak(actor),
  ]);

  const visibleAlerts = alertsForMode(alerts, mode);

  return (
    <>
      <PageHeader
        title={TITLES[actor.role] ?? TITLES.Admin}
        description={DESCRIPTIONS[mode]}
        action={
          mode === "pms" && canViewTasks(actor) ? (
            <Button asChild>
              <Link href="/tasks/new">
                <ListPlus aria-hidden />
                New task
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Plan: attendance for all company accounts — the same clock-in/
          break control My Work gives an employee, so an Owner/Admin/Manager/
          HR's own attendance is tracked and reviewable on the same terms. */}
      <Card>
        <CardContent className="py-2">
          <AttendanceWidget
            openSession={
              openSession
                ? {
                    id: openSession.id,
                    clockInAt: openSession.clockInAt.toISOString(),
                  }
                : null
            }
            onBreak={openBreak !== null}
          />
        </CardContent>
      </Card>

      {mode === "hrms" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <MetricTile
            label="Active employees"
            value={String(metrics.activeEmployees)}
          />
          <MetricTile
            label="Pending approvals"
            value={String(metrics.pendingApprovalsCount)}
          />
          <MetricTile
            label="Reimbursements pending"
            value={formatMoney(
              metrics.reimbursementSummary.total,
              company.currency
            )}
            sublabel={`${metrics.reimbursementSummary.count} request${metrics.reimbursementSummary.count === 1 ? "" : "s"}`}
          />
        </div>
      ) : metrics.delivery ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <MetricTile
              label="Active projects"
              value={String(metrics.delivery.activeProjects)}
            />
            <MetricTile
              label="Task completion"
              value={formatPercent(metrics.delivery.taskCompletionPercent)}
            />
            <MetricTile
              label="Overdue tasks"
              value={String(metrics.delivery.overdueTasksCount)}
            />
            <MetricTile
              label="Performance snapshot"
              value={
                metrics.delivery.performanceSnapshot
                  ? metrics.delivery.performanceSnapshot.averageScore.toFixed(1)
                  : "—"
              }
              sublabel={
                metrics.delivery.performanceSnapshot
                  ? performanceBandLabel(
                      metrics.delivery.performanceSnapshot.band
                    )
                  : "Not enough data yet"
              }
            />
          </div>

          <section className="mt-8 flex flex-col gap-3">
            <h2 className="text-h2 text-brand-brown font-semibold">
              Team workload
            </h2>
            <WorkloadHeatmap employees={metrics.delivery.workloadHeatmap} />
          </section>
        </>
      ) : (
        <p className="text-text-secondary">
          You don&apos;t have delivery-work access — switch to HRMS for people
          and requests.
        </p>
      )}

      <section className="mt-8 flex flex-col gap-3">
        <h2 className="text-h2 text-brand-brown font-semibold">Exceptions</h2>
        <AlertsPanel alerts={visibleAlerts} />
      </section>
    </>
  );
}

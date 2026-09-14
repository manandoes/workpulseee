import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canManageCompanySettings,
  canManagePermissionGrants,
  canManageWorkloadSettings,
} from "@/lib/permissions";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { WorkloadSettingsForm } from "@/components/dashboard/workload-settings-form";
import { AlertSettingsForm } from "@/components/dashboard/alert-settings-form";
import { PermissionGrantsTable } from "@/components/dashboard/permission-grants-table";

export const metadata: Metadata = { title: "Settings — Talking Lens Media" };

/**
 * Company settings: the weekly capacity hours workload is measured against
 * (Phases.md Phase 6), and the early-warning thresholds (Phases.md Phase 9).
 *
 * Owner/Admin/Manager may open the page (`canManageWorkloadSettings`, the
 * same delivery-role group that already sees Projects and Tasks), but the
 * Alerts card only renders for Owner/Admin (`canManageCompanySettings`) —
 * confirmed with the user: alert thresholds are a company-wide policy,
 * narrower than the workload number Managers also tune here.
 */
export default async function SettingsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canManageWorkloadSettings(actor)) redirect("/dashboard");

  const company = await db.company.findUniqueOrThrow({
    where: { id: actor.companyId },
    select: {
      weeklyCapacityHours: true,
      overloadThresholdPercent: true,
      stalledProjectDays: true,
      agingApprovalDays: true,
    },
  });

  return (
    <>
      <PageHeader
        title="Settings"
        description="Company-wide settings that affect how the dashboard computes its numbers."
      />

      <Card>
        <CardContent className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1">
            <h2 className="text-h3 text-brand-brown font-semibold">
              Workload capacity
            </h2>
            <p className="text-text-secondary text-meta">
              Used to turn each employee&apos;s assigned task hours into a
              workload percentage.
            </p>
          </div>
          <WorkloadSettingsForm
            weeklyCapacityHours={company.weeklyCapacityHours}
          />
        </CardContent>
      </Card>

      {canManageCompanySettings(actor) ? (
        <Card>
          <CardContent className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1">
              <h2 className="text-h3 text-brand-brown font-semibold">Alerts</h2>
              <p className="text-text-secondary text-meta">
                What counts as overdue, overloaded, stalled or aging on the
                dashboard&apos;s exceptions panel.
              </p>
            </div>
            <AlertSettingsForm
              overloadThresholdPercent={company.overloadThresholdPercent}
              stalledProjectDays={company.stalledProjectDays}
              agingApprovalDays={company.agingApprovalDays}
            />
          </CardContent>
        </Card>
      ) : null}

      {canManagePermissionGrants(actor) ? (
        <Card>
          <CardContent className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1">
              <h2 className="text-h3 text-brand-brown font-semibold">
                Employee permissions
              </h2>
              <p className="text-text-secondary text-meta">
                Temporarily hand an employee extra powers, on top of what their
                role already gives them. Effects show up on their Squad card and
                My Space.
              </p>
            </div>
            <PermissionGrantsTable />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

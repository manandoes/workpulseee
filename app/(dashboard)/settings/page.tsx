import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canManageBranding,
  canManageCompanySettings,
  canManageEmailSettings,
  canManagePermissionGrants,
  canManageWorkloadSettings,
  THEME_COOKIE,
  type ThemeMode,
} from "@/lib/permissions";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { WorkloadSettingsForm } from "@/components/dashboard/workload-settings-form";
import { AlertSettingsForm } from "@/components/dashboard/alert-settings-form";
import { PermissionGrantsTable } from "@/components/dashboard/permission-grants-table";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { BrandingForm } from "@/components/dashboard/branding-form";
import { EmailSettingsForm } from "@/components/dashboard/email-settings-form";

export const metadata: Metadata = { title: "Settings — WorkPulse" };

/**
 * Company settings: the weekly capacity hours workload is measured against
 * (Phases.md Phase 6), and the early-warning thresholds (Phases.md Phase 9).
 *
 * Every signed-in actor — employee included — may open the page for the
 * Appearance card (Plan: theme toggle, a personal preference); the
 * Workload/Alerts/Branding/Employee-permissions cards below still only
 * render for the roles that could already manage them
 * (`canManageWorkloadSettings`/`canManageCompanySettings`/
 * `canManageBranding`/`canManagePermissionGrants`), same as before.
 */
export default async function SettingsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const company = await db.company.findUniqueOrThrow({
    where: { id: actor.companyId },
    select: {
      weeklyCapacityHours: true,
      overloadThresholdPercent: true,
      stalledProjectDays: true,
      agingApprovalDays: true,
      brandColor: true,
      emailProvider: true,
      emailFromAddress: true,
      emailApiKeyEncrypted: true,
    },
  });

  const cookieStore = await cookies();
  const theme: ThemeMode =
    cookieStore.get(THEME_COOKIE)?.value === "dark" ? "dark" : "light";

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
              Appearance
            </h2>
            <p className="text-text-secondary text-meta">
              Light or dark — a personal preference for your own browser,
              only on the dashboard.
            </p>
          </div>
          <ThemeToggle theme={theme} />
        </CardContent>
      </Card>

      {canManageBranding(actor) ? (
        <Card>
          <CardContent className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1">
              <h2 className="text-h3 text-brand-brown font-semibold">
                Branding
              </h2>
              <p className="text-text-secondary text-meta">
                The dashboard&apos;s accent color, for everyone in the
                company.
              </p>
            </div>
            <BrandingForm brandColor={company.brandColor} />
          </CardContent>
        </Card>
      ) : null}

      {canManageEmailSettings(actor) ? (
        <Card>
          <CardContent className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1">
              <h2 className="text-h3 text-brand-brown font-semibold">
                Email delivery
              </h2>
              <p className="text-text-secondary text-meta">
                Send invite and notification emails from your own Resend or
                Brevo account instead of the shared default sender.
              </p>
            </div>
            <EmailSettingsForm
              emailProvider={
                company.emailProvider === "resend" ||
                company.emailProvider === "brevo"
                  ? company.emailProvider
                  : null
              }
              emailFromAddress={company.emailFromAddress}
              emailApiKeySet={company.emailApiKeyEncrypted !== null}
            />
          </CardContent>
        </Card>
      ) : null}

      {canManageWorkloadSettings(actor) ? (
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
      ) : null}

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

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canManageBilling,
  canManageBranding,
  canManageCompanySettings,
  canManageEmailSettings,
  canManagePermissionGrants,
  canManageWorkloadSettings,
  THEME_COOKIE,
  type ThemeMode,
} from "@/lib/permissions";
import {
  countBillableEmployees,
  employeeCapFor,
  loadSubscription,
} from "@/lib/billing";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { WorkloadSettingsForm } from "@/components/dashboard/workload-settings-form";
import { AlertSettingsForm } from "@/components/dashboard/alert-settings-form";
import { PermissionGrantsTable } from "@/components/dashboard/permission-grants-table";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { BrandingForm } from "@/components/dashboard/branding-form";
import { BillingSettingsCard } from "@/components/dashboard/billing-settings-card";
import { EmailSettingsForm } from "@/components/dashboard/email-settings-form";
import { EmailTemplateForm } from "@/components/dashboard/email-template-form";
import { SalarySlipList } from "@/components/payroll/salary-slip-list";
import { loadEmailTemplates } from "@/lib/email-template-data";
import { loadFileSummaries } from "@/lib/files-data";
import { loadMySalarySlips } from "@/lib/payroll-data";

export const metadata: Metadata = { title: "Settings" };

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
      currency: true,
      emailProvider: true,
      emailFromAddress: true,
      emailApiKeyEncrypted: true,
    },
  });

  const cookieStore = await cookies();
  const theme: ThemeMode =
    cookieStore.get(THEME_COOKIE)?.value === "dark" ? "dark" : "light";

  // Only the Owner sees the template card, and only an employee has slips of
  // their own — neither read is worth making for an actor who cannot see the
  // card it feeds.
  const emailTemplates = canManageEmailSettings(actor)
    ? await loadEmailTemplates(actor.companyId)
    : [];

  const templateAttachments: Record<string, Awaited<ReturnType<typeof loadFileSummaries>>> =
    {};
  for (const template of emailTemplates) {
    templateAttachments[template.kind] = await loadFileSummaries(
      actor.companyId,
      template.attachmentIds
    );
  }

  const mySlips =
    actor.accountType === "employee" ? await loadMySalarySlips(actor) : [];

  // Reaching this page at all already proved the subscription is active
  // (`app/(dashboard)/layout.tsx`'s gate), so this is only ever read here to
  // show the Owner their own plan/usage, never to gate anything.
  const [subscription, employeesUsed] = canManageBilling(actor)
    ? await Promise.all([
        loadSubscription(actor.companyId),
        countBillableEmployees(actor.companyId),
      ])
    : [null, 0];

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

      {canManageBilling(actor) && subscription ? (
        <Card>
          <CardContent className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1">
              <h2 className="text-h3 text-brand-brown font-semibold">
                Billing
              </h2>
              <p className="text-text-secondary text-meta">
                Your plan, renewal date and employee seats.
              </p>
            </div>
            <BillingSettingsCard
              plan={subscription.plan}
              currentPeriodEnd={
                (subscription.currentPeriodEnd ?? new Date()).toISOString()
              }
              extraSeats={subscription.extraSeats}
              employeeCap={employeeCapFor(subscription)}
              employeesUsed={employeesUsed}
            />
          </CardContent>
        </Card>
      ) : null}

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

      {actor.accountType === "employee" ? (
        <Card>
          <CardContent className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1">
              <h2 className="text-h3 text-brand-brown font-semibold">
                Salary slips
              </h2>
              <p className="text-text-secondary text-meta">
                Download your slip for any month your company has published.
              </p>
            </div>
            <SalarySlipList slips={mySlips} currency={company.currency} />
          </CardContent>
        </Card>
      ) : null}

      {canManageEmailSettings(actor) ? (
        <Card>
          <CardContent className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1">
              <h2 className="text-h3 text-brand-brown font-semibold">
                Invite email template
              </h2>
              <p className="text-text-secondary text-meta">
                Customise the wording of the invites new joiners receive, and
                attach anything they should have on day one. Leave it alone to
                keep WorkPulse&apos;s standard email.
              </p>
            </div>
            <EmailTemplateForm
              templates={emailTemplates}
              attachments={templateAttachments}
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

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ShieldCheck } from "lucide-react";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canManageBilling,
  canManageBreakAllowance,
  canManageBranding,
  canManageCompanySettings,
  canManageEmailSettings,
  canManageMessagingSettings,
  canManagePermissionGrants,
  canManageWhatsAppSettings,
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
import { WorkingDaySettingsForm } from "@/components/dashboard/working-day-settings-form";
import { BreakAllowanceSettingsForm } from "@/components/dashboard/break-allowance-settings-form";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { BrandingForm } from "@/components/dashboard/branding-form";
import { BillingSettingsCard } from "@/components/dashboard/billing-settings-card";
import { EmailSettingsForm } from "@/components/dashboard/email-settings-form";
import { EmailTemplateForm } from "@/components/dashboard/email-template-form";
import { WhatsAppSettingsForm } from "@/components/dashboard/whatsapp-settings-form";
import { MessagingSettingsForm } from "@/components/dashboard/messaging-settings-form";
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
 * Appearance card (Plan: theme toggle, a personal preference); every other
 * card only renders for whoever holds its power (`canManageWorkloadSettings`,
 * `canManageCompanySettings`, `canManageBranding`, ...), and the Owner's
 * Authority card links out to `/settings/authority` (Plan: access levels).
 */
export default async function SettingsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const company = await db.company.findUniqueOrThrow({
    where: { id: actor.companyId },
    select: {
      weeklyCapacityHours: true,
      endOfDayMinutes: true,
      timeZone: true,
      dailyBreakMinutes: true,
      overloadThresholdPercent: true,
      stalledProjectDays: true,
      agingApprovalDays: true,
      brandColor: true,
      currency: true,
      emailProvider: true,
      emailFromAddress: true,
      emailApiKeyEncrypted: true,
      whatsappPhoneNumberId: true,
      whatsappAccessTokenEncrypted: true,
      whatsappTemplateName: true,
      whatsappTemplateLanguage: true,
      messagingProvider: true,
      googleChatEnabled: true,
      googleChatConnectedByEmail: true,
      googleChatConnectedAt: true,
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

  const templateAttachments: Record<
    string,
    Awaited<ReturnType<typeof loadFileSummaries>>
  > = {};
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
              Light or dark — a personal preference for your own browser, only
              on the dashboard.
            </p>
          </div>
          <ThemeToggle theme={theme} />
        </CardContent>
      </Card>

      {canManagePermissionGrants(actor) ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-2">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-h3 text-brand-brown font-semibold">
                Authority
              </h2>
              <p className="text-text-secondary text-meta">
                Decide what each manager, HR person and employee can see and do
                — change levels and switch individual powers on or off.
              </p>
            </div>
            <Link
              href="/settings/authority"
              className="border-border hover:bg-brand-yellow-light text-brand-brown inline-flex items-center gap-2 rounded-lg border px-3 py-2 font-medium transition-colors"
            >
              <ShieldCheck aria-hidden className="size-4" strokeWidth={1.5} />
              Open Authority
            </Link>
          </CardContent>
        </Card>
      ) : null}

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
              currentPeriodEnd={(
                subscription.currentPeriodEnd ?? new Date()
              ).toISOString()}
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
                The dashboard&apos;s accent color, for everyone in the company.
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

      {canManageWhatsAppSettings(actor) ? (
        <Card>
          <CardContent className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1">
              <h2 className="text-h3 text-brand-brown font-semibold">
                WhatsApp delivery
              </h2>
              <p className="text-text-secondary text-meta">
                Send notification WhatsApps from your own Meta Business Cloud
                API account instead of the shared default sender.
              </p>
            </div>
            <WhatsAppSettingsForm
              whatsappPhoneNumberId={company.whatsappPhoneNumberId}
              whatsappTemplateName={company.whatsappTemplateName}
              whatsappTemplateLanguage={company.whatsappTemplateLanguage}
              whatsappAccessTokenSet={
                company.whatsappAccessTokenEncrypted !== null
              }
            />
          </CardContent>
        </Card>
      ) : null}

      {canManageMessagingSettings(actor) ? (
        <Card>
          <CardContent className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1">
              <h2 className="text-h3 text-brand-brown font-semibold">
                Chat &amp; messaging
              </h2>
              <p className="text-text-secondary text-meta">
                Choose between the built-in chat or Google Chat as your
                messaging backend. Existing conversations keep their original
                provider when you change the default.
              </p>
            </div>
            <MessagingSettingsForm
              initial={{
                messagingProvider: company.messagingProvider,
                googleChatEnabled: company.googleChatEnabled,
                googleChatConnectedByEmail:
                  company.googleChatConnectedByEmail,
              }}
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

      {canManageCompanySettings(actor) ? (
        <Card>
          <CardContent className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1">
              <h2 className="text-h3 text-brand-brown font-semibold">
                Working day
              </h2>
              <p className="text-text-secondary text-meta">
                When the day is expected to end. An hour past it, anyone still
                logged in is reminded to log out; if nobody answers, the session
                is closed after another half hour and their day is recorded as
                ending at the last time they confirmed they were there.
              </p>
            </div>
            <WorkingDaySettingsForm
              endOfDayMinutes={company.endOfDayMinutes}
              timeZone={company.timeZone}
            />
          </CardContent>
        </Card>
      ) : null}

      {canManageBreakAllowance(actor) ? (
        <Card>
          <CardContent className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1">
              <h2 className="text-h3 text-brand-brown font-semibold">
                Break allowance
              </h2>
              <p className="text-text-secondary text-meta">
                How long everyone may spend on breaks each working day. While on
                a break, people see what is left counting down; past the limit
                it keeps counting, in red.
              </p>
            </div>
            <BreakAllowanceSettingsForm
              dailyBreakMinutes={company.dailyBreakMinutes}
            />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

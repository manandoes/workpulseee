import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getRawActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasActiveSubscription, loadSubscription } from "@/lib/billing";
import { canManageBilling } from "@/lib/permissions";
import { BrandMark } from "@/components/marketing/brand-mark";
import { SignOutButton } from "@/components/dashboard/sign-out-button";
import { PlanPicker } from "@/components/billing/plan-picker";
import { Card, CardContent } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Subscribe — WorkPulse",
  robots: { index: false, follow: false },
};

/**
 * The subscription paywall (Plan: Razorpay billing, requirement 2). Every
 * signed-in actor whose company has no active subscription lands here —
 * `app/(dashboard)/layout.tsx` redirects both account types to it, and
 * `proxy.ts` lists it in both `PROTECTED_PREFIXES` (must be signed in) and
 * `SHARED_PREFIXES` (reachable by an employee, not just a company account).
 *
 * Deliberately its own top-level route, outside `(dashboard)` — nesting it
 * there would gate it by the very check it exists to resolve.
 */
export default async function BillingPage() {
  const actor = await getRawActor();
  if (!actor) redirect("/login");

  const subscription = await loadSubscription(actor.companyId);

  // Already paid — nothing to do here. Covers someone bookmarking this page,
  // or coming straight back after `router.push`.
  if (hasActiveSubscription(subscription)) {
    redirect(actor.accountType === "employee" ? "/my-space" : "/dashboard");
  }

  const redirectTo = actor.accountType === "employee" ? "/my-space" : "/dashboard";
  const canSubscribe = canManageBilling(actor);

  const owner = canSubscribe
    ? null
    : await db.companyAccount.findFirst({
        where: { companyId: actor.companyId, role: "Owner", deletedAt: null },
        select: { fullName: true, workEmail: true },
      });

  return (
    <div className="bg-background flex min-h-full flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <Link href="/" aria-label="WorkPulse home">
        <BrandMark />
      </Link>

      <main className="flex w-full max-w-3xl flex-col gap-6">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-h1 text-brand-brown font-semibold">
            {subscription
              ? "Your subscription has ended"
              : "Choose a plan to get started"}
          </h1>
          <p className="text-text-secondary">
            {canSubscribe
              ? "Pick a plan to unlock your workspace. Nothing else in WorkPulse is reachable until this company has an active subscription."
              : "This company's WorkPulse subscription is not active."}
          </p>
        </div>

        {canSubscribe ? (
          <PlanPicker redirectTo={redirectTo} />
        ) : (
          <Card>
            <CardContent className="flex flex-col gap-2 py-2 text-center">
              <p className="text-text-secondary">
                Ask your company owner
                {owner ? ` (${owner.fullName} — ${owner.workEmail})` : ""} to
                subscribe or renew before you can sign back in.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-center">
          <SignOutButton />
        </div>
      </main>

      <Toaster />
    </div>
  );
}

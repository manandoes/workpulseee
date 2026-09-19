import { db } from "@/lib/db";
import { PLAN_CONFIG } from "@/lib/plans";
import type { SubscriptionPlan } from "@/lib/generated/prisma/enums";

/**
 * Subscription gating (Plan: Razorpay billing — requirement 2: "no
 * user/owner can login without having the subscription").
 *
 * Access is derived at read time from `currentPeriodEnd`, never swept by a
 * job: `Subscription.status` only ever distinguishes "never paid"
 * (`Inactive`) from "has paid at least once" (`Active`) — whether that paid
 * period has since lapsed is a plain date comparison, done here, every time.
 * That keeps the row honest without a cron job to flip a stored "Expired"
 * status, and it means a company that lets its subscription lapse and later
 * pays again needs no special "reactivate" path — the same
 * `POST /api/billing/verify` write that activates a new company also revives
 * a lapsed one.
 */

export type SubscriptionSummary = {
  plan: SubscriptionPlan;
  status: "Inactive" | "Active";
  extraSeats: number;
  currentPeriodEnd: Date | null;
};

/** The caller's own company subscription, or `null` if never purchased. */
export async function loadSubscription(
  companyId: string
): Promise<SubscriptionSummary | null> {
  const subscription = await db.subscription.findUnique({
    where: { companyId },
    select: {
      plan: true,
      status: true,
      extraSeats: true,
      currentPeriodEnd: true,
    },
  });
  return subscription;
}

/**
 * Does this company currently have paid access? `null` (never subscribed)
 * and a lapsed period are both "no" — the two are shown differently on
 * `/billing` (`app/billing/page.tsx`) but gate identically everywhere else.
 */
export function hasActiveSubscription(
  subscription: SubscriptionSummary | null,
  now: Date = new Date()
): boolean {
  if (!subscription) return false;
  if (subscription.status !== "Active") return false;
  if (!subscription.currentPeriodEnd) return false;
  return subscription.currentPeriodEnd.getTime() > now.getTime();
}

/**
 * How many employees this company's plan allows — the plan's own cap plus
 * any extra seats purchased at ₹200 each (requirement 3).
 *
 * A company with no subscription yet has no plan to read a cap from; `0` is
 * the correct answer there since `hasActiveSubscription` already blocks
 * every page and API route before an employee-creation check could run —
 * this is only ever called for a company already known to be subscribed.
 */
export function employeeCapFor(
  subscription: SubscriptionSummary | null
): number {
  if (!subscription) return 0;
  return PLAN_CONFIG[subscription.plan].maxEmployees + subscription.extraSeats;
}

/**
 * How many of the cap this company is currently using. Counts every
 * non-deleted `Employee` row regardless of status (`Invited`/`Active`/
 * `Suspended`) — an invited-but-not-yet-accepted seat still occupies a slot
 * the company is holding for that person, the same way the employee
 * directory (`GET /api/employees`) already counts them all.
 */
export async function countBillableEmployees(
  companyId: string
): Promise<number> {
  return db.employee.count({ where: { companyId, deletedAt: null } });
}

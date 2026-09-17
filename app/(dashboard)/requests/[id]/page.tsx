import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import { canApproveRequests, canDecideOnRequest } from "@/lib/permissions";
import { RequestDetail } from "@/components/requests/request-detail";

export const metadata: Metadata = { title: "Request — WorkPulse" };

const requestDetailSelect = {
  id: true,
  type: true,
  status: true,
  subject: true,
  description: true,
  startDate: true,
  endDate: true,
  dayPart: true,
  amount: true,
  decisionNote: true,
  decidedAt: true,
  createdAt: true,
  employee: {
    select: {
      id: true,
      fullName: true,
      managerId: true,
      managerAccountId: true,
    },
  },
  approver: { select: { id: true, fullName: true } },
  approverEmployee: { select: { id: true, fullName: true } },
  attachments: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      label: true,
      url: true,
      createdAt: true,
      addedById: true,
      addedByEmployeeId: true,
      addedBy: { select: { fullName: true } },
      addedByEmployee: { select: { fullName: true } },
    },
  },
} as const;

/**
 * A request in the approval queue (Phases.md Phase 7).
 *
 * `canApproveRequests` gates whether the page loads at all; whether *this*
 * viewer may decide on *this* request (a Manager sees the queue but only
 * decides on their own reports) is `canDecideOnRequest`, applied inside
 * `RequestDetail`.
 */
export default async function RequestPage({
  params,
}: PageProps<"/requests/[id]">) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canApproveRequests(actor)) redirect("/dashboard");

  const { id } = await params;

  const [company, request] = await Promise.all([
    db.company.findUnique({
      where: { id: actor.companyId },
      select: { currency: true },
    }),
    db.request.findFirst({
      where: scopedWhere(actor, { id }),
      select: requestDetailSelect,
    }),
  ]);

  if (!request) notFound();

  /**
   * `canApproveRequests` only gates the queue as a whole. A Manager's own
   * remit is their direct reports (Rules.md section 3 — never expose a
   * request that may hold sensitive personal detail to a role that should not
   * see it), so a Manager who is not this employee's manager gets the same
   * "not found" a cross-tenant id would — direct navigation cannot reveal a
   * request the queue itself would never list for them.
   */
  if (actor.role === "Manager" && !canDecideOnRequest(actor, request)) {
    notFound();
  }

  return (
    <RequestDetail
      actor={actor}
      request={request}
      currency={company?.currency ?? "INR"}
      backHref="/requests"
      backLabel="Back to requests"
      attachments={request.attachments}
    />
  );
}

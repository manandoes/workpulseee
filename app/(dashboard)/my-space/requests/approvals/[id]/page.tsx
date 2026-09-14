import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import { canApproveRequests, canDecideOnRequest } from "@/lib/permissions";
import { RequestDetail } from "@/components/requests/request-detail";

export const metadata: Metadata = { title: "Request — Talking Lens Media" };

const requestDetailSelect = {
  id: true,
  type: true,
  status: true,
  subject: true,
  description: true,
  startDate: true,
  endDate: true,
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
 * A request in the `DecideRequests` grant's approval queue — mirrors
 * `app/(dashboard)/requests/[id]/page.tsx` exactly, but reachable by an
 * Employee actor (that page requires the company area, which a granted
 * employee never enters — see the plan's "grant reach" decision).
 */
export default async function ApprovalDetailPage({
  params,
}: PageProps<"/my-space/requests/approvals/[id]">) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.accountType !== "employee") redirect("/dashboard");
  if (!canApproveRequests(actor)) redirect("/my-space/requests");

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
  if (!canDecideOnRequest(actor, request)) notFound();

  return (
    <RequestDetail
      actor={actor}
      request={request}
      currency={company?.currency ?? "INR"}
      backHref="/my-space/requests/approvals"
      backLabel="Back to approvals"
      attachments={request.attachments}
    />
  );
}

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import { RequestDetail } from "@/components/requests/request-detail";

export const metadata: Metadata = { title: "Request" };

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

/** An employee's own request detail (Phases.md Phase 7). */
export default async function MyRequestPage({
  params,
}: PageProps<"/my-space/requests/[id]">) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.accountType !== "employee") redirect("/dashboard");

  const { id } = await params;

  const [company, request] = await Promise.all([
    db.company.findUnique({
      where: { id: actor.companyId },
      select: { currency: true },
    }),
    db.request.findFirst({
      // Own requests only — an employee cannot open another employee's by id.
      where: scopedWhere(actor, { id, employeeId: actor.id }),
      select: requestDetailSelect,
    }),
  ]);

  if (!request) notFound();

  return (
    <RequestDetail
      actor={actor}
      request={request}
      currency={company?.currency ?? "INR"}
      backHref="/my-space/requests"
      backLabel="Back to my requests"
      attachments={request.attachments}
    />
  );
}

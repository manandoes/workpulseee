import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import { requestSelect } from "@/lib/request-data";
import { RequestDetail } from "@/components/requests/request-detail";

export const metadata: Metadata = { title: "Request" };

const requestDetailSelect = {
  ...requestSelect,
  attachments: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      label: true,
      url: true,
      fileId: true,
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

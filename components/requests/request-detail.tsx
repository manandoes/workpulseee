import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { canDecideOnRequest, type SessionActor } from "@/lib/permissions";
import type { LoadedRequest } from "@/lib/request-data";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  RequestStatusBadge,
  requestTypeLabel,
} from "@/components/requests/status-badge";
import { DecisionForm } from "@/components/requests/decision-form";
import {
  RequestAttachments,
  type RequestAttachment,
} from "@/components/requests/request-attachments";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Request detail, shared by the employee's own view and the approver's queue
 * (mirrors `app/(dashboard)/tasks/[id]/page.tsx`'s single layout for both
 * roles). What differs — whether the employee's name is shown, whether the
 * decision form appears — follows `canDecideOnRequest`/`actor.accountType`
 * rather than the caller passing flags that could drift from the real rule.
 */
export function RequestDetail({
  actor,
  request,
  currency,
  backHref,
  backLabel,
  attachments,
}: {
  actor: SessionActor;
  request: LoadedRequest;
  currency: string;
  backHref: string;
  backLabel: string;
  attachments: {
    id: string;
    label: string;
    url: string;
    createdAt: Date;
    addedById: string | null;
    addedByEmployeeId: string | null;
    addedBy: { fullName: string } | null;
    addedByEmployee: { fullName: string } | null;
  }[];
}) {
  const isOwnRequest =
    actor.accountType === "employee" && request.employee.id === actor.id;
  const mayDecide =
    request.status === "Pending" && canDecideOnRequest(actor, request);
  const mayAttach = isOwnRequest || canDecideOnRequest(actor, request);

  const attachmentList: RequestAttachment[] = attachments.map((a) => ({
    id: a.id,
    label: a.label,
    url: a.url,
    createdAt: formatDateTime(a.createdAt),
    addedByName: a.addedBy?.fullName ?? a.addedByEmployee?.fullName ?? null,
    canDelete:
      (actor.accountType === "employee" && a.addedByEmployeeId === actor.id) ||
      (actor.accountType === "company" && a.addedById === actor.id) ||
      canDecideOnRequest(actor, request),
  }));

  return (
    <>
      <Link
        href={backHref}
        className="text-text-secondary hover:text-brand-brown mb-4 inline-flex items-center gap-1.5"
      >
        <ArrowLeft aria-hidden className="size-4" strokeWidth={1.5} />
        {backLabel}
      </Link>

      <PageHeader
        title={request.subject}
        description={requestTypeLabel(request.type)}
        action={<RequestStatusBadge status={request.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Overview">
          {!isOwnRequest ? (
            <Detail label="Employee" value={request.employee.fullName} />
          ) : null}
          {request.startDate || request.endDate ? (
            <>
              <Detail
                label="Start date"
                value={formatDate(request.startDate)}
              />
              <Detail label="End date" value={formatDate(request.endDate)} />
            </>
          ) : null}
          {request.amount !== null ? (
            <Detail
              label="Amount"
              value={formatMoney(
                request.amount as { toString(): string },
                currency
              )}
            />
          ) : null}
          <Detail label="Submitted" value={formatDate(request.createdAt)} />
          {request.decidedAt ? (
            <>
              <Detail
                label="Decided"
                value={formatDateTime(request.decidedAt)}
              />
              <Detail
                label="Decided by"
                value={
                  request.approver?.fullName ??
                  request.approverEmployee?.fullName
                }
              />
            </>
          ) : null}
        </Panel>

        <Panel title="Details" plain>
          <p className="text-foreground whitespace-pre-line">
            {request.description}
          </p>
        </Panel>

        {request.decisionNote ? (
          <Panel title="Note from the approver" plain>
            <p className="text-foreground whitespace-pre-line">
              {request.decisionNote}
            </p>
          </Panel>
        ) : null}

        {mayDecide ? (
          <Panel title="Decide" plain>
            <DecisionForm requestId={request.id} />
          </Panel>
        ) : null}

        <Panel title="Attachments" plain className="lg:col-span-2">
          <RequestAttachments
            requestId={request.id}
            canAttach={mayAttach}
            attachments={attachmentList}
          />
        </Panel>
      </div>
    </>
  );
}

function Panel({
  title,
  plain,
  className,
  children,
}: {
  title: string;
  plain?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-4 py-2">
        <h2 className="text-h3 text-brand-brown font-semibold">{title}</h2>
        {plain ? (
          <div>{children}</div>
        ) : (
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>
        )}
      </CardContent>
    </Card>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-text-secondary text-meta">{label}</dt>
      <dd className="text-foreground break-words">{value || "—"}</dd>
    </div>
  );
}

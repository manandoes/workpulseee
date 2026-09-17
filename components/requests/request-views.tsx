import Link from "next/link";
import type {
  LeaveDayPart,
  RequestStatus,
  RequestType,
} from "@/lib/generated/prisma/enums";
import { formatDate, formatMoney } from "@/lib/format";
import { requestTypeDisplay } from "@/lib/requests";
import { Card, CardContent } from "@/components/ui/card";
import { RequestStatusBadge } from "@/components/requests/status-badge";

/**
 * A request list, shared by the employee's "My Requests" and the company
 * "Requests" approval queue (mirrors `components/tasks/task-views.tsx`'s one
 * `TaskList` for both roles — the two views must never disagree about a
 * request's state).
 */
export type RequestSummary = {
  id: string;
  type: RequestType;
  status: RequestStatus;
  subject: string;
  dayPart: LeaveDayPart | null;
  amount: unknown;
  createdAt: Date;
  employee?: { id: string; fullName: string };
};

export function RequestList({
  requests,
  detailHref,
  currency,
}: {
  requests: RequestSummary[];
  /** Where a row's subject links to — differs between the two sides. */
  detailHref: (id: string) => string;
  /** For a Reimbursement's amount (PRD.md section 11 — the company's own currency). */
  currency: string;
}) {
  const showEmployee = requests.some((request) => request.employee);

  return (
    <Card>
      <CardContent className="py-2">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-muted">
              <tr className="text-text-secondary text-meta">
                <th className="rounded-l-lg px-3 py-2 font-medium">Subject</th>
                <th className="px-3 py-2 font-medium">Type</th>
                {showEmployee ? (
                  <th className="px-3 py-2 font-medium">Employee</th>
                ) : null}
                <th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Submitted</th>
                <th className="rounded-r-lg px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} className="border-border border-b">
                  <td className="px-3 py-3">
                    <Link
                      href={detailHref(request.id)}
                      className="text-brand-brown font-medium underline-offset-4 hover:underline"
                    >
                      {request.subject}
                    </Link>
                  </td>
                  <td className="text-text-secondary px-3 py-3">
                    {requestTypeDisplay(request.type, request.dayPart)}
                  </td>
                  {showEmployee ? (
                    <td className="text-text-secondary px-3 py-3">
                      {request.employee ? (
                        <Link
                          href={`/employees/${request.employee.id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {request.employee.fullName}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  ) : null}
                  <td className="text-text-secondary px-3 py-3">
                    {request.amount !== null
                      ? formatMoney(
                          request.amount as { toString(): string },
                          currency
                        )
                      : "—"}
                  </td>
                  <td className="text-text-secondary px-3 py-3">
                    {formatDate(request.createdAt)}
                  </td>
                  <td className="px-3 py-3">
                    <RequestStatusBadge status={request.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

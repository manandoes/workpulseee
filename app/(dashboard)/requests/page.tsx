import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadRequestsForApprover } from "@/lib/request-data";
import { REQUEST_STATUSES, REQUEST_TYPES } from "@/lib/requests";
import { canApproveRequests } from "@/lib/permissions";
import { paginationSchema } from "@/lib/pagination";
import { requestFiltersSchema } from "@/lib/validations/requests";
import { EmptyState, PageHeader } from "@/components/dashboard/page-header";
import { ListFilters } from "@/components/dashboard/list-filters";
import { Pagination } from "@/components/dashboard/pagination";
import { RequestList } from "@/components/requests/request-views";
import {
  requestStatusLabel,
  requestTypeLabel,
} from "@/components/requests/status-badge";

export const metadata: Metadata = { title: "Requests — WorkPulse" };

/**
 * The approval queue (Phases.md Phase 7).
 *
 * Owner/Admin/HR see every request in the company; a Manager's is narrowed to
 * their own direct reports' by `loadRequestsForApprover` — the same split
 * `canDecideOnRequest` enforces per row when a decision is actually made.
 */
export default async function RequestsPage({
  searchParams,
}: PageProps<"/requests">) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canApproveRequests(actor)) redirect("/dashboard");

  const query = await searchParams;
  const filters = requestFiltersSchema.parse(query);
  const { page: requestedPage } = paginationSchema.parse(query);

  const [company, { requests, ...meta }] = await Promise.all([
    db.company.findUnique({
      where: { id: actor.companyId },
      select: { currency: true },
    }),
    loadRequestsForApprover(actor, filters, requestedPage),
  ]);

  const isFiltered = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader
        title="Requests"
        description={
          actor.role === "Manager"
            ? "Leave, reimbursement, equipment and HR requests from your direct reports."
            : "Every leave, reimbursement, equipment and HR request across your company."
        }
      />

      <ListFilters
        basePath="/requests"
        searchPlaceholder="Subject, description or employee"
        selects={[
          {
            name: "status",
            label: "Status",
            anyLabel: "Any status",
            options: REQUEST_STATUSES.map((status) => ({
              value: status,
              label: requestStatusLabel(status),
            })),
          },
          {
            name: "type",
            label: "Type",
            anyLabel: "Any type",
            options: REQUEST_TYPES.map((type) => ({
              value: type,
              label: requestTypeLabel(type),
            })),
          },
        ]}
      />

      {requests.length === 0 ? (
        <EmptyState
          title={isFiltered ? "No matches" : "No requests yet"}
          description={
            isFiltered
              ? "No request matches those filters. Try a different one, or clear the filters."
              : "Requests your team submits will appear here for you to approve or reject."
          }
        />
      ) : (
        <>
          <p className="text-text-secondary text-meta mb-4">
            {meta.total === 1 ? "1 request" : `${meta.total} requests`}
            {isFiltered ? " matching your filters" : ""}
          </p>
          <RequestList
            requests={requests}
            detailHref={(id) => `/requests/${id}`}
            currency={company?.currency ?? "INR"}
          />
          <Pagination basePath="/requests" query={query} meta={meta} />
        </>
      )}
    </>
  );
}

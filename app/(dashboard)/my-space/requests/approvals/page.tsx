import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadRequestsForApprover } from "@/lib/request-data";
import { canApproveRequests } from "@/lib/permissions";
import { paginationSchema } from "@/lib/pagination";
import { EmptyState, PageHeader } from "@/components/dashboard/page-header";
import { Pagination } from "@/components/dashboard/pagination";
import { RequestList } from "@/components/requests/request-views";

export const metadata: Metadata = { title: "Approvals — WorkPulse" };

/**
 * Phase 11 / Phase 5 of the plan: the `DecideRequests` grant's
 * employee-reachable surface — the same queue `/requests` shows a company
 * account, mounted under My Space so a granted employee (who cannot open
 * `/requests`) can still use it. `loadRequestsForApprover`'s
 * `actor.role === "Manager"` narrowing simply never matches an Employee
 * actor, so this already reads "every request in the company" for a
 * grant-holder, with no change needed there.
 */
export default async function ApprovalsPage({
  searchParams,
}: PageProps<"/my-space/requests/approvals">) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.accountType !== "employee") redirect("/dashboard");
  if (!canApproveRequests(actor)) redirect("/my-space/requests");

  const query = await searchParams;
  const { page: requestedPage } = paginationSchema.parse(query);

  const [company, { requests, ...meta }] = await Promise.all([
    db.company.findUnique({
      where: { id: actor.companyId },
      select: { currency: true },
    }),
    loadRequestsForApprover(actor, {}, requestedPage),
  ]);

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Requests you've been granted power to decide on."
      />

      {requests.length === 0 ? (
        <EmptyState
          title="Nothing to approve"
          description="Pending requests you can decide on will appear here."
        />
      ) : (
        <>
          <RequestList
            requests={requests}
            detailHref={(id) => `/my-space/requests/approvals/${id}`}
            currency={company?.currency ?? "INR"}
          />
          <Pagination
            basePath="/my-space/requests/approvals"
            query={query}
            meta={meta}
          />
        </>
      )}
    </>
  );
}

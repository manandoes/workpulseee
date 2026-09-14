import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck, ListPlus } from "lucide-react";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadOwnRequests } from "@/lib/request-data";
import { canApproveRequests } from "@/lib/permissions";
import { paginationSchema } from "@/lib/pagination";
import { EmptyState, PageHeader } from "@/components/dashboard/page-header";
import { Pagination } from "@/components/dashboard/pagination";
import { RequestList } from "@/components/requests/request-views";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "My Requests — Talking Lens Media" };

/**
 * An employee's own requests (PRD.md section 6.9 — "My Requests": leave,
 * expenses, equipment, HR requests).
 */
export default async function MyRequestsPage({
  searchParams,
}: PageProps<"/my-space/requests">) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.accountType !== "employee") redirect("/dashboard");

  const query = await searchParams;
  const { page: requestedPage } = paginationSchema.parse(query);

  const [company, { requests, ...meta }] = await Promise.all([
    db.company.findUnique({
      where: { id: actor.companyId },
      select: { currency: true },
    }),
    loadOwnRequests(actor, requestedPage),
  ]);

  return (
    <>
      <PageHeader
        title="My Requests"
        description="Leave, expenses, equipment and HR requests you've submitted, and their status."
        action={
          <div className="flex flex-wrap items-center gap-3">
            {canApproveRequests(actor) ? (
              <Button asChild variant="outline">
                <Link href="/my-space/requests/approvals">
                  <ClipboardCheck aria-hidden />
                  Approvals
                </Link>
              </Button>
            ) : null}
            <Button asChild>
              <Link href="/my-space/requests/new">
                <ListPlus aria-hidden />
                New request
              </Link>
            </Button>
          </div>
        }
      />

      {requests.length === 0 ? (
        <EmptyState
          title="No requests yet"
          description="Leave, reimbursements, equipment and other requests you submit will show up here, with their status."
          action={
            <Button asChild>
              <Link href="/my-space/requests/new">
                Submit your first request
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <RequestList
            requests={requests}
            detailHref={(id) => `/my-space/requests/${id}`}
            currency={company?.currency ?? "INR"}
          />
          <Pagination basePath="/my-space/requests" query={query} meta={meta} />
        </>
      )}
    </>
  );
}

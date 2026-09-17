import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import { clientFilter, CLIENT_STATUSES } from "@/lib/projects";
import {
  canManageClients,
  canViewProjects,
  projectSectionsFor,
} from "@/lib/permissions";
import { paginationMeta, paginationSchema } from "@/lib/pagination";
import { clientFiltersSchema } from "@/lib/validations/projects";
import { EmptyState, PageHeader } from "@/components/dashboard/page-header";
import { SectionTabs } from "@/components/dashboard/section-tabs";
import { ListFilters } from "@/components/dashboard/list-filters";
import { Pagination } from "@/components/dashboard/pagination";
import { ClientStatusBadge } from "@/components/projects/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Clients — WorkPulse" };

/** Client list (Phases.md Phase 4). */
export default async function ClientsPage({
  searchParams,
}: PageProps<"/projects/clients">) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canViewProjects(actor)) redirect("/dashboard");

  const query = await searchParams;
  const filters = clientFiltersSchema.parse(query);
  const { page: requestedPage } = paginationSchema.parse(query);
  const mayManage = canManageClients(actor);

  const where = scopedWhere(actor, clientFilter(filters));
  const total = await db.client.count({ where });
  const meta = paginationMeta(total, requestedPage);

  const clients = await db.client.findMany({
    // Tenant scoping (Rules.md section 2) — applied last, so a filter can never
    // widen the query beyond the caller's own company.
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      contactName: true,
      contactEmail: true,
      status: true,
      _count: { select: { projects: { where: { deletedAt: null } } } },
    },
    skip: meta.skip,
    take: meta.take,
  });

  const isFiltered = Boolean(filters.q || filters.status);

  return (
    <>
      <PageHeader
        title="Clients"
        description="Who you deliver work for. Every project belongs to one of them."
        action={
          mayManage ? (
            <Button asChild>
              <Link href="/projects/clients/new">
                <Building2 aria-hidden />
                Add client
              </Link>
            </Button>
          ) : undefined
        }
      />

      <SectionTabs
        label="Projects sections"
        items={projectSectionsFor(actor)}
      />

      <ListFilters
        basePath="/projects/clients"
        searchPlaceholder="Client name, contact or email"
        selects={[
          {
            name: "status",
            label: "Status",
            anyLabel: "Any status",
            options: CLIENT_STATUSES.map((status) => ({
              value: status,
              label: status,
            })),
          },
        ]}
      />

      {clients.length === 0 ? (
        isFiltered ? (
          <EmptyState
            title="No matches"
            description="No client matches those filters. Try a different search, or clear the filters to see everyone."
            action={
              <Button asChild variant="outline">
                <Link href="/projects/clients">Clear filters</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No clients yet"
            description={
              mayManage
                ? "Add the first client you deliver work for, then start a project for them."
                : "Owners, admins and managers add the clients your agency works with."
            }
            action={
              mayManage ? (
                <Button asChild>
                  <Link href="/projects/clients/new">
                    Add your first client
                  </Link>
                </Button>
              ) : undefined
            }
          />
        )
      ) : (
        <Card>
          <CardContent className="py-2">
            <p className="text-text-secondary text-meta mb-4">
              {total === 1 ? "1 client" : `${total} clients`}
              {isFiltered ? " matching your filters" : ""}
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-muted">
                  <tr className="text-text-secondary text-meta">
                    <th className="rounded-l-lg px-3 py-2 font-medium">
                      Client
                    </th>
                    <th className="px-3 py-2 font-medium">Main contact</th>
                    <th className="px-3 py-2 font-medium">Projects</th>
                    <th className="rounded-r-lg px-3 py-2 font-medium">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr key={client.id} className="border-border border-b">
                      <td className="px-3 py-3">
                        <Link
                          href={`/projects/clients/${client.id}`}
                          className="text-brand-brown font-medium underline-offset-4 hover:underline"
                        >
                          {client.name}
                        </Link>
                      </td>
                      <td className="text-text-secondary px-3 py-3">
                        {client.contactName ?? "—"}
                        {client.contactEmail ? (
                          <span className="text-meta block">
                            {client.contactEmail}
                          </span>
                        ) : null}
                      </td>
                      <td className="text-text-secondary px-3 py-3">
                        {client._count.projects}
                      </td>
                      <td className="px-3 py-3">
                        <ClientStatusBadge status={client.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Pagination basePath="/projects/clients" query={query} meta={meta} />
    </>
  );
}

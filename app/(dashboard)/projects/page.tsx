import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderPlus } from "lucide-react";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import { formatDate, formatMoney } from "@/lib/format";
import { projectFilter, PROJECT_STATUSES } from "@/lib/projects";
import { loadClients, loadCurrency } from "@/lib/project-data";
import {
  canCreateProjects,
  canViewProjects,
  projectSectionsFor,
} from "@/lib/permissions";
import { paginationMeta, paginationSchema } from "@/lib/pagination";
import { projectFiltersSchema } from "@/lib/validations/projects";
import { EmptyState, PageHeader } from "@/components/dashboard/page-header";
import { SectionTabs } from "@/components/dashboard/section-tabs";
import { ListFilters } from "@/components/dashboard/list-filters";
import { Pagination } from "@/components/dashboard/pagination";
import {
  ProjectStatusBadge,
  projectStatusLabel,
} from "@/components/projects/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Projects — WorkPulse" };

/**
 * Project list (Phases.md Phase 4).
 *
 * Search and filters live in the URL and are applied by the database, so a
 * filtered view can be linked and bookmarked and the page holds no client-side
 * copy of the list.
 */
export default async function ProjectsPage({
  searchParams,
}: PageProps<"/projects">) {
  const actor = await getActor();
  if (!actor) redirect("/login");

  // Middleware keeps employees out of the company area; this re-check is what
  // keeps HR out of client delivery (Rules.md section 3).
  if (!canViewProjects(actor)) redirect("/dashboard");

  const query = await searchParams;
  const filters = projectFiltersSchema.parse(query);
  const { page: requestedPage } = paginationSchema.parse(query);
  const mayCreate = canCreateProjects(actor);

  const where = scopedWhere(actor, projectFilter(filters));

  const [clients, currency, total] = await Promise.all([
    loadClients(actor),
    loadCurrency(actor),
    db.project.count({ where }),
  ]);
  const meta = paginationMeta(total, requestedPage);

  const projects = await db.project.findMany({
    // Tenant scoping (Rules.md section 2) — applied last, so a filter can
    // never widen the query beyond the caller's own company.
    where,
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      code: true,
      status: true,
      dueDate: true,
      value: true,
      client: { select: { id: true, name: true } },
      leadAccount: { select: { fullName: true } },
      _count: { select: { members: true } },
    },
    skip: meta.skip,
    take: meta.take,
  });

  const isFiltered = Boolean(filters.q || filters.clientId || filters.status);

  return (
    <>
      <PageHeader
        title="Projects"
        description="Client work in one place — what stage it is at, who is on it, and what it is worth."
        action={
          mayCreate ? (
            <Button asChild>
              <Link href="/projects/new">
                <FolderPlus aria-hidden />
                New project
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
        basePath="/projects"
        searchPlaceholder="Project, code, description or client"
        selects={[
          {
            name: "clientId",
            label: "Client",
            anyLabel: "All clients",
            options: clients.map((client) => ({
              value: client.id,
              label: client.name,
            })),
          },
          {
            name: "status",
            label: "Status",
            anyLabel: "Any status",
            options: PROJECT_STATUSES.map((status) => ({
              value: status,
              label: projectStatusLabel(status),
            })),
          },
        ]}
      />

      {projects.length === 0 ? (
        isFiltered ? (
          <EmptyState
            title="No matches"
            description="No project matches those filters. Try a different search, or clear the filters to see everything."
            action={
              <Button asChild variant="outline">
                <Link href="/projects">Clear filters</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No projects yet"
            description={
              clients.length === 0
                ? "Projects belong to a client, so add your first client and then start a project for them."
                : "Start a project for one of your clients and assign the team who will deliver it."
            }
            action={
              mayCreate ? (
                <Button asChild>
                  <Link
                    href={
                      clients.length === 0
                        ? "/projects/clients/new"
                        : "/projects/new"
                    }
                  >
                    {clients.length === 0
                      ? "Add your first client"
                      : "Create your first project"}
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
              {total === 1 ? "1 project" : `${total} projects`}
              {isFiltered ? " matching your filters" : ""}
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                {/* Design.md section 6: surface-muted header, thin row rules,
                    no zebra striping. */}
                <thead className="bg-surface-muted">
                  <tr className="text-text-secondary text-meta">
                    <th className="rounded-l-lg px-3 py-2 font-medium">
                      Project
                    </th>
                    <th className="px-3 py-2 font-medium">Client</th>
                    <th className="px-3 py-2 font-medium">Lead</th>
                    <th className="px-3 py-2 font-medium">Team</th>
                    <th className="px-3 py-2 font-medium">Due</th>
                    <th className="px-3 py-2 font-medium">Value</th>
                    <th className="rounded-r-lg px-3 py-2 font-medium">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => (
                    <tr key={project.id} className="border-border border-b">
                      <td className="px-3 py-3">
                        <Link
                          href={`/projects/${project.id}`}
                          className="text-brand-brown font-medium underline-offset-4 hover:underline"
                        >
                          {project.name}
                        </Link>
                        {project.code ? (
                          <span className="text-text-secondary text-meta block">
                            {project.code}
                          </span>
                        ) : null}
                      </td>
                      <td className="text-text-secondary px-3 py-3">
                        <Link
                          href={`/projects/clients/${project.client.id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {project.client.name}
                        </Link>
                      </td>
                      <td className="text-text-secondary px-3 py-3">
                        {project.leadAccount?.fullName ?? "—"}
                      </td>
                      <td className="text-text-secondary px-3 py-3">
                        {project._count.members}
                      </td>
                      <td className="text-text-secondary px-3 py-3">
                        {formatDate(project.dueDate)}
                      </td>
                      <td className="text-text-secondary px-3 py-3">
                        {formatMoney(project.value, currency)}
                      </td>
                      <td className="px-3 py-3">
                        <ProjectStatusBadge status={project.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Pagination basePath="/projects" query={query} meta={meta} />
    </>
  );
}

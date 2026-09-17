import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { loadDepartments } from "@/lib/employee-data";
import { loadPerformanceQueue } from "@/lib/performance-data";
import { paginationSchema } from "@/lib/pagination";
import { performanceFiltersSchema } from "@/lib/validations/performance";
import { EmptyState, PageHeader } from "@/components/dashboard/page-header";
import { ListFilters } from "@/components/dashboard/list-filters";
import { Pagination } from "@/components/dashboard/pagination";
import { PerformanceScoreBadge } from "@/components/performance/score-badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Performance — WorkPulse" };

/**
 * The performance list (Phases.md Phase 8).
 *
 * Every employee Owner/Admin/HR may open is every employee in the company;
 * a Manager's is narrowed to their own direct reports, inside
 * `loadPerformanceQueue` — the same split `/requests` draws for its queue.
 */
export default async function PerformancePage({
  searchParams,
}: PageProps<"/performance">) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.accountType !== "company") redirect("/my-space");

  const query = await searchParams;
  const filters = performanceFiltersSchema.parse(query);
  const { page: requestedPage } = paginationSchema.parse(query);

  const [departments, { employees, ...meta }] = await Promise.all([
    loadDepartments(actor),
    loadPerformanceQueue(actor, filters, requestedPage),
  ]);

  const isFiltered = Boolean(filters.q || filters.departmentId);

  return (
    <>
      <PageHeader
        title="Performance"
        description="Continuous scores, goals and manager feedback for your team."
      />

      <ListFilters
        basePath="/performance"
        searchPlaceholder="Name or job title"
        selects={[
          {
            name: "departmentId",
            label: "Department",
            anyLabel: "All departments",
            options: [
              ...departments.map((department) => ({
                value: department.id,
                label: department.name,
              })),
              { value: "none", label: "No department" },
            ],
          },
        ]}
      />

      {employees.length === 0 ? (
        <EmptyState
          title={isFiltered ? "No matches" : "No employees yet"}
          description={
            isFiltered
              ? "No employee matches those filters. Try a different search, or clear the filters."
              : "Once your company has employees, their scores appear here."
          }
          action={
            isFiltered ? (
              <Link
                href="/performance"
                className="text-brand-brown underline-offset-4 hover:underline"
              >
                Clear filters
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <CardContent className="py-2">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-muted">
                  <tr className="text-text-secondary text-meta">
                    <th className="rounded-l-lg px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Department</th>
                    <th className="px-3 py-2 font-medium">Job title</th>
                    <th className="rounded-r-lg px-3 py-2 font-medium">
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee.id} className="border-border border-b">
                      <td className="px-3 py-3">
                        <Link
                          href={`/performance/employee/${employee.id}`}
                          className="text-brand-brown font-medium underline-offset-4 hover:underline"
                        >
                          {employee.fullName}
                        </Link>
                      </td>
                      <td className="text-text-secondary px-3 py-3">
                        {employee.department?.name ?? "—"}
                      </td>
                      <td className="text-text-secondary px-3 py-3">
                        {employee.jobRole ?? "—"}
                      </td>
                      <td className="min-w-32 px-3 py-3">
                        <PerformanceScoreBadge
                          score={
                            employee.latestScore === null
                              ? null
                              : Number(employee.latestScore)
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Pagination basePath="/performance" query={query} meta={meta} />
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import { directoryFilter } from "@/lib/employees";
import { loadDepartments } from "@/lib/employee-data";
import {
  canManageEmployees,
  canViewAllEmployees,
  employeeSectionsFor,
} from "@/lib/permissions";
import { paginationMeta, paginationSchema } from "@/lib/pagination";
import { directoryFiltersSchema } from "@/lib/validations/employees";
import { EmptyState, PageHeader } from "@/components/dashboard/page-header";
import { SectionTabs } from "@/components/dashboard/section-tabs";
import { ListFilters } from "@/components/dashboard/list-filters";
import { Pagination } from "@/components/dashboard/pagination";
import { EmployeeStatusBadge } from "@/components/employees/status-badge";
import { WorkloadBar } from "@/components/dashboard/workload-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Employees — WorkPulse" };

/**
 * Employee directory (Phases.md Phase 3).
 *
 * Search and filters live in the URL and are applied by the database, so the
 * page never holds a client-side copy of the list and a filtered view can be
 * linked or bookmarked.
 */
export default async function EmployeesPage({
  searchParams,
}: PageProps<"/employees">) {
  const actor = await getActor();
  if (!actor) redirect("/login");

  // Middleware already keeps employees out of this area; re-checked here
  // because this page reads company-wide data (Rules.md section 3).
  if (!canViewAllEmployees(actor)) redirect("/my-space");

  const query = await searchParams;
  const filters = directoryFiltersSchema.parse(query);
  const { page: requestedPage } = paginationSchema.parse(query);
  const mayManage = canManageEmployees(actor);

  const where = scopedWhere(actor, directoryFilter(filters));

  const [departments, total] = await Promise.all([
    loadDepartments(actor),
    db.employee.count({ where }),
  ]);
  const meta = paginationMeta(total, requestedPage);

  const employees = await db.employee.findMany({
    // Tenant scoping (Rules.md section 2) — applied last, so a filter can
    // never widen the query beyond the caller's own company.
    where,
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      employeeCode: true,
      companyEmail: true,
      jobRole: true,
      status: true,
      department: { select: { name: true } },
      manager: { select: { fullName: true } },
      managerAccount: { select: { fullName: true } },
      workloadPercent: true,
    },
    skip: meta.skip,
    take: meta.take,
  });

  const isFiltered = Boolean(
    filters.q || filters.departmentId || filters.status
  );

  return (
    <>
      <PageHeader
        title="Employees"
        description="Everyone in your company workspace. Employees cannot sign themselves up — they are added here and invited by email."
        action={
          mayManage ? (
            <Button asChild>
              <Link href="/employees/new">
                <UserPlus aria-hidden />
                Add employee
              </Link>
            </Button>
          ) : undefined
        }
      />

      <SectionTabs
        label="Employees sections"
        items={employeeSectionsFor(actor)}
      />

      <ListFilters
        basePath="/employees"
        searchPlaceholder="Name, employee ID, email or job title"
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
          {
            name: "status",
            label: "Status",
            anyLabel: "Any status",
            options: [
              { value: "Active", label: "Active" },
              { value: "Invited", label: "Invited" },
              { value: "Suspended", label: "Suspended" },
            ],
          },
        ]}
      />

      {employees.length === 0 ? (
        isFiltered ? (
          <EmptyState
            title="No matches"
            description="No employee matches those filters. Try a different search, or clear the filters to see everyone."
            action={
              <Button asChild variant="outline">
                <Link href="/employees">Clear filters</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No employees yet"
            description={
              mayManage
                ? "Add your first team member and we will send them an invite to set their own password."
                : "Your admin or HR team adds people to the workspace."
            }
            action={
              mayManage ? (
                <Button asChild>
                  <Link href="/employees/new">Add your first employee</Link>
                </Button>
              ) : undefined
            }
          />
        )
      ) : (
        <Card>
          <CardContent className="py-2">
            <p className="text-text-secondary text-meta mb-4">
              {total === 1 ? "1 person" : `${total} people`}
              {isFiltered ? " matching your filters" : ""}
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                {/* Design.md section 6: surface-muted header, thin row rules,
                    no zebra striping. */}
                <thead className="bg-surface-muted">
                  <tr className="text-text-secondary text-meta">
                    <th className="rounded-l-lg px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Employee ID</th>
                    <th className="px-3 py-2 font-medium">Department</th>
                    <th className="px-3 py-2 font-medium">Job title</th>
                    <th className="px-3 py-2 font-medium">Reports to</th>
                    <th className="px-3 py-2 font-medium">Workload</th>
                    <th className="rounded-r-lg px-3 py-2 font-medium">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee.id} className="border-border border-b">
                      <td className="px-3 py-3">
                        <Link
                          href={`/employees/${employee.id}`}
                          className="text-brand-brown font-medium underline-offset-4 hover:underline"
                        >
                          {employee.fullName}
                        </Link>
                        <span className="text-text-secondary text-meta block">
                          {employee.companyEmail}
                        </span>
                      </td>
                      <td className="text-text-secondary px-3 py-3">
                        {employee.employeeCode}
                      </td>
                      <td className="text-text-secondary px-3 py-3">
                        {employee.department?.name ?? "—"}
                      </td>
                      <td className="text-text-secondary px-3 py-3">
                        {employee.jobRole ?? "—"}
                      </td>
                      <td className="text-text-secondary px-3 py-3">
                        {employee.manager?.fullName ??
                          employee.managerAccount?.fullName ??
                          "—"}
                      </td>
                      <td className="min-w-40 px-3 py-3">
                        <WorkloadBar
                          percent={
                            employee.workloadPercent === null
                              ? null
                              : Number(employee.workloadPercent)
                          }
                        />
                      </td>
                      <td className="px-3 py-3">
                        <EmployeeStatusBadge status={employee.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Pagination basePath="/employees" query={query} meta={meta} />
    </>
  );
}

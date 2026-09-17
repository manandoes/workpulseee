import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import { buildOrgTree } from "@/lib/employees";
import {
  canManageEmployees,
  canViewAllEmployees,
  employeeSectionsFor,
} from "@/lib/permissions";
import { EmptyState, PageHeader } from "@/components/dashboard/page-header";
import { SectionTabs } from "@/components/dashboard/section-tabs";
import { OrgTree } from "@/components/employees/org-tree";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Org chart — WorkPulse" };

/**
 * Reporting structure (Phases.md Phase 3 — "org structure, manager to
 * reports").
 *
 * The whole company is loaded in two queries and the tree is assembled in
 * memory by `buildOrgTree`, rather than walking the reporting line with a
 * query per level.
 */
export default async function OrgChartPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canViewAllEmployees(actor)) redirect("/my-space");

  const [accounts, employees] = await Promise.all([
    db.companyAccount.findMany({
      where: scopedWhere(actor),
      select: { id: true, fullName: true, role: true },
    }),
    db.employee.findMany({
      where: scopedWhere(actor),
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        jobRole: true,
        status: true,
        managerId: true,
        managerAccountId: true,
        department: { select: { name: true } },
      },
    }),
  ]);

  const tree = buildOrgTree(
    accounts,
    employees.map((employee) => ({
      ...employee,
      departmentName: employee.department?.name ?? null,
    }))
  );

  return (
    <>
      <PageHeader
        title="Org chart"
        description="Who reports to whom. Set a person's manager on their profile to place them here."
      />

      <SectionTabs
        label="Employees sections"
        items={employeeSectionsFor(actor)}
      />

      {employees.length === 0 && accounts.length === 0 ? (
        <EmptyState
          title="Nothing to chart yet"
          description="Once you add people to the workspace and set their managers, the reporting structure appears here."
          action={
            canManageEmployees(actor) ? (
              <Button asChild>
                <Link href="/employees/new">Add an employee</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <CardContent className="py-2">
            <OrgTree nodes={tree} />
          </CardContent>
        </Card>
      )}
    </>
  );
}

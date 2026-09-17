import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import { formatManagerRef, managerRefFrom } from "@/lib/employees";
import { loadDepartments, loadManagerOptions } from "@/lib/employee-data";
import {
  canEditEmployee,
  canViewAllEmployees,
  canViewPersonalDetails,
} from "@/lib/permissions";
import { toDateInputValue } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmployeeForm } from "@/components/employees/employee-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Edit employee — WorkPulse" };

/**
 * Edit an employee profile.
 *
 * Owner/Admin/HR may edit anyone in their company; a Manager may edit only
 * their own direct reports (PRD.md section 9). The same predicates run again in
 * `PATCH /api/employees/[id]` — this page only decides what to render.
 */
export default async function EditEmployeePage({
  params,
}: PageProps<"/employees/[id]/edit">) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canViewAllEmployees(actor)) redirect("/my-space");

  const { id } = await params;

  const employee = await db.employee.findFirst({
    where: scopedWhere(actor, { id }),
    select: {
      id: true,
      fullName: true,
      companyEmail: true,
      employeeCode: true,
      jobRole: true,
      employmentType: true,
      startDate: true,
      managerId: true,
      managerAccountId: true,
      personalEmail: true,
      phone: true,
      dateOfBirth: true,
      location: true,
      address: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      department: { select: { name: true } },
    },
  });

  if (!employee) notFound();
  if (!canEditEmployee(actor, employee)) redirect(`/employees/${employee.id}`);

  const canEditPersonal = canViewPersonalDetails(actor, employee);

  const [departments, managerGroups] = await Promise.all([
    loadDepartments(actor),
    loadManagerOptions(actor, employee.id),
  ]);

  return (
    <>
      <PageHeader
        title={`Edit ${employee.fullName}`}
        description="Changes take effect immediately. Their sign-in details change if you edit the work email or employee ID."
      />

      <Card>
        <CardContent className="py-2">
          <EmployeeForm
            mode="edit"
            employeeId={employee.id}
            cancelHref={`/employees/${employee.id}`}
            departments={departments.map((department) => department.name)}
            managerGroups={managerGroups}
            canEditPersonal={canEditPersonal}
            defaultValues={{
              fullName: employee.fullName,
              companyEmail: employee.companyEmail,
              employeeCode: employee.employeeCode,
              departmentName: employee.department?.name ?? "",
              jobRole: employee.jobRole ?? "",
              employmentType: employee.employmentType ?? "",
              startDate: toDateInputValue(employee.startDate),
              manager: formatManagerRef(managerRefFrom(employee)),
              personalEmail: employee.personalEmail ?? "",
              phone: employee.phone ?? "",
              dateOfBirth: toDateInputValue(employee.dateOfBirth),
              location: employee.location ?? "",
              address: employee.address ?? "",
              emergencyContactName: employee.emergencyContactName ?? "",
              emergencyContactPhone: employee.emergencyContactPhone ?? "",
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}

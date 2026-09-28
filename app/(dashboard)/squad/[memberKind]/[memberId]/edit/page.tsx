import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import { formatManagerRef, managerRefFrom } from "@/lib/employees";
import { loadDepartments, loadManagerOptions } from "@/lib/employee-data";
import { canManageEmployees, canViewPersonalDetails } from "@/lib/permissions";
import { toDateInputValue } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmployeeForm } from "@/components/employees/employee-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Edit profile" };

/**
 * Edit a colleague's profile from Squad (Phase 11, Phase 5 of the plan) —
 * the "Employee records" power's employee-reachable surface. Reuses
 * `EmployeeForm`/`PATCH /api/employees/[id]` verbatim (that route checks the
 * same `canManageEmployees`); only the redirect targets and
 * the gate on this page differ from `employees/[id]/edit/page.tsx` — no
 * `canViewAllEmployees` check, since that requires a company account and
 * would lock out the very employee this page exists for.
 */
export default async function SquadMemberEditPage({
  params,
}: PageProps<"/squad/[memberKind]/[memberId]/edit">) {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const { memberKind, memberId } = await params;
  if (memberKind !== "employee") notFound();

  const employee = await db.employee.findFirst({
    where: scopedWhere(actor, { id: memberId }),
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
  if (!canManageEmployees(actor)) redirect(`/squad/employee/${employee.id}`);

  const canEditPersonal = canViewPersonalDetails(actor, employee);
  // Separate switches: without the personal-details power the personal
  // values must not even reach the form's serialized props — blanks instead.
  const personal = canEditPersonal ? employee : null;

  const [departments, managerGroups] = await Promise.all([
    loadDepartments(actor),
    loadManagerOptions(actor, employee.id),
  ]);

  return (
    <>
      <PageHeader
        title={`Edit ${employee.fullName}`}
        description="Changes take effect immediately."
      />

      <Card>
        <CardContent className="py-2">
          <EmployeeForm
            mode="edit"
            employeeId={employee.id}
            cancelHref={`/squad/employee/${employee.id}`}
            editRedirectHref={`/squad/employee/${employee.id}`}
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
              personalEmail: personal?.personalEmail ?? "",
              phone: personal?.phone ?? "",
              dateOfBirth: toDateInputValue(personal?.dateOfBirth ?? null),
              location: personal?.location ?? "",
              address: personal?.address ?? "",
              emergencyContactName: personal?.emergencyContactName ?? "",
              emergencyContactPhone: personal?.emergencyContactPhone ?? "",
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { loadDepartments, loadManagerOptions } from "@/lib/employee-data";
import { canManageEmployees } from "@/lib/permissions";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmployeeForm } from "@/components/employees/employee-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Add employee — WorkPulse" };

/**
 * Add an employee (Architecture.md section 8 — employees never self-register;
 * an Owner, Admin or HR user creates the record and an invite link is sent).
 */
export default async function NewEmployeePage() {
  const actor = await getActor();
  if (!actor) redirect("/login");

  // The API enforces this too; redirecting here keeps a role that cannot add
  // people from being shown a form that would only fail (Rules.md section 3).
  if (!canManageEmployees(actor)) redirect("/employees");

  const [departments, managerGroups] = await Promise.all([
    loadDepartments(actor),
    loadManagerOptions(actor),
  ]);

  return (
    <>
      <PageHeader
        title="Add an employee"
        description="They will receive a link to choose their own password. You never set it for them."
      />

      <Card>
        <CardContent className="py-2">
          <EmployeeForm
            mode="create"
            cancelHref="/employees"
            departments={departments.map((department) => department.name)}
            managerGroups={managerGroups}
            canEditPersonal={false}
            defaultValues={{
              fullName: "",
              companyEmail: "",
              employeeCode: "",
              departmentName: "",
              jobRole: "",
              employmentType: "",
              startDate: "",
              manager: "",
              personalEmail: "",
              phone: "",
              dateOfBirth: "",
              location: "",
              address: "",
              emergencyContactName: "",
              emergencyContactPhone: "",
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}

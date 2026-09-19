import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManagePayroll } from "@/lib/permissions";
import { loadPayrollEmployees, loadSalaryTemplate } from "@/lib/payroll-data";
import { PageHeader } from "@/components/dashboard/page-header";
import { PayrollManager } from "@/components/payroll/payroll-manager";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Payroll" };

/**
 * Define the salary structure and issue each month's slips
 * (Plan: salary slips). Employees download their own from Settings.
 */
export default async function PayrollPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canManagePayroll(actor)) redirect("/dashboard");

  const [employees, components, company] = await Promise.all([
    loadPayrollEmployees(actor),
    loadSalaryTemplate(actor.companyId),
    db.company.findUniqueOrThrow({
      where: { id: actor.companyId },
      select: { currency: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Payroll"
        description="Set the salary structure once, then issue each month's slips. Employees download published slips from their own Settings page."
      />

      <Card>
        <CardContent className="py-2">
          <PayrollManager
            employees={employees}
            components={components}
            currency={company.currency}
          />
        </CardContent>
      </Card>
    </>
  );
}

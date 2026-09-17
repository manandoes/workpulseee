import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AuthPathTabs } from "@/components/marketing/auth-path-tabs";
import { EmployeeLoginForm } from "@/components/auth/employee-login-form";

export const metadata: Metadata = {
  title: "Employee Login — WorkPulse",
  description:
    "Sign in to WorkPulse as an employee using your company ID and employee ID or email.",
};

/**
 * Employee sign-in. Authenticates against the Employee table only, and never
 * consults CompanyAccount (Architecture.md section 8).
 */
export default async function EmployeeLoginPage({
  searchParams,
}: PageProps<"/login/employee">) {
  // Invite links carry the company along, so employees rarely have to type it.
  const params = await searchParams;
  const company = typeof params.company === "string" ? params.company : "";

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 py-2">
        <AuthPathTabs active="employee" />

        <div className="flex flex-col gap-2">
          <h1 className="text-h1 text-brand-brown font-semibold">
            Employee Login
          </h1>
          <p className="text-text-secondary">
            For employees invited by their company.
          </p>
        </div>

        <Suspense fallback={null}>
          <EmployeeLoginForm defaultCompanySlug={company} />
        </Suspense>

        <p className="text-text-secondary text-meta">
          Employees do not sign up here — your company invites you, and the
          invite email contains your link.
        </p>
      </CardContent>
    </Card>
  );
}

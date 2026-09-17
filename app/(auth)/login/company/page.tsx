import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AuthPathTabs } from "@/components/marketing/auth-path-tabs";
import { CompanyLoginForm } from "@/components/auth/company-login-form";

export const metadata: Metadata = {
  title: "Company Login — WorkPulse",
  description:
    "Sign in to your WorkPulse company workspace as an owner, admin, manager, or HR user.",
};

/**
 * Company sign-in. Authenticates against the CompanyAccount table only
 * (Architecture.md section 8).
 */
export default function CompanyLoginPage() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-6 py-2">
        <AuthPathTabs active="company" />

        <div className="flex flex-col gap-2">
          <h1 className="text-h1 text-brand-brown font-semibold">
            Company Login
          </h1>
          <p className="text-text-secondary">
            For owners, admins, managers, and HR.
          </p>
        </div>

        <Suspense fallback={null}>
          <CompanyLoginForm />
        </Suspense>

        <p className="text-text-secondary text-meta">
          Don&apos;t have a workspace yet?{" "}
          <Link
            href="/register"
            className="text-brand-brown font-medium underline underline-offset-4"
          >
            Create a company account
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}

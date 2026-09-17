import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { RegisterCompanyForm } from "@/components/auth/register-company-form";

export const metadata: Metadata = {
  title: "Create a company account — WorkPulse",
  description:
    "Register your agency on WorkPulse and create your company workspace.",
};

/**
 * The only self-service registration path in the product. It creates a Company
 * plus its first CompanyAccount with the Owner role.
 */
export default function RegisterPage() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-6 py-2">
        <div className="flex flex-col gap-2">
          <h1 className="text-h1 text-brand-brown font-semibold">
            Create your company account
          </h1>
          <p className="text-text-secondary">
            This creates your workspace and makes you its owner. You can invite
            your team straight afterwards.
          </p>
        </div>

        <RegisterCompanyForm />

        <p className="text-text-secondary text-meta">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-brand-brown font-medium underline underline-offset-4"
          >
            Sign in
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}

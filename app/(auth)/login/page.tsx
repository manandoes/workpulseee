import type { Metadata } from "next";
import Link from "next/link";
import { Building2, UserRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Sign in — WorkPulse",
  description:
    "Sign in to WorkPulse as a company admin or as an employee of a company.",
};

/**
 * Login path chooser (PRD.md section 6.0.1). The two audiences authenticate
 * against different tables, so they are routed to separate pages from here.
 * The forms themselves are built in Phase 2.
 */
const PATHS = [
  {
    href: "/login/company",
    icon: Building2,
    label: "Company Login",
    description:
      "For owners, admins, managers, and HR who manage the company account.",
  },
  {
    href: "/login/employee",
    icon: UserRound,
    label: "Employee Login",
    description:
      "For employees who were invited by their company. You cannot sign up yourself.",
  },
] as const;

export default function LoginPage() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-6 py-2">
        <div className="flex flex-col gap-2">
          <h1 className="text-h1 text-brand-brown font-semibold">Sign in</h1>
          <p className="text-text-secondary">Choose how you use WorkPulse.</p>
        </div>

        <div className="flex flex-col gap-3">
          {PATHS.map((path) => (
            <Link
              key={path.href}
              href={path.href}
              className="border-border hover:border-brand-yellow hover:bg-brand-yellow-light flex items-start gap-3 rounded-xl border p-4 transition-colors"
            >
              <path.icon
                aria-hidden
                className="text-brand-brown-soft mt-0.5 size-5 shrink-0"
                strokeWidth={1.5}
              />
              <span className="flex flex-col gap-1">
                <span className="text-brand-brown font-semibold">
                  {path.label}
                </span>
                <span className="text-text-secondary text-meta">
                  {path.description}
                </span>
              </span>
            </Link>
          ))}
        </div>

        <p className="text-text-secondary text-meta">
          New here?{" "}
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

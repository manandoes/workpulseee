"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { FormError, FormField } from "@/components/forms/fields";
import {
  registerCompanySchema,
  type RegisterCompanyInput,
} from "@/lib/validations/auth";

/**
 * Company registration (Phases.md Phase 2) — creates the tenant plus its Owner
 * account, then signs the new owner straight in.
 */
export function RegisterCompanyForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterCompanyInput>({
    resolver: zodResolver(registerCompanySchema),
    defaultValues: {
      companyName: "",
      fullName: "",
      workEmail: "",
      password: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    const response = await fetch("/api/auth/company/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      // Surface field-level messages from the server next to their inputs.
      if (body?.fieldErrors) {
        for (const [field, message] of Object.entries(
          body.fieldErrors as Record<string, string>
        )) {
          setError(field as keyof RegisterCompanyInput, { message });
        }
      }
      setFormError(body?.error ?? "Could not create your company account.");
      return;
    }

    // Registration succeeded; sign in with the credentials just created.
    const result = await signIn("company-login", {
      workEmail: values.workEmail,
      password: values.password,
      companySlug: body.company.slug,
      redirect: false,
    });

    if (result?.error) {
      setFormError(
        "Your company was created, but signing in failed. Please sign in manually."
      );
      return;
    }

    // No trial (Plan: Razorpay billing, requirement 2) — every new company
    // must choose a plan and pay before reaching the dashboard.
    router.push("/billing");
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError message={formError} />

      <FormField
        id="companyName"
        label="Company name"
        placeholder="Northwind Studio"
        autoComplete="organization"
        hint="Your company ID is generated from this and used by employees to sign in."
        error={errors.companyName?.message}
        {...register("companyName")}
      />

      <FormField
        id="fullName"
        label="Your full name"
        placeholder="Priya Sharma"
        autoComplete="name"
        error={errors.fullName?.message}
        {...register("fullName")}
      />

      <FormField
        id="workEmail"
        label="Work email"
        type="email"
        placeholder="you@northwind.com"
        autoComplete="email"
        error={errors.workEmail?.message}
        {...register("workEmail")}
      />

      <FormField
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        error={errors.password?.message}
        {...register("password")}
      />

      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? "Creating your workspace…" : "Create company account"}
      </Button>
    </form>
  );
}

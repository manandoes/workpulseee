"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormError, FormField, TextareaField } from "@/components/forms/fields";
import {
  createGoalSchema,
  type CreateGoalInput,
} from "@/lib/validations/performance";
import type { PerformanceSubject } from "@/lib/performance-data";

/**
 * Set a goal for a subject (Phases.md Phase 8 — "goal creation/tracking"),
 * widened to company accounts too (Plan: performance for all company
 * accounts).
 *
 * Manager-owned for an employee, Owner/Admin-owned for a company account
 * (confirmed with the user): only rendered where the caller has already
 * checked `canEditEmployee`/`isCompanyAdmin` — the subject reads goals on
 * their own growth/profile page but never creates them here.
 */
export function GoalForm({ subject }: { subject: PerformanceSubject }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateGoalInput>({
    resolver: zodResolver(createGoalSchema),
    defaultValues: { title: "", description: "", targetDate: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    const response = await fetch(
      `/api/performance/${subject.kind}/${subject.id}/goals`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      }
    );

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      if (body?.fieldErrors) {
        for (const [field, message] of Object.entries(
          body.fieldErrors as Record<string, string>
        )) {
          setError(field as keyof CreateGoalInput, { message });
        }
      }
      setFormError(body?.error ?? "Could not set this goal.");
      return;
    }

    toast.success("Goal set");
    reset();
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError message={formError} />

      <FormField
        id="title"
        label="Goal"
        placeholder="Ship the Q3 onboarding redesign"
        error={errors.title?.message}
        {...register("title")}
      />

      <TextareaField
        id="description"
        label="Details (optional)"
        rows={3}
        placeholder="What success looks like."
        error={errors.description?.message}
        {...register("description")}
      />

      <FormField
        id="targetDate"
        label="Target date (optional)"
        type="date"
        error={errors.targetDate?.message}
        {...register("targetDate")}
      />

      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Setting…" : "Set goal"}
        </Button>
      </div>
    </form>
  );
}

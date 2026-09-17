"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  FormError,
  SelectField,
  TextareaField,
} from "@/components/forms/fields";
import {
  createFeedbackSchema,
  type CreateFeedbackInput,
} from "@/lib/validations/performance";
import type { PerformanceSubject } from "@/lib/performance-data";

const RATING_OPTIONS = [
  { value: "5", label: "5 — Excellent" },
  { value: "4", label: "4 — Good" },
  { value: "3", label: "3 — Satisfactory" },
  { value: "2", label: "2 — Needs improvement" },
  { value: "1", label: "1 — Unsatisfactory" },
];

/**
 * Give a subject feedback (Phases.md Phase 8 — "manager feedback log"),
 * widened to company accounts too (Plan: performance for all company
 * accounts).
 *
 * Visible to the subject immediately on submission (confirmed with the
 * user) — there is no draft/private state. Manager-owned for an employee,
 * Owner/Admin-owned for a company account, like goals: only rendered where
 * the caller has already checked `canEditEmployee`/`isCompanyAdmin`.
 */
export function FeedbackForm({ subject }: { subject: PerformanceSubject }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateFeedbackInput>({
    resolver: zodResolver(createFeedbackSchema),
    defaultValues: { rating: "3", body: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    const response = await fetch(
      `/api/performance/${subject.kind}/${subject.id}/feedback`,
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
          setError(field as keyof CreateFeedbackInput, { message });
        }
      }
      setFormError(body?.error ?? "Could not save this feedback.");
      return;
    }

    toast.success("Feedback shared");
    reset();
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError message={formError} />

      <SelectField
        id="rating"
        label="Rating"
        options={RATING_OPTIONS}
        error={errors.rating?.message}
        {...register("rating")}
      />

      <TextareaField
        id="body"
        label="Feedback"
        rows={4}
        placeholder="Visible to the employee as soon as you save it."
        error={errors.body?.message}
        {...register("body")}
      />

      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Sharing…" : "Share feedback"}
        </Button>
      </div>
    </form>
  );
}

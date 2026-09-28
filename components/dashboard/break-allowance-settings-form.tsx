"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormError, FormField } from "@/components/forms/fields";
import {
  breakAllowanceSettingsSchema,
  type BreakAllowanceSettingsInput,
} from "@/lib/validations/settings";

/**
 * The daily break allowance the break overlay counts down from. Mirrors
 * `WorkingDaySettingsForm` — one field instead of two.
 */
export function BreakAllowanceSettingsForm({
  dailyBreakMinutes,
}: {
  dailyBreakMinutes: number;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BreakAllowanceSettingsInput>({
    resolver: zodResolver(breakAllowanceSettingsSchema),
    defaultValues: { dailyBreakMinutes: String(dailyBreakMinutes) },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    const response = await fetch("/api/settings/break-allowance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      if (body?.fieldErrors) {
        for (const [field, message] of Object.entries(
          body.fieldErrors as Record<string, string>
        )) {
          setError(field as keyof BreakAllowanceSettingsInput, { message });
        }
      }
      setFormError(body?.error ?? "Could not save this.");
      return;
    }

    toast.success("Break allowance saved.");
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError message={formError} />

      <FormField
        id="dailyBreakMinutes"
        label="Break minutes per day"
        hint="Shared across every break someone takes in a working day."
        inputMode="numeric"
        fieldClassName="max-w-xs"
        error={errors.dailyBreakMinutes?.message}
        {...register("dailyBreakMinutes")}
      />

      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

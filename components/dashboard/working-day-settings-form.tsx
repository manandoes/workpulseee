"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormError, FormField } from "@/components/forms/fields";
import { minutesToTimeInput } from "@/lib/timezone";
import {
  workingDaySettingsSchema,
  type WorkingDaySettingsInput,
} from "@/lib/validations/settings";

/**
 * When the working day ends, and the zone that is measured in. Mirrors
 * `AlertSettingsForm` — two fields instead of three.
 *
 * The zone is a free-text IANA name rather than a picker: the full list runs
 * to several hundred, the browser can offer the right default without one
 * (`Intl.DateTimeFormat().resolvedOptions().timeZone`, the button below), and
 * both this form and the route validate against ICU itself, so a typo is
 * caught either way.
 */
export function WorkingDaySettingsForm({
  endOfDayMinutes,
  timeZone,
}: {
  endOfDayMinutes: number;
  timeZone: string;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<WorkingDaySettingsInput>({
    resolver: zodResolver(workingDaySettingsSchema),
    defaultValues: {
      endOfDay: minutesToTimeInput(endOfDayMinutes),
      timeZone,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    const response = await fetch("/api/settings/working-day", {
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
          setError(field as keyof WorkingDaySettingsInput, { message });
        }
      }
      setFormError(body?.error ?? "Could not save this.");
      return;
    }

    toast.success("Working day saved.");
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError message={formError} />

      <FormField
        id="endOfDay"
        label="Working day ends at"
        hint="Anyone still logged in an hour after this is reminded to log out."
        type="time"
        fieldClassName="max-w-xs"
        error={errors.endOfDay?.message}
        {...register("endOfDay")}
      />

      <div className="flex flex-col gap-1">
        <FormField
          id="timeZone"
          label="Timezone"
          hint="An IANA name, like Asia/Kolkata — what the time above is read in."
          fieldClassName="max-w-xs"
          error={errors.timeZone?.message}
          {...register("timeZone")}
        />
        <button
          type="button"
          onClick={() =>
            setValue(
              "timeZone",
              Intl.DateTimeFormat().resolvedOptions().timeZone,
              { shouldValidate: true, shouldDirty: true }
            )
          }
          className="text-text-secondary hover:text-brand-brown text-meta self-start underline-offset-4 hover:underline"
        >
          Use this browser&apos;s timezone
        </button>
      </div>

      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

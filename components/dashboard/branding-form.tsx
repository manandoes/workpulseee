"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormError, FormField } from "@/components/forms/fields";
import {
  brandColorSchema,
  type BrandColorInput,
} from "@/lib/validations/settings";

/**
 * Owner-only brand color picker (Plan: brand color) — the dashboard's single
 * accent color, company-wide (`Company.brandColor`), unlike the personal
 * theme toggle. Only ever rendered for the Owner (`canManageBranding`
 * checked on the settings page before mounting this).
 */
export function BrandingForm({ brandColor }: { brandColor: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BrandColorInput>({
    resolver: zodResolver(brandColorSchema),
    defaultValues: { brandColor },
  });

  const currentValue = watch("brandColor");

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    const response = await fetch("/api/settings/branding", {
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
          setError(field as keyof BrandColorInput, { message });
        }
      }
      setFormError(body?.error ?? "Could not save this.");
      return;
    }

    toast.success("Brand color updated.");
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError message={formError} />

      <div className="flex items-end gap-3">
        {/* Native color swatch — a live preview and picker that writes
            straight into the same registered field the hex input below
            edits, so either control keeps the other in sync. */}
        <input
          type="color"
          aria-label="Pick a brand color"
          value={/^#[0-9a-f]{6}$/i.test(currentValue) ? currentValue : "#ffcc00"}
          onChange={(event) =>
            setValue("brandColor", event.target.value, {
              shouldValidate: true,
            })
          }
          className="border-border size-10 shrink-0 cursor-pointer rounded-lg border p-0.5"
        />

        <FormField
          id="brandColor"
          label="Brand color"
          hint="Used for the active navigation item, buttons and accents across the dashboard."
          fieldClassName="max-w-xs"
          error={errors.brandColor?.message}
          {...register("brandColor")}
        />
      </div>

      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

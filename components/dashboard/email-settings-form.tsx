"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormError, FormField, SelectField } from "@/components/forms/fields";
import {
  emailSettingsSchema,
  type EmailSettingsInput,
} from "@/lib/validations/settings";

/**
 * Owner-only email delivery settings (Settings -> Email delivery) — the
 * company's own Resend/Brevo identity, used for invite and notification
 * emails instead of the shared default sender. Only ever rendered for the
 * Owner (`canManageEmailSettings` checked on the settings page before
 * mounting this), same pattern as `BrandingForm`.
 *
 * The API key is never sent back from the server, so the field starts blank;
 * `emailApiKeySet` only changes its placeholder/required-ness, never its
 * value.
 */
export function EmailSettingsForm({
  emailProvider,
  emailFromAddress,
  emailApiKeySet,
}: {
  emailProvider: "resend" | "brevo" | null;
  emailFromAddress: string | null;
  emailApiKeySet: boolean;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [keySet, setKeySet] = useState(emailApiKeySet);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EmailSettingsInput>({
    resolver: zodResolver(emailSettingsSchema),
    defaultValues: {
      emailProvider: emailProvider ?? "resend",
      emailFromAddress: emailFromAddress ?? "",
      emailApiKey: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    const response = await fetch("/api/settings/email", {
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
          setError(field as keyof EmailSettingsInput, { message });
        }
      }
      setFormError(body?.error ?? "Could not save this.");
      return;
    }

    toast.success("Email delivery settings updated.");
    setKeySet(body.emailApiKeySet);
    reset({
      emailProvider: body.emailProvider,
      emailFromAddress: body.emailFromAddress,
      emailApiKey: "",
    });
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError message={formError} />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="emailProvider"
          label="Provider"
          error={errors.emailProvider?.message}
          options={[
            { value: "resend", label: "Resend" },
            { value: "brevo", label: "Brevo" },
          ]}
          {...register("emailProvider")}
        />
        <FormField
          id="emailFromAddress"
          label="From address"
          placeholder="Acme Inc <noreply@acme.com>"
          error={errors.emailFromAddress?.message}
          {...register("emailFromAddress")}
        />
      </div>

      <FormField
        id="emailApiKey"
        label="API key"
        type="password"
        autoComplete="off"
        placeholder={
          keySet ? "Leave blank to keep the current key" : "Enter your API key"
        }
        hint={
          keySet
            ? "A key is already saved. Enter a new one only to replace it."
            : "Stored encrypted, and never shown back to you."
        }
        error={errors.emailApiKey?.message}
        {...register("emailApiKey")}
      />

      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

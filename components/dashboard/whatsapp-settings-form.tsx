"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormError, FormField } from "@/components/forms/fields";
import {
  whatsappSettingsSchema,
  type WhatsAppSettingsInput,
} from "@/lib/validations/settings";

/**
 * Owner-only WhatsApp delivery settings (Settings -> WhatsApp delivery) — the
 * company's own Meta Business Cloud API identity, used for notification
 * WhatsApps instead of the shared default sender. Only ever rendered for the
 * Owner (`canManageWhatsAppSettings` checked on the settings page before
 * mounting this), same pattern as `EmailSettingsForm`.
 *
 * The access token is never sent back from the server, so the field starts
 * blank; `tokenSet` only changes its placeholder/required-ness, never its
 * value.
 */
export function WhatsAppSettingsForm({
  whatsappPhoneNumberId,
  whatsappTemplateName,
  whatsappTemplateLanguage,
  whatsappAccessTokenSet,
}: {
  whatsappPhoneNumberId: string | null;
  whatsappTemplateName: string | null;
  whatsappTemplateLanguage: string | null;
  whatsappAccessTokenSet: boolean;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [tokenSet, setTokenSet] = useState(whatsappAccessTokenSet);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<WhatsAppSettingsInput>({
    resolver: zodResolver(whatsappSettingsSchema),
    defaultValues: {
      whatsappPhoneNumberId: whatsappPhoneNumberId ?? "",
      whatsappAccessToken: "",
      whatsappTemplateName: whatsappTemplateName ?? "",
      whatsappTemplateLanguage: whatsappTemplateLanguage ?? "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    const response = await fetch("/api/settings/whatsapp", {
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
          setError(field as keyof WhatsAppSettingsInput, { message });
        }
      }
      setFormError(body?.error ?? "Could not save this.");
      return;
    }

    toast.success("WhatsApp delivery settings updated.");
    setTokenSet(body.whatsappAccessTokenSet);
    reset({
      whatsappPhoneNumberId: body.whatsappPhoneNumberId,
      whatsappAccessToken: "",
      whatsappTemplateName: body.whatsappTemplateName,
      whatsappTemplateLanguage: body.whatsappTemplateLanguage,
    });
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError message={formError} />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="whatsappPhoneNumberId"
          label="Phone number ID"
          placeholder="12345678901234567"
          error={errors.whatsappPhoneNumberId?.message}
          {...register("whatsappPhoneNumberId")}
        />
        <FormField
          id="whatsappTemplateName"
          label="Template name"
          placeholder="workpulse_notification"
          error={errors.whatsappTemplateName?.message}
          {...register("whatsappTemplateName")}
        />
      </div>

      <FormField
        id="whatsappTemplateLanguage"
        label="Template language"
        placeholder="en or en_US"
        error={errors.whatsappTemplateLanguage?.message}
        {...register("whatsappTemplateLanguage")}
      />

      <FormField
        id="whatsappAccessToken"
        label="Access token"
        type="password"
        autoComplete="off"
        placeholder={
          tokenSet ? "Leave blank to keep the current token" : "Enter your access token"
        }
        hint={
          tokenSet
            ? "A token is already saved. Enter a new one only to replace it."
            : "Stored encrypted, and never shown back to you."
        }
        error={errors.whatsappAccessToken?.message}
        {...register("whatsappAccessToken")}
      />

      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
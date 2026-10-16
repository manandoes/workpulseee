"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/forms/fields";
import {
  feedbackRecipientSettingsSchema,
  type FeedbackRecipientSettingsInput,
} from "@/lib/validations/settings";

/**
 * Owner-only feedback recipient settings (Plan: software feedback button) —
 * who receives the email when a user submits feedback via the floating
 * dialog. Defaults to `info@automovalabs.tech` when left blank; only
 * rendered for the Owner (`canManageBranding`).
 */
export function FeedbackRecipientSettingsForm({
  feedbackRecipients,
}: {
  feedbackRecipients: string | null;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FeedbackRecipientSettingsInput>({
    resolver: zodResolver(feedbackRecipientSettingsSchema),
    defaultValues: {
      feedbackRecipients: feedbackRecipients ?? "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    const response = await fetch("/api/settings/feedback-recipients", {
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
          setError(field as keyof FeedbackRecipientSettingsInput, { message });
        }
      }
      setFormError(body?.error ?? "Could not save this.");
      return;
    }

    toast.success("Feedback recipients updated.");
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError message={formError} />

      <FormField
        id="feedbackRecipients"
        label="Feedback recipients"
        placeholder="hr@acme.com, support@acme.com"
        hint="Comma-separated emails; defaults to info@automovalabs.tech when blank."
        error={errors.feedbackRecipients?.message}
        {...register("feedbackRecipients")}
      />

      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="text-destructive text-sm" role="alert">
      {message}
    </p>
  );
}

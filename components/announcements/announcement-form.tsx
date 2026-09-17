"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, FormField, TextareaField } from "@/components/forms/fields";
import { createAnnouncementSchema } from "@/lib/validations/announcements";

/**
 * The form's own shape differs from `CreateAnnouncementInput` in two ways
 * `useFieldArray` needs: `poll` is always present (the "Add a poll" toggle
 * decides at submit time whether it is sent at all — see `onSubmit`), and
 * each option is `{ value: string }` rather than a bare string — RHF's
 * field array requires array elements to be objects, so it can key each row
 * by a stable id.
 */
type AnnouncementFormValues = {
  title: string;
  body: string;
  poll: { options: { value: string }[] };
};

/**
 * Post a new announcement, with an optional poll.
 *
 * The poll's options are a dynamic list — `useFieldArray` is the standard
 * React Hook Form tool for exactly this "N text inputs, add/remove a row"
 * shape, and needs no new dependency.
 */
export function AnnouncementForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [includePoll, setIncludePoll] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AnnouncementFormValues>({
    resolver: zodResolver(
      createAnnouncementSchema
    ) as unknown as Resolver<AnnouncementFormValues>,
    defaultValues: {
      title: "",
      body: "",
      poll: { options: [{ value: "" }, { value: "" }] },
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "poll.options",
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    const payload = {
      title: values.title,
      body: values.body,
      ...(includePoll
        ? {
            poll: {
              options: values.poll.options
                .map((option) => option.value.trim())
                .filter(Boolean),
            },
          }
        : {}),
    };

    const response = await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      if (body?.fieldErrors) {
        for (const [field, message] of Object.entries(
          body.fieldErrors as Record<string, string>
        )) {
          setError(field as keyof AnnouncementFormValues, { message });
        }
      }
      setFormError(body?.error ?? "Could not post this announcement.");
      return;
    }

    toast.success("Announcement posted");
    router.push("/announcements");
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <FormError message={formError} />

      <FormField
        id="title"
        label="Title"
        placeholder="Office closed for the holiday"
        error={errors.title?.message}
        {...register("title")}
      />

      <TextareaField
        id="body"
        label="Announcement"
        rows={5}
        error={errors.body?.message}
        {...register("body")}
      />

      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includePoll}
            onChange={(event) => setIncludePoll(event.target.checked)}
            className="size-4"
          />
          <span className="text-brand-brown font-medium">Add a poll</span>
        </label>

        {includePoll ? (
          <div className="flex flex-col gap-2">
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-center gap-2">
                <FormField
                  id={`poll-option-${index}`}
                  label={`Option ${index + 1}`}
                  fieldClassName="flex-1"
                  error={errors.poll?.options?.[index]?.value?.message}
                  {...register(`poll.options.${index}.value` as const)}
                />
                {fields.length > 2 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-6"
                    aria-label={`Remove option ${index + 1}`}
                    onClick={() => remove(index)}
                  >
                    <X aria-hidden className="size-4" />
                  </Button>
                ) : null}
              </div>
            ))}

            {fields.length < 8 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => append({ value: "" })}
              >
                <Plus aria-hidden className="size-4" />
                Add option
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Posting…" : "Post announcement"}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/announcements">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

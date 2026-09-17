"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  FormError,
  FormField,
  SelectField,
  TextareaField,
} from "@/components/forms/fields";
import { requestTypeLabel } from "@/components/requests/status-badge";
import {
  LEAVE_DAY_PARTS,
  REQUEST_TYPES,
  dayPartLabel,
  requestNeedsAmount,
  requestNeedsDateRange,
  requestNeedsDayPart,
} from "@/lib/requests";
import {
  createRequestSchema,
  type CreateRequestInput,
} from "@/lib/validations/requests";

/**
 * Submit a request (Phases.md Phase 7).
 *
 * One form for all eight types: which extra fields show follows the selected
 * type, the same way `lib/requests.ts`'s `requestNeedsDateRange`/
 * `requestNeedsAmount` decide what the server requires, so the two can never
 * disagree about what a type needs.
 */
const TYPE_OPTIONS = REQUEST_TYPES.map((type) => ({
  value: type,
  label: requestTypeLabel(type),
}));

const DAY_PART_OPTIONS = LEAVE_DAY_PARTS.map((dayPart) => ({
  value: dayPart,
  label: dayPartLabel(dayPart),
}));

export function RequestForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateRequestInput>({
    resolver: zodResolver(createRequestSchema),
    defaultValues: {
      type: "Leave",
      subject: "",
      description: "",
      startDate: "",
      endDate: "",
      dayPart: "FullDay",
      amount: "",
    },
  });

  const type = useWatch({ control, name: "type" });
  const needsDateRange = requestNeedsDateRange(type);
  const needsAmount = requestNeedsAmount(type);
  const needsDayPart = requestNeedsDayPart(type);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    const response = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      if (body?.fieldErrors) {
        for (const [field, message] of Object.entries(
          body.fieldErrors as Record<string, string>
        )) {
          setError(field as keyof CreateRequestInput, { message });
        }
      }
      setFormError(body?.error ?? "Could not submit this request.");
      return;
    }

    toast.success("Request submitted");
    router.push(`/my-space/requests/${body.request.id}`);
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <FormError message={formError} />

      <SelectField
        id="type"
        label="Request type"
        options={TYPE_OPTIONS}
        error={errors.type?.message}
        {...register("type")}
      />

      <FormField
        id="subject"
        label="Subject"
        placeholder="Two days of leave for a family event"
        error={errors.subject?.message}
        {...register("subject")}
      />

      {needsDateRange ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="startDate"
            label="Start date"
            type="date"
            error={errors.startDate?.message}
            {...register("startDate")}
          />
          <FormField
            id="endDate"
            label="End date"
            type="date"
            error={errors.endDate?.message}
            {...register("endDate")}
          />
        </div>
      ) : null}

      {needsDayPart ? (
        <SelectField
          id="dayPart"
          label="Day part"
          options={DAY_PART_OPTIONS}
          hint="A first or second half must be a single day."
          error={errors.dayPart?.message}
          {...register("dayPart")}
        />
      ) : null}

      {needsAmount ? (
        <FormField
          id="amount"
          label="Amount"
          inputMode="decimal"
          placeholder="1500"
          hint="In your company's currency."
          error={errors.amount?.message}
          {...register("amount")}
        />
      ) : null}

      <TextareaField
        id="description"
        label="Details"
        rows={5}
        placeholder="Anything your manager or HR needs to know to decide."
        error={errors.description?.message}
        {...register("description")}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Submitting…" : "Submit request"}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/my-space/requests">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

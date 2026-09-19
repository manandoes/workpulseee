"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormError, FormField, TextareaField } from "@/components/forms/fields";
import { Card, CardContent } from "@/components/ui/card";
import {
  proposeMeetingSchema,
  type ProposeMeetingInput,
} from "@/lib/validations/calendar";
import type { CalendarPerson } from "@/components/calendar/calendar-shell";

type FormValues = {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  location: string;
};

/**
 * Book a meeting (Plan.md Phase 17).
 *
 * `startAt`/`endAt` come from `<input type="datetime-local">`, which carries
 * no timezone of its own — the browser treats a bare `"2026-03-15T15:00"` as
 * *local* wall-clock time, so `new Date(...)` (no `Z` appended) already parses
 * it as the viewer's local instant, and `.toISOString()` converts that to the
 * correct UTC value to send. Appending `Z` directly, as this form used to,
 * treated the typed time as UTC — a user in Kolkata typing 15:00 would book
 * 15:00 UTC (20:30 IST), not 15:00 IST.
 */
export function ProposeMeetingForm({
  members,
  onDone,
}: {
  members: CalendarPerson[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { title: "", description: "", startAt: "", endAt: "", location: "" },
  });

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    const participants = [...selected].map((key) => {
      const [kind, id] = key.split(":");
      return { kind: kind as "employee" | "account", id };
    });

    const toInstant = (local: string) =>
      local ? new Date(local).toISOString() : "";

    const payload: ProposeMeetingInput = {
      title: values.title,
      description: values.description,
      startAt: toInstant(values.startAt),
      endAt: toInstant(values.endAt),
      location: values.location,
      participants,
    };

    const parsed = proposeMeetingSchema.safeParse(payload);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }

    const response = await fetch("/api/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setFormError(body?.error ?? "Could not book this meeting.");
      return;
    }

    toast.success("Meeting booked");
    router.refresh();
    onDone();
  });

  return (
    <Card>
      <CardContent className="py-2">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <FormError message={formError} />

          <FormField
            id="title"
            label="Title"
            placeholder="Weekly sync"
            error={errors.title?.message}
            {...register("title")}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="startAt"
              label="Starts"
              type="datetime-local"
              error={errors.startAt?.message}
              {...register("startAt")}
            />
            <FormField
              id="endAt"
              label="Ends"
              type="datetime-local"
              error={errors.endAt?.message}
              {...register("endAt")}
            />
          </div>

          <FormField
            id="location"
            label="Location"
            placeholder="Meeting room, or a link"
            error={errors.location?.message}
            {...register("location")}
          />

          <TextareaField
            id="description"
            label="Description"
            rows={3}
            error={errors.description?.message}
            {...register("description")}
          />

          <div className="flex flex-col gap-1.5">
            <p className="text-brand-brown font-medium">Invite</p>
            <div className="border-border grid max-h-48 grid-cols-2 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-3">
              {members.map((member) => {
                const key = `${member.kind}:${member.id}`;
                return (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      onChange={() => toggle(key)}
                    />
                    {member.name}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Booking…" : "Book meeting"}
            </Button>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

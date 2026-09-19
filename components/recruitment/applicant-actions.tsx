"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { APPLICATION_STAGES } from "@/lib/recruitment";
import type { ApplicationStage } from "@/lib/generated/prisma/enums";

/**
 * Move a candidate, and say why (Plan: hiring).
 *
 * One request carries both: a reviewer rejecting someone writes the reason in
 * the same breath, and splitting it into two calls is how a stage change lands
 * without the note that explains it.
 */
export function ApplicantActions({
  applicationId,
  stage,
}: {
  applicationId: string;
  stage: ApplicationStage;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(nextStage?: ApplicationStage) {
    if (!nextStage && note.trim().length === 0) return;

    setBusy(true);
    try {
      const response = await fetch(
        `/api/hiring/applications/${applicationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(nextStage ? { stage: nextStage } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
          }),
        }
      );

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(data?.error ?? "Could not save that.");
        return;
      }

      setNote("");
      toast.success(nextStage ? `Moved to ${nextStage}.` : "Note added.");
      router.refresh();
    } catch {
      toast.error("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 font-medium">Stage</legend>
        <div className="flex flex-wrap gap-1.5">
          {APPLICATION_STAGES.map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={value === stage ? "default" : "outline"}
              disabled={busy || value === stage}
              aria-current={value === stage ? "true" : undefined}
              className={cn(value === stage && "pointer-events-none")}
              onClick={() => submit(value)}
            >
              {value}
            </Button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="note">Internal note</Label>
        <Textarea
          id="note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={4}
          placeholder="Strong portfolio, thin on motion. Worth a call."
        />
        <p className="text-text-secondary text-meta">
          Only your colleagues see this. It is never sent to the applicant, and
          it is attached to whichever stage you move them to next.
        </p>
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={busy || note.trim().length === 0}
          onClick={() => submit()}
        >
          {busy ? "Saving…" : "Add note"}
        </Button>
      </div>
    </div>
  );
}

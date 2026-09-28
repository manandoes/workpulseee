"use client";

import { useId, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { COMPLETION_NOTE_MAX_LENGTH } from "@/lib/tasks";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Asks for a completion note as a task is moved to Done (Plan: completion
 * note). Optional by design: "Mark as done" works with the box left empty, and
 * cancelling leaves the task exactly where it was.
 *
 * Shared by the status select and the timer's Done button — the two ways a
 * task is finished from a card — so both ask the same question the same way.
 * The caller mounts it only while asking, so every ask starts with an empty
 * box rather than the last task's note.
 */
export function CompletionNoteDialog({
  taskTitle,
  busy,
  onCancel,
  onConfirm,
}: {
  taskTitle?: string;
  /** The save is in flight — both buttons wait for it. */
  busy: boolean;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const noteId = useId();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm(note);
          }}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>Mark as done</DialogTitle>
            <DialogDescription>
              {taskTitle ? `Finishing "${taskTitle}". ` : ""}Leave a note for
              whoever reviews it — what was done, where it lives, anything
              still open.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={noteId} className="text-brand-brown font-medium">
              Completion note{" "}
              <span className="text-text-secondary font-normal">(optional)</span>
            </label>
            <Textarea
              id={noteId}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={COMPLETION_NOTE_MAX_LENGTH}
              rows={4}
              autoFocus
            />
          </div>

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              <CheckCircle2 aria-hidden />
              {busy ? "Saving…" : "Mark as done"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

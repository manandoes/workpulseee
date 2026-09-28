"use client";

import { DateTime } from "@/components/ui/date-time";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextareaField } from "@/components/forms/fields";

/**
 * The conversation on a task (Phases.md Phase 5 — "comments on tasks").
 *
 * Posting and retracting are single actions against
 * `/api/tasks/[id]/comments`, and the page is re-read afterwards rather than
 * kept in React state, so what is on screen is always what the database holds.
 */
export type TaskComment = {
  id: string;
  body: string;
  createdAt: Date | string;
  authorName: string | null;
  /** Whether the signed-in viewer may retract this one. */
  canDelete: boolean;
};

export function TaskComments({
  taskId,
  comments,
  canComment,
}: {
  taskId: string;
  comments: TaskComment[];
  canComment: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function post() {
    if (!body.trim()) return;
    setBusy(true);

    const response = await fetch(`/api/tasks/${taskId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });

    const result = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok) {
      toast.error(result?.error ?? "Could not post that comment.");
      return;
    }

    setBody("");
    router.refresh();
  }

  async function remove(comment: TaskComment) {
    if (!window.confirm("Remove this comment?")) return;
    setBusy(true);

    const response = await fetch(
      `/api/tasks/${taskId}/comments?commentId=${comment.id}`,
      { method: "DELETE" }
    );

    const result = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok) {
      toast.error(result?.error ?? "Could not remove that comment.");
      return;
    }

    toast.success("Comment removed");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {comments.length === 0 ? (
        <p className="text-text-secondary">
          No comments yet.
          {canComment ? " Start the thread below." : ""}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-(--color-border)">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="flex flex-col gap-1 py-3 first:pt-0"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-brand-brown font-medium">
                  {/* An account removed since they wrote it: the message stays
                      and is signed honestly rather than being hidden. */}
                  {comment.authorName ?? "Removed user"}
                </span>
                <span className="text-text-secondary text-meta">
                  <DateTime value={comment.createdAt} />
                </span>
              </div>
              <p className="text-foreground whitespace-pre-line">
                {comment.body}
              </p>
              {comment.canDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  className="self-start"
                  onClick={() => remove(comment)}
                >
                  <Trash2 aria-hidden />
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canComment ? (
        <div className="flex flex-col items-start gap-3">
          <TextareaField
            id="comment"
            label="Add a comment"
            placeholder="Ask a question, or record what was decided."
            value={body}
            onChange={(event) => setBody(event.target.value)}
            fieldClassName="w-full"
          />
          <Button type="button" onClick={post} disabled={busy || !body.trim()}>
            <MessageSquarePlus aria-hidden />
            {busy ? "Working…" : "Comment"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

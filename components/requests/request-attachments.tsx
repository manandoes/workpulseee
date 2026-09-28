"use client";

import { DateTime } from "@/components/ui/date-time";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/forms/fields";

/**
 * Files attached to a request (PRD.md section 6.6, mirrors
 * `components/tasks/task-attachments.tsx`).
 *
 * A link only, for the same reason task attachments are: no object storage is
 * provisioned yet (Architecture.md section 2).
 */
export type RequestAttachment = {
  id: string;
  label: string;
  url: string;
  addedByName: string | null;
  createdAt: Date | string;
  canDelete: boolean;
};

export function RequestAttachments({
  requestId,
  attachments,
  canAttach,
}: {
  requestId: string;
  attachments: RequestAttachment[];
  canAttach: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!url.trim()) return;
    setBusy(true);

    const response = await fetch(`/api/requests/${requestId}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, label }),
    });

    const result = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok) {
      toast.error(
        result?.fieldErrors?.url ?? result?.error ?? "Could not attach that."
      );
      return;
    }

    setUrl("");
    setLabel("");
    toast.success("Attached");
    router.refresh();
  }

  async function remove(attachment: RequestAttachment) {
    if (!window.confirm(`Remove the link to ${attachment.label}?`)) return;
    setBusy(true);

    const response = await fetch(
      `/api/requests/${requestId}/attachments?attachmentId=${attachment.id}`,
      { method: "DELETE" }
    );

    const result = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok) {
      toast.error(result?.error ?? "Could not remove that attachment.");
      return;
    }

    toast.success("Attachment removed");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {attachments.length === 0 ? (
        <p className="text-text-secondary">
          Nothing attached yet.
          {canAttach ? " Add a link to the file below." : ""}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-(--color-border)">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-brown inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline"
                >
                  <ExternalLink
                    aria-hidden
                    className="size-4"
                    strokeWidth={1.5}
                  />
                  {attachment.label}
                </a>
                <span className="text-text-secondary text-meta truncate">
                  {attachment.addedByName ?? "Removed user"} ·{" "}
                  <DateTime value={attachment.createdAt} />
                </span>
              </div>

              {attachment.canDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => remove(attachment)}
                >
                  <Trash2 aria-hidden />
                  <span className="sr-only sm:not-sr-only">Remove</span>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canAttach ? (
        <div className="flex flex-wrap items-end gap-3">
          <FormField
            id="requestAttachmentUrl"
            label="Link to a file"
            type="url"
            inputMode="url"
            placeholder="https://drive.example.com/…"
            hint="Paste a link to the receipt, document or form."
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            fieldClassName="min-w-64 flex-1"
          />
          <FormField
            id="requestAttachmentLabel"
            label="Name (optional)"
            placeholder="Receipt"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            fieldClassName="min-w-48"
          />
          <Button
            type="button"
            onClick={add}
            disabled={busy || !url.trim()}
            className="h-9"
          >
            <Paperclip aria-hidden />
            {busy ? "Working…" : "Attach"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { DateTime } from "@/components/ui/date-time";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, FileText, Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileUpload, type UploadedFile } from "@/components/ui/file-upload";
import { FormField } from "@/components/forms/fields";

/**
 * Files attached to a task (Phases.md Phase 5 — "file attachments on tasks").
 *
 * Two ways to fill the same list: a **link** — the shared doc, the design, the
 * spec — or a file uploaded through `/api/files`.
 *
 * Links open in a new tab with `rel="noopener noreferrer"`: they point at
 * somebody else's site, so the page they open must not get a handle on this
 * one. The server has already refused anything that is not http or https.
 * Uploaded files are served same-origin by the tenant-scoped download route.
 */
export type TaskAttachment = {
  id: string;
  label: string;
  /** From `attachmentHref`: the link, or the uploaded file's download URL. */
  href: string;
  isFile: boolean;
  addedByName: string | null;
  createdAt: Date | string;
  /** Whether the signed-in viewer may remove this one. */
  canDelete: boolean;
};

export function TaskAttachments({
  taskId,
  attachments,
  canAttach,
}: {
  taskId: string;
  attachments: TaskAttachment[];
  canAttach: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!url.trim()) return;
    if (await attach({ url, label })) {
      setUrl("");
      setLabel("");
    }
  }

  async function attach(
    body: { url: string; label: string } | { fileId: string }
  ) {
    setBusy(true);

    const response = await fetch(`/api/tasks/${taskId}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const result = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok) {
      toast.error(
        result?.fieldErrors?.url ?? result?.error ?? "Could not attach that."
      );
      return false;
    }

    toast.success("Attached");
    router.refresh();
    return true;
  }

  async function attachUploads(files: UploadedFile[]) {
    for (const file of files) await attach({ fileId: file.id });
  }

  async function remove(attachment: TaskAttachment) {
    if (!window.confirm(`Remove ${attachment.label}?`)) return;
    setBusy(true);

    const response = await fetch(
      `/api/tasks/${taskId}/attachments?attachmentId=${attachment.id}`,
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
          {canAttach ? " Upload a file or add a link below." : ""}
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
                  href={attachment.href}
                  {...(attachment.isFile
                    ? {}
                    : { target: "_blank", rel: "noopener noreferrer" })}
                  className="text-brand-brown inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline"
                >
                  {attachment.isFile ? (
                    <FileText
                      aria-hidden
                      className="size-4"
                      strokeWidth={1.5}
                    />
                  ) : (
                    <ExternalLink
                      aria-hidden
                      className="size-4"
                      strokeWidth={1.5}
                    />
                  )}
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
        <FileUpload value={[]} onChange={attachUploads} label="Upload a file" />
      ) : null}

      {canAttach ? (
        <div className="flex flex-wrap items-end gap-3">
          <FormField
            id="attachmentUrl"
            label="Link to a file"
            type="url"
            inputMode="url"
            placeholder="https://drive.example.com/…"
            hint="Paste a link to the document, design or folder."
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            fieldClassName="min-w-64 flex-1"
          />
          <FormField
            id="attachmentLabel"
            label="Name (optional)"
            placeholder="Creative brief"
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

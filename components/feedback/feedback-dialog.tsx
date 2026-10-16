"use client";

import { useState } from "react";
import { Paperclip, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type UploadedFile = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
};

/**
 * Feedback / enhancement floating dialog (Plan: software feedback button).
 *
 * Shown from a round FAB in the dashboard shell; collects a message and
 * optional attached files, then POSTs to `/api/feedback` which emails the
 * company's configured recipients plus the global default.
 *
 * Files are uploaded to `/api/files` first (same path every other feature
 * uses) so the payload carries only ids, not raw bytes.
 */
export function FeedbackDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const MAX_MSG = 5000;

  async function uploadFiles(fileList: File[]) {
    setUploading(true);
    const remaining = [...files];

    for (const file of fileList) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} is larger than 5 MB.`);
        continue;
      }

      const form = new FormData();
      form.append("file", file);

      const response = await fetch("/api/files", {
        method: "POST",
        body: form,
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(body?.error ?? `Could not upload ${file.name}.`);
        continue;
      }

      remaining.push(body.file);
    }

    setFiles(remaining);
    setUploading(false);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) return;

    setBusy(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          fileIds: files.map((f) => f.id),
        }),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(body?.error ?? "Could not send your feedback.");
        return;
      }

      toast.success(
        body.sentTo === body.total
          ? "Feedback sent. Thanks for helping us improve WorkPulse!"
          : `Feedback sent to ${body.sentTo}/${body.total} recipient(s).`
      );
      setMessage("");
      setFiles([]);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send feedback or an enhancement</DialogTitle>
          <DialogDescription>
            Share what you&apos;d like to see improved, or raise any issue you&apos;ve
            noticed. Attachments are welcome — they&apos;ll be emailed along with
            your message.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="feedback-message"
              className="text-sm font-medium leading-none"
            >
              Your message
            </label>
            <textarea
              id="feedback-message"
              className="min-h-[160px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="Describe the feedback or enhancement idea..."
              value={message}
              maxLength={MAX_MSG}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
            <p className="text-meta text-text-secondary">
              {message.length}/{MAX_MSG}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium leading-none">
              Attachments
            </label>
            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/zip"
              className="hidden"
              id="feedback-attach"
              onChange={(e) => {
                const chosen = Array.from(e.target.files ?? []);
                if (chosen.length > 0) uploadFiles(chosen);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() =>
                document.getElementById("feedback-attach")?.click()
              }
            >
              <Paperclip aria-hidden className="size-4" strokeWidth={1.5} />
              {uploading ? "Uploading…" : "Attach files"}
            </Button>
          </div>

          {files.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {files.map((file) => (
                <li
                  key={file.id}
                  className="border-border bg-surface-muted flex items-center justify-between gap-3 rounded-lg border px-3 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {file.name}
                  </span>
                  <span className="text-text-secondary text-meta shrink-0">
                    {formatFileSize(file.sizeBytes)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    className="text-brand-brown-soft hover:text-brand-brown shrink-0"
                    onClick={() =>
                      setFiles((current) =>
                        current.filter((f) => f.id !== file.id)
                      )
                    }
                  >
                    <X aria-hidden className="size-4" strokeWidth={1.5} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !message.trim()}>
              {busy ? (
                <>
                  <Send aria-hidden className="size-4" strokeWidth={1.5} />
                  Sending…
                </>
              ) : (
                <>
                  <Send aria-hidden className="size-4" strokeWidth={1.5} />
                  Send feedback
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

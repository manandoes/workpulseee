"use client";

import { useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_BYTES,
  formatFileSize,
} from "@/lib/files";

export type UploadedFile = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
};

/**
 * Attach one or more files to whatever is being composed (Plan: file storage
 * foundation) — shared by the bulk-email composer, the invite template editor
 * and the salary-slip uploader.
 *
 * Files are uploaded to `/api/files` as soon as they are chosen rather than
 * with the surrounding form: the parent then only ever deals in ids, which is
 * what every consuming table stores. The size check here duplicates the
 * server's on purpose — it is a faster, clearer failure, never the boundary.
 */
export function FileUpload({
  value,
  onChange,
  multiple = true,
  accept,
  label = "Attach files",
  className,
}: {
  value: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  multiple?: boolean;
  accept?: string;
  label?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(files: File[]) {
    setBusy(true);
    const uploaded: UploadedFile[] = [];

    try {
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
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

        uploaded.push(body.file);
      }

      if (uploaded.length > 0) {
        onChange(multiple ? [...value, ...uploaded] : uploaded.slice(0, 1));
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept ?? ALLOWED_MIME_TYPES.join(",")}
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) upload(files);
        }}
      />

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip aria-hidden className="size-4" strokeWidth={1.5} />
          {busy ? "Uploading…" : label}
        </Button>
      </div>

      {value.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {value.map((file) => (
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
                  onChange(value.filter((other) => other.id !== file.id))
                }
              >
                <X aria-hidden className="size-4" strokeWidth={1.5} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

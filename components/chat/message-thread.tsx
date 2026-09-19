"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Paperclip, Send, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_BYTES,
  formatFileSize,
  isImageMimeType,
} from "@/lib/files";

type Attachment = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
};
type Message = {
  id: string;
  body: string;
  createdAt: string;
  fromMe: boolean;
  attachment: Attachment | null;
};
type OtherParticipant = { name: string } | null;

const POLL_MS = 4_000;

/**
 * A conversation's thread + composer. Polls while mounted — faster than the
 * notification bell's 30s (this is the page's primary content, not a corner
 * widget) but still plain polling, the app's only "live" precedent.
 */
export function MessageThread({ conversationId }: { conversationId: string }) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [other, setOther] = useState<OtherParticipant>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const response = await fetch(`/api/chat/conversations/${conversationId}/messages`);
    if (!response.ok) return;
    const body = await response.json();
    setMessages(body.messages);
    setOther(body.other);
  }

  useEffect(() => {
    // `refresh` sets state, so — like `notification-bell.tsx`'s poll — the
    // initial call is deferred to a timer rather than run synchronously in
    // the effect body (react-hooks/set-state-in-effect).
    const initial = setTimeout(refresh, 0);
    const interval = setInterval(refresh, POLL_MS);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  /**
   * Uploads immediately on pick rather than on send, so the composer only ever
   * holds an id — the same contract `components/ui/file-upload.tsx` uses.
   */
  async function attach(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      toast.error("That file is larger than 5 MB.");
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);

      const response = await fetch("/api/files", { method: "POST", body: form });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(body?.error ?? "Could not upload that file.");
        return;
      }

      setPendingFile(body.file);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function send() {
    const body = draft.trim();
    // Text or a file is enough — a bare file share is a valid message, which
    // is what `sendMessageSchema` allows for on the server.
    if ((!body && !pendingFile) || sending) return;

    setSending(true);
    try {
      const response = await fetch(
        `/api/chat/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body,
            ...(pendingFile ? { attachmentFileId: pendingFile.id } : {}),
          }),
        }
      );
      if (response.ok) {
        setDraft("");
        setPendingFile(null);
        await refresh();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-border bg-surface flex h-128 flex-col overflow-hidden rounded-xl border">
      <div className="border-border border-b px-4 py-2.5">
        <span className="text-brand-brown font-medium">
          {other?.name ?? "Conversation"}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">
        {messages === null ? (
          <p className="text-text-secondary">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-text-secondary">
            No messages yet — say hello. Messages here are removed automatically
            after 3 days.
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn("flex flex-col", message.fromMe ? "items-end" : "items-start")}
            >
              <span
                className={cn(
                  "flex max-w-[80%] flex-col gap-2 rounded-xl px-3 py-2 wrap-break-word",
                  message.fromMe
                    ? "bg-brand-yellow-light text-brand-brown"
                    : "bg-surface-muted text-foreground"
                )}
              >
                {message.body ? <span>{message.body}</span> : null}
                {message.attachment ? (
                  <MessageAttachment attachment={message.attachment} />
                ) : null}
              </span>
              <span className="text-text-secondary text-meta mt-0.5">
                {formatDateTime(message.createdAt)}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        className="border-border flex flex-col gap-2 border-t px-4 py-3"
      >
        {pendingFile ? (
          <div className="border-border bg-surface-muted flex items-center gap-2 rounded-lg border px-3 py-1.5">
            <Paperclip
              aria-hidden
              className="text-brand-brown-soft size-4 shrink-0"
              strokeWidth={1.5}
            />
            <span className="min-w-0 flex-1 truncate text-sm">
              {pendingFile.name}
            </span>
            <span className="text-text-secondary text-meta shrink-0">
              {formatFileSize(pendingFile.sizeBytes)}
            </span>
            <button
              type="button"
              aria-label="Remove attachment"
              className="text-brand-brown-soft hover:text-brand-brown shrink-0"
              onClick={() => setPendingFile(null)}
            >
              <X aria-hidden className="size-4" strokeWidth={1.5} />
            </button>
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_MIME_TYPES.join(",")}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) attach(file);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Attach a file"
            disabled={uploading || Boolean(pendingFile)}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip aria-hidden className="size-4" strokeWidth={1.5} />
          </Button>
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder={uploading ? "Uploading…" : "Write a message…"}
            rows={1}
            className="min-h-0 flex-1 resize-none"
          />
          <Button
            type="submit"
            disabled={sending || (!draft.trim() && !pendingFile)}
          >
            <Send aria-hidden className="size-4" />
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}

/**
 * Images render inline so a screenshot is readable without a round trip;
 * anything else is a download chip. `/api/files/[id]` is tenant-scoped, so the
 * bare id in this URL is safe to put in the DOM.
 */
function MessageAttachment({ attachment }: { attachment: Attachment }) {
  const href = `/api/files/${attachment.id}`;

  if (isImageMimeType(attachment.mimeType)) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={href}
          alt={attachment.name}
          className="max-h-64 w-auto rounded-lg object-contain"
        />
      </a>
    );
  }

  return (
    <a
      href={href}
      className="border-border bg-surface hover:bg-surface-muted flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors"
    >
      <Download
        aria-hidden
        className="text-brand-brown-soft size-4 shrink-0"
        strokeWidth={1.5}
      />
      <span className="text-foreground min-w-0 flex-1 truncate text-sm">
        {attachment.name}
      </span>
      <span className="text-text-secondary text-meta shrink-0">
        {formatFileSize(attachment.sizeBytes)}
      </span>
    </a>
  );
}

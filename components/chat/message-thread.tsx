"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Paperclip, Send, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { DateTime } from "@/components/ui/date-time";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CHAT_MESSAGE_RETENTION_DAYS } from "@/lib/chat";
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

/** Small indicator showing the provider for a conversation. */
function ProviderIndicator({ provider }: { provider: "Native" | "Google" }) {
  if (provider === "Native") return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300"
      title="Messages stored in Google Chat"
    >
      <svg viewBox="0 0 24 24" className="size-3" fill="currentColor" aria-hidden>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
      </svg>
      Google
    </span>
  );
}

/**
 * A conversation's thread + composer. Polls while mounted — faster than the
 * notification bell's 30s (this is the page's primary content, not a corner
 * widget) but still plain polling, the app's only "live" precedent.
 */
export function MessageThread({ conversationId }: { conversationId: string }) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [other, setOther] = useState<OtherParticipant>(null);
  const [provider, setProvider] = useState<"Native" | "Google">("Native");
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
    if (body.provider) setProvider(body.provider);
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

  // Every poll hands back a fresh array, so keying the scroll on `messages`
  // itself would yank anyone reading older history back to the bottom every
  // few seconds. Only a new newest message (or the first load) should scroll.
  const newestMessageId = messages?.at(-1)?.id;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [newestMessageId]);

  /**
   * Uploads immediately on pick rather than on send, so the composer only ever
   * holds an id — the same contract `components/ui/file-upload.tsx` uses.
   */
  async function attach(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      toast.error("That file is larger than 5 MB.");
      return;
    }
    if (provider === "Google") {
      toast.info("File attachments are not supported in Google Chat yet.");
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
    if (provider === "Google" && pendingFile) {
      toast.info("File attachments are not supported in Google Chat yet.");
      return;
    }

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
        // Refresh to pick up the new message.
        await refresh();
      } else {
        const err = await response.json().catch(() => ({})) as { message?: string };
        toast.error(err.message ?? "Failed to send message.");
      }
    } catch {
      toast.error("Network error. Could not send message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with provider indicator */}
      <div className="flex items-center justify-between border-border border-b px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">Chat</p>
          <p className="text-xs text-text-secondary">
            {provider === "Google"
              ? "Messages are stored in Google Chat"
              : `Messages are stored locally for ${CHAT_MESSAGE_RETENTION_DAYS} days`}
          </p>
        </div>
        <ProviderIndicator provider={provider} />
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages === null ? (
          <p className="text-text-secondary text-sm">Loading...</p>
        ) : messages.length === 0 ? (
          <p className="text-text-secondary text-sm">No messages yet. Say hello!</p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex flex-col",
                msg.fromMe ? "items-end" : "items-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                  msg.fromMe
                    ? "bg-brand-yellow text-brand-brown"
                    : "bg-surface-muted text-foreground"
                )}
              >
                {msg.body && <p className="whitespace-pre-wrap">{msg.body}</p>}
                {msg.attachment && <MessageAttachment attachment={msg.attachment} />}
              </div>
              <span className="text-text-secondary text-[10px] mt-1">
                <DateTime value={msg.createdAt} />
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="border-border border-t p-3"
      >
        {pendingFile ? (
          <div className="flex items-center gap-2 mb-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">
              {pendingFile.name} ({formatFileSize(pendingFile.sizeBytes)})
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
          {provider === "Native" ? (
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
          ) : null}
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder={
              uploading
                ? "Uploading..."
                : provider === "Google"
                ? "Write a message (no attachments in Google Chat)..."
                : "Write a message..."
            }
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
      <a href={href} target="_blank" rel="noreferrer" className="block mt-1">
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
      className="border-border bg-surface hover:bg-surface-muted flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors mt-1"
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

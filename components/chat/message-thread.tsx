"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { cn } from "cn";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Message = { id: string; body: string; createdAt: string; fromMe: boolean };
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
  const bottomRef = useRef<HTMLDivElement>(null);

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

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    try {
      const response = await fetch(
        `/api/chat/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        }
      );
      if (response.ok) {
        setDraft("");
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
                  "max-w-[80%] rounded-xl px-3 py-2 wrap-break-word",
                  message.fromMe
                    ? "bg-brand-yellow-light text-foreground"
                    : "bg-surface-muted text-foreground"
                )}
              >
                {message.body}
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
        className="border-border flex items-end gap-2 border-t px-4 py-3"
      >
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder="Write a message…"
          rows={1}
          className="min-h-0 flex-1 resize-none"
        />
        <Button type="submit" disabled={sending || !draft.trim()}>
          <Send aria-hidden className="size-4" />
          Send
        </Button>
      </form>
    </div>
  );
}

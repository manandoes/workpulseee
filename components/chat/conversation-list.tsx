"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { Avatar } from "@/components/dashboard/avatar";
import { EmptyState } from "@/components/dashboard/page-header";

type Conversation = {
  id: string;
  other: { kind: "employee" | "account"; id: string; name: string; avatarUrl: string | null };
  lastMessage: { body: string; createdAt: string } | null;
  unread: boolean;
};

const POLL_MS = 15_000;

/**
 * The chat list panel (`/chat` and `/chat/[conversationId]` share it, the
 * same two-pane shape `/requests` and `/requests/[id]` would if requests had
 * a persistent list). Polls on an interval, the app's one precedent for
 * "live" UI (`components/dashboard/notification-bell.tsx`) — no realtime
 * library exists in this codebase.
 */
export function ConversationList() {
  const pathname = usePathname();
  const [conversations, setConversations] = useState<Conversation[] | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const response = await fetch("/api/chat/conversations");
      if (!response.ok || cancelled) return;
      const body = await response.json();
      if (!cancelled) setConversations(body.conversations);
    }

    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (conversations === null) {
    return <p className="text-text-secondary px-1 py-4">Loading…</p>;
  }

  if (conversations.length === 0) {
    return (
      <EmptyState
        title="No conversations yet"
        description="Message someone from the Squad page to start a conversation."
      />
    );
  }

  return (
    <ul className="border-border divide-border bg-surface flex flex-col divide-y overflow-hidden rounded-xl border">
      {conversations.map((conversation) => (
        <li key={conversation.id}>
          <Link
            href={`/chat/${conversation.id}`}
            className={cn(
              "hover:bg-surface-muted flex items-center gap-3 px-4 py-3 transition-colors",
              pathname === `/chat/${conversation.id}` && "bg-brand-yellow-light/40"
            )}
          >
            <Avatar name={conversation.other.name} avatarUrl={conversation.other.avatarUrl} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-foreground truncate font-medium">
                  {conversation.other.name}
                </span>
                {conversation.unread ? (
                  <span className="bg-danger size-2 shrink-0 rounded-full" aria-hidden />
                ) : null}
              </span>
              <span className="text-text-secondary text-meta block truncate">
                {conversation.lastMessage?.body ?? "No messages yet"}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

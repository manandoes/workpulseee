"use client";

import { useEffect, useState } from "react";

const POLL_MS = 30_000;

/**
 * Small unread-count dot for the "Chat" sidebar item, same polling pattern as
 * `NotificationBell` — no realtime library in this codebase.
 */
export function ChatNavBadge() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const response = await fetch("/api/chat/unread-count");
      if (!response.ok || cancelled) return;
      const body = await response.json();
      if (!cancelled) setUnreadCount(body.unreadCount);
    }

    const initial = setTimeout(refresh, 0);
    const interval = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, []);

  if (unreadCount === 0) return null;

  return (
    <span
      aria-label={`${unreadCount} unread conversations`}
      className="bg-danger text-background text-meta ml-auto flex size-4 items-center justify-center rounded-full font-medium"
    >
      {unreadCount > 9 ? "9+" : unreadCount}
    </span>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "cn";
import { formatDateTime } from "@/lib/format";
import { LogoutReminderActions } from "@/components/attendance/logout-reminder-actions";

/**
 * The notification bell (Architecture.md section 7 — "user sees notification
 * bell / receives email").
 *
 * A plain `useState` dropdown rather than a menu primitive — the codebase
 * already prefers the simplest control that works over a Radix component
 * where nothing calls for one (see the native-`<select>` decision in
 * Memory.md's Key Decisions Log). Polls on an interval so a notification from
 * another tab or a background job appears without a manual refresh.
 */
type Notification = {
  id: string;
  type: string;
  message: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

const POLL_MS = 30_000;

export function NotificationBell({ className }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    const response = await fetch("/api/notifications");
    if (!response.ok) return;
    const body = await response.json();
    setNotifications(body.notifications);
    setUnreadCount(body.unreadCount);
  }

  useEffect(() => {
    // Fetching on mount is a genuine synchronization with the server, not
    // state derived from props — but `refresh` sets state, so the initial
    // call is deferred to a timer, same as the poll, rather than run
    // synchronously in the effect body (react-hooks/set-state-in-effect).
    const initial = setTimeout(refresh, 0);
    const interval = setInterval(refresh, POLL_MS);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function openNotification(notification: Notification) {
    setOpen(false);
    if (!notification.readAt) {
      await fetch(`/api/notifications/${notification.id}/read`, {
        method: "PATCH",
      });
      refresh();
    }
    if (notification.link) router.push(notification.link);
  }

  async function markAllRead() {
    await fetch("/api/notifications", { method: "PATCH" });
    refresh();
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={
          unreadCount > 0
            ? `${unreadCount} unread notifications`
            : "Notifications"
        }
        onClick={() => setOpen((value) => !value)}
        className="text-brand-brown-soft hover:bg-brand-yellow-light hover:text-brand-brown relative flex size-9 items-center justify-center rounded-lg transition-colors"
      >
        <Bell aria-hidden className="size-5" strokeWidth={1.5} />
        {unreadCount > 0 ? (
          <span className="bg-danger text-background text-meta absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full font-medium">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="border-border bg-surface absolute top-11 right-0 z-50 flex max-h-96 w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border shadow-lg"
        >
          <div className="border-border flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-brand-brown font-medium">Notifications</span>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="text-text-secondary hover:text-brand-brown text-meta underline-offset-4 hover:underline"
              >
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-text-secondary px-4 py-6 text-center">
                Nothing yet.
              </p>
            ) : (
              <ul className="divide-border divide-y">
                {notifications.map((notification) => (
                  <li
                    key={notification.id}
                    className={cn(
                      !notification.readAt && "bg-brand-yellow-light/40"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => openNotification(notification)}
                      className="hover:bg-surface-muted flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors"
                    >
                      <span className="text-foreground">
                        {notification.message}
                      </span>
                      <span className="text-text-secondary text-meta">
                        {formatDateTime(notification.createdAt)}
                      </span>
                    </button>
                    {/* An unanswered logout reminder is the one notification
                        you act on from inside the bell rather than by
                        navigating — see `LogoutReminderActions`. */}
                    {notification.type === "LogoutReminder" &&
                    !notification.readAt ? (
                      <LogoutReminderActions
                        notificationId={notification.id}
                        onAnswered={refresh}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="border-border text-brand-brown hover:bg-surface-muted border-t px-4 py-2.5 text-center underline-offset-4 hover:underline"
          >
            See all
          </Link>
        </div>
      ) : null}
    </div>
  );
}

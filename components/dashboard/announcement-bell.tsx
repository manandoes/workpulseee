"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { cn } from "cn";
import { formatDateTime } from "@/lib/format";

/**
 * The announcement bell (Plan: top bar rework) — sits beside
 * `NotificationBell` in the top bar. Structured the same way: its own
 * `useState` dropdown, polled on an interval, closed on an outside click.
 */
type Announcement = {
  id: string;
  title: string;
  authorName: string;
  createdAt: string;
};

const POLL_MS = 30_000;

export function AnnouncementBell({
  className,
  canCreate,
}: {
  className?: string;
  /** Whether the signed-in actor may post a new announcement. */
  canCreate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    const response = await fetch("/api/announcements?limit=5");
    if (!response.ok) return;
    const body = await response.json();
    setAnnouncements(body.announcements);
  }

  useEffect(() => {
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

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-label="Announcements"
        onClick={() => setOpen((value) => !value)}
        className="text-brand-brown-soft hover:bg-brand-yellow-light hover:text-foreground relative flex size-9 items-center justify-center rounded-lg transition-colors"
      >
        <Megaphone aria-hidden className="size-5" strokeWidth={1.5} />
      </button>

      {open ? (
        <div className="border-border bg-surface absolute top-11 right-0 z-50 flex max-h-96 w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border shadow-lg">
          <div className="border-border flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-brand-brown font-medium">Announcements</span>
            {canCreate ? (
              <Link
                href="/announcements/new"
                onClick={() => setOpen(false)}
                className="text-text-secondary hover:text-brand-brown text-meta underline-offset-4 hover:underline"
              >
                New
              </Link>
            ) : null}
          </div>

          <div className="flex-1 overflow-y-auto">
            {announcements.length === 0 ? (
              <p className="text-text-secondary px-4 py-6 text-center">
                Nothing yet.
              </p>
            ) : (
              <ul className="divide-border divide-y">
                {announcements.map((announcement) => (
                  <li key={announcement.id}>
                    <Link
                      href={`/announcements?announcementId=${announcement.id}`}
                      onClick={() => setOpen(false)}
                      className="hover:bg-surface-muted flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors"
                    >
                      <span className="text-foreground font-medium">
                        {announcement.title}
                      </span>
                      <span className="text-text-secondary text-meta">
                        {announcement.authorName} ·{" "}
                        {formatDateTime(announcement.createdAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            href="/announcements"
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

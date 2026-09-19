"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PenSquare, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Avatar } from "@/components/dashboard/avatar";

type Person = {
  kind: "employee" | "account";
  id: string;
  name: string;
  role: string;
  avatarUrl: string | null;
};

/**
 * Start a conversation with anyone in the company (Plan: start a new chat).
 *
 * Until now the only way into a conversation was the "Message" button on a
 * Squad card, so someone with no chat history had no route in at all. The
 * conversation itself is still found-or-created by the existing
 * `POST /api/chat/conversations`, exactly as `MessageButton` does — this only
 * supplies the person.
 *
 * Rendered both in the top bar and in the chat list's empty state, hence
 * `trigger`: same behaviour, two different affordances.
 */
export function NewChatDialog({ trigger = "icon" }: { trigger?: "icon" | "button" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetched on first open rather than on mount: most page views never open
  // this, and the directory is a two-table read.
  useEffect(() => {
    if (!open || people !== null) return;

    let cancelled = false;
    fetch("/api/chat/directory")
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!cancelled && body) setPeople(body.people);
      });

    return () => {
      cancelled = true;
    };
  }, [open, people]);

  // Same click-outside/Escape pairing the notification and announcement
  // dropdowns use.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function startChat(person: Person) {
    setPendingId(person.id);
    try {
      const response = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          person.kind === "employee"
            ? { employeeId: person.id }
            : { accountId: person.id }
        ),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(body?.error ?? "Could not start a conversation.");
        return;
      }

      setOpen(false);
      setQuery("");
      router.push(`/chat/${body.conversationId}`);
    } finally {
      setPendingId(null);
    }
  }

  const term = query.trim().toLowerCase();
  const visible = (people ?? []).filter(
    (person) =>
      term === "" ||
      person.name.toLowerCase().includes(term) ||
      person.role.toLowerCase().includes(term)
  );

  return (
    <div ref={containerRef} className="relative">
      {trigger === "icon" ? (
        <button
          type="button"
          aria-label="Start a new chat"
          aria-expanded={open}
          onClick={() => setOpen((previous) => !previous)}
          className="text-brand-brown-soft hover:bg-brand-yellow-light hover:text-brand-brown flex size-9 items-center justify-center rounded-lg transition-colors"
        >
          <PenSquare aria-hidden className="size-5" strokeWidth={1.5} />
        </button>
      ) : (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((previous) => !previous)}
          className="bg-brand-yellow text-primary-foreground hover:bg-brand-yellow-hover inline-flex items-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors"
        >
          <PenSquare aria-hidden className="size-4" strokeWidth={1.5} />
          Start a conversation
        </button>
      )}

      {open ? (
        <div
          className={cn(
            "border-border bg-surface absolute z-50 mt-2 flex max-h-96 w-80 flex-col overflow-hidden rounded-xl border shadow-lg",
            trigger === "icon" ? "right-0" : "left-0"
          )}
        >
          <div className="border-border flex items-center gap-2 border-b px-3 py-2">
            <Search
              aria-hidden
              className="text-brand-brown-soft size-4 shrink-0"
              strokeWidth={1.5}
            />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search people…"
              aria-label="Search people"
              className="text-foreground placeholder:text-text-secondary w-full bg-transparent py-1 text-sm outline-none"
            />
          </div>

          <div className="overflow-y-auto">
            {people === null ? (
              <p className="text-text-secondary px-3 py-4 text-sm">Loading…</p>
            ) : visible.length === 0 ? (
              <p className="text-text-secondary px-3 py-4 text-sm">
                {people.length === 0
                  ? "There is no one else in this company yet."
                  : "No one matches that search."}
              </p>
            ) : (
              <ul className="flex flex-col">
                {visible.map((person) => (
                  <li key={`${person.kind}-${person.id}`}>
                    <button
                      type="button"
                      disabled={pendingId !== null}
                      onClick={() => startChat(person)}
                      className="hover:bg-surface-muted flex w-full items-center gap-3 px-3 py-2 text-left transition-colors disabled:opacity-50"
                    >
                      <Avatar name={person.name} avatarUrl={person.avatarUrl} />
                      <span className="min-w-0 flex-1">
                        <span className="text-foreground block truncate text-sm font-medium">
                          {person.name}
                        </span>
                        <span className="text-text-secondary text-meta block truncate">
                          {person.role}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "cn";
import type { PollOptionResult } from "@/lib/announcements";

/**
 * A poll's options as clickable bars, filling to their share of the vote.
 * Voting is a click, not a form submit — the same "act, don't ask" pattern
 * `TaskStatusSelect` uses for moving a task.
 */
export function PollVoting({
  announcementId,
  options,
  totalVotes,
  ownOptionId,
}: {
  announcementId: string;
  options: PollOptionResult[];
  totalVotes: number;
  ownOptionId: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function vote(pollOptionId: string) {
    setPending(pollOptionId);

    const response = await fetch(
      `/api/announcements/${announcementId}/vote`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pollOptionId }),
      }
    );

    setPending(null);
    if (response.ok) router.refresh();
  }

  return (
    <div role="radiogroup" aria-label="Poll options" className="flex flex-col gap-2">
      {options.map((option) => {
        const selected = option.id === ownOptionId;

        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={pending !== null}
            onClick={() => vote(option.id)}
            className={cn(
              "border-border relative overflow-hidden rounded-lg border px-3 py-2 text-left transition-colors",
              selected
                ? "border-brand-yellow"
                : "hover:bg-surface-muted",
              pending === option.id && "opacity-60"
            )}
          >
            <div
              className="bg-brand-yellow-light absolute inset-y-0 left-0 -z-10"
              style={{ width: `${option.percentage}%` }}
              aria-hidden
            />
            <div className="flex items-center justify-between gap-3">
              <span
                className={cn(
                  "text-foreground",
                  selected && "font-medium"
                )}
              >
                {option.label}
              </span>
              <span className="text-text-secondary text-meta whitespace-nowrap">
                {option.percentage}% · {option.count}
              </span>
            </div>
          </button>
        );
      })}
      <p className="text-text-secondary text-meta">
        {totalVotes === 1 ? "1 vote" : `${totalVotes} votes`}
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "cn";
import type { ThemeMode } from "@/lib/permissions";

const OPTIONS: { theme: ThemeMode; label: string }[] = [
  { theme: "light", label: "Light" },
  { theme: "dark", label: "Dark" },
];

/**
 * Dark/light theme toggle (Plan: theme toggle) — a personal, per-browser
 * preference, available to every actor. Same fetch-then-`router.refresh()`
 * shape as `ModeToggle`, but writes `themeMode` instead of `dashboardMode`
 * and carries no permission gate.
 */
export function ThemeToggle({ theme }: { theme: ThemeMode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function switchTo(next: ThemeMode) {
    if (next === theme || busy) return;
    setBusy(true);

    const response = await fetch("/api/settings/theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: next }),
    });

    setBusy(false);

    if (!response.ok) {
      toast.error("Could not switch theme.");
      return;
    }

    router.refresh();
  }

  return (
    <div
      role="group"
      aria-label="Theme"
      className="border-brand-brown-light bg-surface flex w-fit rounded-lg border p-0.5"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.theme}
          type="button"
          aria-pressed={option.theme === theme}
          disabled={busy}
          onClick={() => switchTo(option.theme)}
          className={cn(
            "flex-1 rounded-[calc(var(--radius-lg)-2px)] px-3 py-1 text-meta font-medium transition-colors disabled:opacity-50",
            option.theme === theme
              ? "bg-brand-yellow text-foreground"
              : "text-brand-brown-soft hover:bg-brand-yellow-light hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

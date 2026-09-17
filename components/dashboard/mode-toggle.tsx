"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "cn";
import type { DashboardMode } from "@/lib/permissions";

const OPTIONS: { mode: DashboardMode; label: string }[] = [
  { mode: "hrms", label: "HRMS" },
  { mode: "pms", label: "PMS" },
];

/**
 * The sidebar mode toggle (Plan: HRMS/PMS toggle) — sits between the company
 * name and the profile row in `app/(dashboard)/layout.tsx`. Switches which
 * slice of the sidebar (`navigationFor` in `lib/permissions.ts`) and which
 * dashboard tiles (`app/(dashboard)/dashboard/page.tsx`) are shown.
 *
 * Only rendered for company accounts (Owner/Admin/Manager/HR) — an Employee's
 * nav ignores mode entirely, so the layout never mounts this for them.
 */
export function ModeToggle({ mode }: { mode: DashboardMode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function switchTo(next: DashboardMode) {
    if (next === mode || busy) return;
    setBusy(true);

    const response = await fetch("/api/settings/dashboard-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: next }),
    });

    setBusy(false);

    if (!response.ok) {
      toast.error("Could not switch dashboard mode.");
      return;
    }

    router.refresh();
  }

  return (
    <div
      role="group"
      aria-label="Dashboard mode"
      className="border-brand-brown-light bg-surface flex rounded-lg border p-0.5"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.mode}
          type="button"
          aria-pressed={option.mode === mode}
          disabled={busy}
          onClick={() => switchTo(option.mode)}
          className={cn(
            "flex-1 rounded-[calc(var(--radius-lg)-2px)] px-2.5 py-1 text-meta font-medium transition-colors disabled:opacity-50",
            option.mode === mode
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

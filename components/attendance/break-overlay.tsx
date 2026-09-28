"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Coffee } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCountdown } from "@/lib/format";
import { cn } from "cn";

/**
 * The non-dismissible overlay shown while an employee is on a break (Plan.md
 * Phase 15) — no escape key, no outside click, one "End break" button.
 *
 * Mounted in `app/(dashboard)/layout.tsx`, so it follows the employee across
 * every page rather than only My Work: a break pauses the whole working day,
 * not one screen. Radix's `Dialog` gives the focus trap and ARIA wiring that
 * hand-rolling an overlay would not — `onEscapeKeyDown`/`onPointerDownOutside`
 * are both suppressed, and `showCloseButton={false}` drops the primitive's own
 * dismiss affordance, so "End break" is the only way out.
 *
 * The clock counts *down* what is left of the company's daily allowance
 * (`Company.dailyBreakMinutes`, less earlier breaks today — see
 * `loadBreakAllowance`) and keeps going past zero, negative and red, rather
 * than stopping: overrunning is shown, not prevented.
 */
export function BreakOverlay({
  openBreak,
}: {
  openBreak: {
    startedAt: string;
    allowanceMs: number;
    usedBeforeMs: number;
  } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    if (!openBreak) return;

    const interval = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [openBreak]);

  if (!openBreak) return null;

  const elapsedMs = Math.max(
    0,
    clock - new Date(openBreak.startedAt).getTime()
  );
  const remainingMs =
    openBreak.allowanceMs - openBreak.usedBeforeMs - elapsedMs;
  const overrun = remainingMs < 0;

  async function endBreak() {
    setBusy(true);

    const response = await fetch("/api/attendance/break/end", {
      method: "POST",
    });

    const body = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok) {
      toast.error(body?.error ?? "Could not end your break.");
      return;
    }

    toast.success("Back to work.");
    router.refresh();
  }

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="text-center"
      >
        <DialogHeader className="items-center">
          <Coffee className="text-brand-brown mb-2 size-8" aria-hidden />
          <DialogTitle>On a break</DialogTitle>
          <DialogDescription>
            Your task timers are paused. End your break to pick up where you
            left off.
          </DialogDescription>
        </DialogHeader>

        <div className="my-4 flex flex-col items-center gap-1">
          <p className="text-text-secondary text-meta">
            {overrun ? "Over your break allowance" : "Break time left"}
          </p>
          <p
            className={cn(
              "font-mono text-2xl font-semibold tabular-nums",
              overrun ? "text-danger-text" : "text-brand-brown"
            )}
            aria-live="off"
          >
            {formatCountdown(remainingMs)}
          </p>
        </div>

        <Button
          type="button"
          className="w-full"
          disabled={busy}
          onClick={endBreak}
        >
          {busy ? "Ending…" : "End break"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

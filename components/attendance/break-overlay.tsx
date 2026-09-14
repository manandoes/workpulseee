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
import { formatElapsed } from "@/lib/format";

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
 */
export function BreakOverlay({
  openBreak,
}: {
  openBreak: { startedAt: string } | null;
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

        <p
          className="text-brand-brown my-4 font-mono text-2xl font-semibold tabular-nums"
          aria-live="off"
        >
          {formatElapsed(elapsedMs)}
        </p>

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

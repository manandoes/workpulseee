"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Coffee, Play, Square } from "lucide-react";
import { cn } from "cn";
import { formatElapsed } from "@/lib/format";
import type { TimerAction } from "@/lib/task-timer";
import { Button } from "@/components/ui/button";

/**
 * The start / break / stop / done control for one task, with a live timer
 * (Phase 12 — task time tracking).
 *
 * Follows `components/attendance/attendance-widget.tsx` exactly — local `busy`
 * state, `fetch` the route, `toast` the result, `router.refresh()` to pull the
 * server-rendered page back in sync — because this is the same thing one level
 * down: a session is to a working day what a time entry is to a task.
 *
 * Several of these can be running at once, one per card. Each is independent:
 * starting this task's timer does not touch any other, which is the whole
 * reason `stop` exists as its own action — putting one task down is a separate
 * decision from picking the next one up.
 */
export function TaskTimer({
  taskId,
  /** Time already banked in stopped stretches. Fixed for this render. */
  closedMs,
  /** When the running stretch began, ISO, or `null` if nothing is running. */
  runningSince,
  className,
}: {
  taskId: string;
  closedMs: number;
  runningSince: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<TimerAction | null>(null);
  // The clock is the only thing the tick advances; the elapsed figure is
  // derived from it during render, so a fresh `closedMs`/`runningSince` from
  // the server is reflected immediately rather than a tick later.
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    if (!runningSince) return;

    const interval = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [runningSince]);

  const running = runningSince !== null;
  // Measured from the real start time rather than by adding a second per tick,
  // so a backgrounded (and therefore throttled) tab cannot drift away from
  // what the database will say.
  const elapsedMs =
    closedMs +
    (runningSince ? Math.max(0, clock - new Date(runningSince).getTime()) : 0);

  async function run(action: TimerAction) {
    setBusy(action);

    const response = await fetch(`/api/tasks/${taskId}/timer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

    const body = await response.json().catch(() => null);
    setBusy(null);

    if (!response.ok) {
      toast.error(body?.error ?? "Could not update this task's timer.");
      return;
    }

    toast.success(ACTION_DONE[action]);
    // The server owns the running state and the totals, so re-read them rather
    // than keeping a second copy here that could drift.
    router.refresh();
  }

  return (
    <div
      className={cn(
        "border-border flex flex-wrap items-center gap-3 rounded-lg border p-3",
        className
      )}
    >
      <div className="flex flex-col gap-0.5">
        <p className="text-text-secondary text-meta">
          {running ? "Running" : "Time tracked"}
        </p>
        <p
          className={cn(
            "font-mono font-semibold tabular-nums",
            running ? "text-brand-brown" : "text-text-secondary"
          )}
          // Announced only while it is moving, and politely: a timer that
          // interrupts a screen reader every second is unusable.
          aria-live="off"
        >
          {formatElapsed(elapsedMs)}
        </p>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {running ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() => run("break")}
            >
              <Coffee aria-hidden />
              Pause
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() => run("stop")}
            >
              <Square aria-hidden />
              Stop
            </Button>
          </>
        ) : (
          <Button
            type="button"
            disabled={busy !== null}
            onClick={() => run("start")}
          >
            <Play aria-hidden />
            {elapsedMs > 0 ? "Resume" : "Start"}
          </Button>
        )}

        <Button
          type="button"
          variant="secondary"
          disabled={busy !== null}
          onClick={() => run("done")}
        >
          <CheckCircle2 aria-hidden />
          Done
        </Button>
      </div>
    </div>
  );
}

/** What the toast says once the server has accepted the action. */
const ACTION_DONE: Record<TimerAction, string> = {
  start: "Timer started.",
  // "Break" now names only the workday-level break (Plan.md Phase 15) —
  // this action pauses just this task's clock, so the toast says "Paused"
  // even though the `TimeEntryEndReason.Break` enum value is unchanged.
  break: "Paused — your time so far is saved.",
  stop: "Timer stopped — your time so far is saved.",
  done: "Task finished, and the timer stopped.",
};

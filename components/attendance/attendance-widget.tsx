"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Coffee, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatElapsed } from "@/lib/format";
import { MIN_ATTENDANCE_WIDTH_PX } from "@/lib/device";

/**
 * The Login/Logout attendance control on My Work, plus a live elapsed timer
 * while a session is open.
 *
 * Follows `components/employees/employee-status-actions.tsx`'s exact
 * pattern for a client action button: local `busy` state, `fetch` the route,
 * `toast` the result, `router.refresh()` to pull the server-rendered page
 * (the recent-sessions list, the profile page's panel) back in sync.
 *
 * Plan.md Phase 14: clocking in is a laptop-and-up action. `screenAllowed`
 * starts `"unknown"` so the first client render matches the server's
 * (neither knows the viewport), then an effect resolves it from
 * `matchMedia` — the same threshold `/api/attendance/clock-in` enforces
 * server-side via `lib/device.ts`.
 *
 * Plan.md Phase 15: "Take a break" sits here, enabled only while clocked in
 * and not already on one — once a break starts, `router.refresh()` picks up
 * the new open break server-side and `app/(dashboard)/layout.tsx`'s
 * `BreakOverlay` takes over the whole screen, so this widget never needs to
 * render its own "on break" state.
 */
export function AttendanceWidget({
  openSession,
  onBreak,
}: {
  openSession: { id: string; clockInAt: string } | null;
  onBreak: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [breakBusy, setBreakBusy] = useState(false);
  const [screenAllowed, setScreenAllowed] = useState<
    "unknown" | "allowed" | "blocked"
  >("unknown");
  const [elapsedMs, setElapsedMs] = useState(() =>
    openSession ? Date.now() - new Date(openSession.clockInAt).getTime() : 0
  );

  useEffect(() => {
    const query = window.matchMedia(
      `(min-width: ${MIN_ATTENDANCE_WIDTH_PX}px)`
    );
    const resolve = () =>
      setScreenAllowed(query.matches ? "allowed" : "blocked");

    resolve();
    query.addEventListener("change", resolve);
    return () => query.removeEventListener("change", resolve);
  }, []);

  useEffect(() => {
    if (!openSession) return;

    const clockInMs = new Date(openSession.clockInAt).getTime();
    // Re-sync from the real clock-in time on every tick rather than just
    // incrementing by 1s, so the timer cannot drift from reality even if the
    // tab was backgrounded and throttled.
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - clockInMs);
    }, 1000);

    return () => clearInterval(interval);
  }, [openSession]);

  async function toggle() {
    setBusy(true);

    const response = await fetch(
      `/api/attendance/${openSession ? "clock-out" : "clock-in"}`,
      { method: "POST" }
    );

    const body = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok) {
      toast.error(body?.error ?? "Could not update your attendance.");
      return;
    }

    toast.success(openSession ? "Logged out." : "Logged in.");
    router.refresh();
  }

  async function takeBreak() {
    setBreakBusy(true);

    const response = await fetch("/api/attendance/break/start", {
      method: "POST",
    });

    const body = await response.json().catch(() => null);
    setBreakBusy(false);

    if (!response.ok) {
      toast.error(body?.error ?? "Could not start your break.");
      return;
    }

    router.refresh();
  }

  const clockInBlocked = !openSession && screenAllowed === "blocked";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <p className="text-text-secondary text-meta">
          {openSession ? "Logged in since" : "Status"}
        </p>
        {openSession ? (
          <p className="text-h3 text-brand-brown font-mono font-semibold">
            {formatElapsed(elapsedMs)}
          </p>
        ) : (
          <p className="text-foreground font-medium">Not logged in</p>
        )}
      </div>

      {clockInBlocked ? (
        <p className="text-text-secondary text-meta sm:max-w-56 sm:text-right">
          Log in from a laptop or larger screen to clock in.
        </p>
      ) : (
        <div className="flex items-center gap-2">
          {openSession && !onBreak && (
            <Button
              type="button"
              variant="outline"
              disabled={breakBusy}
              onClick={takeBreak}
            >
              <Coffee aria-hidden />
              {breakBusy ? "Starting…" : "Take a break"}
            </Button>
          )}
          <Button
            type="button"
            variant={openSession ? "destructive" : "default"}
            disabled={busy}
            onClick={toggle}
          >
            {openSession ? <LogOut aria-hidden /> : <LogIn aria-hidden />}
            {busy ? "Working…" : openSession ? "Log out" : "Log in"}
          </Button>
        </div>
      )}
    </div>
  );
}

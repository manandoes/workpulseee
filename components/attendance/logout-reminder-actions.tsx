"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * The two answers to a logout reminder, rendered inside the notification
 * itself — in the bell's dropdown and on `/notifications`.
 *
 * The push notification carries the same pair as OS-level buttons
 * (`LOGOUT_REMINDER_ACTIONS` in `lib/notification-data.ts`, handled by
 * `public/sw.js`); both surfaces post to the same two routes, so there is one
 * implementation of each answer rather than one per channel.
 *
 * Answering marks the notification read, which is also what hides these
 * buttons: an answered reminder becomes an ordinary line of history. The
 * server does not depend on that — `sweepLogoutReminders` decides from
 * `presenceConfirmedAt` and `clockOutAt` alone, so a stale button pressed
 * twice, or pressed after the session is already closed, changes nothing.
 */
export function LogoutReminderActions({
  notificationId,
  onAnswered,
}: {
  notificationId: string;
  onAnswered?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"presence" | "logout" | null>(null);

  async function answer(choice: "presence" | "logout") {
    setBusy(choice);

    const response = await fetch(
      choice === "presence"
        ? "/api/attendance/presence"
        : "/api/attendance/clock-out",
      { method: "POST" }
    );

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setBusy(null);
      toast.error(body?.error ?? "Could not answer this reminder.");
      return;
    }

    await fetch(`/api/notifications/${notificationId}/read`, {
      method: "PATCH",
    });

    setBusy(null);
    toast.success(
      choice === "presence" ? "Still clocked in." : "Logged out."
    );
    onAnswered?.();
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 px-4 pb-3">
      <Button
        type="button"
        size="sm"
        disabled={busy !== null}
        onClick={() => answer("presence")}
      >
        {busy === "presence" ? "Saving…" : "I'm here"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy !== null}
        onClick={() => answer("logout")}
      >
        {busy === "logout" ? "Logging out…" : "Log out"}
      </Button>
    </div>
  );
}

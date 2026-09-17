"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Connect/disconnect Google Calendar (Plan.md Phase 17).
 *
 * Degrades to a disabled button with an explanation when the app itself has
 * no Google Cloud client configured — a missing integration must not break
 * the page (Plan.md's own wording).
 */
export function ConnectGoogleCard({
  connection,
  googleConfigured,
}: {
  connection: { googleEmail: string } | null;
  googleConfigured: boolean;
}) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);

  async function disconnect() {
    setDisconnecting(true);
    const response = await fetch("/api/calendar/google/disconnect", {
      method: "POST",
    });
    setDisconnecting(false);

    if (!response.ok) {
      toast.error("Could not disconnect Google Calendar.");
      return;
    }

    toast.success("Google Calendar disconnected");
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-2">
        <div>
          <p className="text-foreground font-medium">Google Calendar</p>
          {connection ? (
            <p className="text-text-secondary text-meta">
              Connected as {connection.googleEmail}. WorkPulse only reads your
              schedule to preview it — it never writes anything back.
            </p>
          ) : googleConfigured ? (
            <p className="text-text-secondary text-meta">
              Connect your Google account so colleagues can see when you are
              busy. Read-only — nothing is ever written back to Google.
            </p>
          ) : (
            <p className="text-text-secondary text-meta">
              Not set up for this app yet. Ask your admin to add a Google
              Cloud OAuth client.
            </p>
          )}
        </div>

        {connection ? (
          <Button
            type="button"
            variant="ghost"
            onClick={disconnect}
            disabled={disconnecting}
          >
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </Button>
        ) : (
          <Button asChild={googleConfigured} variant={googleConfigured ? "default" : "outline"}>
            {googleConfigured ? (
              <a href="/api/calendar/google/connect">Connect Google Calendar</a>
            ) : (
              <span className="cursor-not-allowed opacity-50">
                Connect Google Calendar
              </span>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { FormsConnectionSummary } from "@/lib/google-forms-data";

/**
 * The company's Google account for the Forms destination (Plan: hiring).
 *
 * Three states, all of them legitimate — the hosted destination works without
 * Google at all, so this is never an error, only a fact about what is
 * available:
 *
 *  - not configured on this deployment (no env vars): explain, no button;
 *  - configured but not connected: offer to connect;
 *  - connected: name the account and offer to disconnect.
 */
const ERRORS: Record<string, string> = {
  missing_params: "Google sent us back without the details we needed.",
  invalid_state: "That connection link expired. Try connecting again.",
  exchange_failed: "Google would not complete the connection.",
  no_email: "Google did not tell us which account was connected.",
};

export function GoogleConnectionCard({
  connection,
  configured,
  justConnected,
  error,
}: {
  connection: FormsConnectionSummary | null;
  configured: boolean;
  justConnected: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);

  async function disconnect() {
    setDisconnecting(true);
    try {
      const response = await fetch("/api/hiring/google/disconnect", {
        method: "POST",
      });
      if (!response.ok) throw new Error("disconnect failed");

      toast.success("Google account disconnected.");
      router.refresh();
    } catch {
      toast.error("Could not disconnect. Try again.");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <Card className="mb-8">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-h3 text-brand-brown font-semibold">
            Google Forms
          </h2>

          {error ? (
            <p className="text-danger-text">
              {ERRORS[error] ?? "That connection did not complete."}
            </p>
          ) : justConnected ? (
            <p className="text-success-text">
              Connected. New forms can now be published to Google.
            </p>
          ) : !configured ? (
            <p className="text-text-secondary max-w-xl">
              Not set up on this deployment. Forms still publish to your own
              WorkPulse careers URL — that destination needs no Google account.
            </p>
          ) : connection ? (
            <p className="text-text-secondary max-w-xl">
              Forms publish to <strong>{connection.googleEmail}</strong>
              {connection.connectedByName
                ? `, connected by ${connection.connectedByName}`
                : ""}
              .
            </p>
          ) : (
            <p className="text-text-secondary max-w-xl">
              Connect a Google account to publish openings as real Google Forms
              and pull the responses back into this pipeline.
            </p>
          )}
        </div>

        {configured ? (
          connection ? (
            <Button
              variant="outline"
              onClick={disconnect}
              disabled={disconnecting}
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </Button>
          ) : (
            // A full navigation, not a client transition: this route answers
            // with a redirect to Google's consent screen, which `next/link`
            // would try to prefetch and resolve as an internal page.
            <Button asChild>
              <Link href="/api/hiring/google/connect" prefetch={false}>
                Connect Google
              </Link>
            </Button>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

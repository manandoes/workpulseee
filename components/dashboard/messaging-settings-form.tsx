"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Server-passed company messaging state (read from `Company` at render time).
 */
export type MessagingSettingsServerData = {
  messagingProvider: "Native" | "Google" | "Both";
  googleChatEnabled: boolean;
  googleChatConnectedByEmail: string | null;
};

export function MessagingSettingsForm({
  initial,
}: {
  initial: MessagingSettingsServerData;
}) {
  const [provider, setProvider] = useState(initial.messagingProvider);
  const [connected, setConnected] = useState(initial.googleChatEnabled);
  const [connectedEmail, setConnectedEmail] = useState(
    initial.googleChatConnectedByEmail
  );
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/messaging", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messagingProvider: provider,
          googleChatEnabled: connected,
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        throw new Error(body.message ?? "Failed to save");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/messaging/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        throw new Error(body.message ?? "Failed to get auth URL");
      }
      const data = (await res.json()) as { authUrl: string };
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/messaging", {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        throw new Error(body.message ?? "Failed to disconnect");
      }
      // Disconnecting clears the refresh token; the provider stays at whatever
      // the owner chose so existing Google conversations still show, they just
      // can't be reached until a new connection is made.
      setConnected(false);
      setConnectedEmail(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-brand-brown">
          Default messaging provider
        </label>
        <Select
          value={provider}
          onValueChange={(v) => setProvider(v as "Native" | "Google" | "Both")}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Native">Native</SelectItem>
            <SelectItem value="Google">Google Chat</SelectItem>
            <SelectItem value="Both">Both</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm text-text-secondary">
          {provider === "Native"
            ? "All conversations use the built-in in-app chat. Messages are stored in your WorkPulse database."
            : provider === "Google"
            ? "All conversations will use Google Chat as the backend. Messages are stored in Google Chat, not in WorkPulse."
            : "Employees can choose between Native and Google Chat when starting a conversation."}
        </p>
      </div>

      {provider !== "Native" && (
        <div className="mt-2 flex flex-col gap-3 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-brand-brown">
                Google Chat connection
              </p>
              <p className="text-xs text-text-secondary">
                {connectedEmail
                  ? `Connected as ${connectedEmail}`
                  : "Connect your Google Workspace to enable Google Chat"}
              </p>
            </div>
            <div className="flex gap-2">
              {connected ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDisconnect}
                    disabled={saving}
                  >
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleConnect}
                  disabled={connecting || !provider}
                >
                  {connecting ? "Connecting..." : "Connect Google"}
                </Button>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      <div className="pt-2">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-brand-yellow hover:bg-brand-yellow/90"
        >
          {saving ? "Saving..." : "Save settings"}
        </Button>
      </div>
    </div>
  );
}

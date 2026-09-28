"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Eye, FileText, KeyRound, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccessStatusBadge } from "@/components/vault/access-status-badge";
import { canRequestWith, canRevealWith } from "@/lib/vault";
import type {
  VaultBrowser as VaultBrowserData,
  VaultBrowserClient,
} from "@/lib/vault-data";

/**
 * Loads `/api/vault` on mount and on every `pollMs`, exposing a manual
 * `refresh` for after a request is sent. Shared by the key menu and the
 * requester's `/vault` page so both read the same shape the same way.
 */
export function useVaultBrowser(pollMs?: number) {
  const [data, setData] = useState<VaultBrowserData | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/vault");
      if (!response.ok) throw new Error(`GET /api/vault ${response.status}`);
      setData(await response.json());
      setFailed(false);
    } catch {
      // Keeps whatever was last loaded; only an empty menu shows the error.
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    // Deferred, like the bells' initial fetch (react-hooks/set-state-in-effect).
    const initial = setTimeout(refresh, 0);
    const interval = pollMs ? setInterval(refresh, pollMs) : undefined;
    return () => {
      clearTimeout(initial);
      if (interval) clearInterval(interval);
    };
  }, [refresh, pollMs]);

  return { data, failed, refresh };
}

/**
 * Clients -> credential titles (Plan: client vault). Expanding a client lists
 * its credentials: ones the viewer may see get a View button, ones they may
 * ask for get a checkbox, and ticking any opens the request line — several
 * credentials of one client go out as one request.
 */
export function VaultBrowser({
  data,
  failed = false,
  onView,
  onRequested,
  className,
}: {
  data: VaultBrowserData | null;
  /** The last load failed — shown only while there is nothing to show. */
  failed?: boolean;
  onView: (credentialId: string) => void;
  onRequested: () => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const clients = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!data || !needle) return data?.clients ?? [];
    return data.clients.filter(
      (client) =>
        client.name.toLowerCase().includes(needle) ||
        client.credentials.some((c) => c.title.toLowerCase().includes(needle))
    );
  }, [data, query]);

  if (!data) {
    return (
      <p className="text-text-secondary px-4 py-6 text-center">
        {failed
          ? "Couldn't load the vault. Try again in a moment."
          : "Loading…"}
      </p>
    );
  }

  if (data.clients.length === 0) {
    return (
      <p className="text-text-secondary px-4 py-6 text-center">
        {data.canManage
          ? "No client credentials stored yet."
          : "No client credentials have been shared yet."}
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="relative px-3 pt-3 pb-2">
        <Search
          aria-hidden
          className="text-text-secondary pointer-events-none absolute top-1/2 left-5.5 mt-0.5 size-4 -translate-y-1/2"
          strokeWidth={1.5}
        />
        <Input
          type="search"
          aria-label="Search clients and credentials"
          placeholder="Search clients"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-8 pl-8"
        />
      </div>

      {clients.length === 0 ? (
        <p className="text-text-secondary px-4 py-4 text-center">No matches.</p>
      ) : (
        <ul className="divide-border divide-y">
          {clients.map((client) => (
            <ClientRow
              key={client.id}
              client={client}
              expanded={expandedId === client.id}
              onToggle={() =>
                setExpandedId((id) => (id === client.id ? null : client.id))
              }
              onView={onView}
              onRequested={onRequested}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ClientRow({
  client,
  expanded,
  onToggle,
  onView,
  onRequested,
}: {
  client: VaultBrowserClient;
  expanded: boolean;
  onToggle: () => void;
  onView: (credentialId: string) => void;
  onRequested: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const panelId = `vault-client-${client.id}`;

  function toggle(credentialId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(credentialId);
      else next.delete(credentialId);
      return next;
    });
  }

  async function request() {
    setBusy(true);
    const response = await fetch("/api/vault/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credentialIds: [...selected], reason }),
    });
    const body = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok) {
      toast.error(body?.error ?? "Could not send that request.");
      return;
    }

    toast.success(
      body.requested === 1
        ? "Request sent — you'll be notified once it's decided."
        : `${body.requested} requests sent — you'll be notified once they're decided.`
    );
    setSelected(new Set());
    setReason("");
    onRequested();
  }

  return (
    <li>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
        className="hover:bg-surface-muted flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors"
      >
        <ChevronRight
          aria-hidden
          className={cn(
            "text-text-secondary size-4 shrink-0 transition-transform",
            expanded && "rotate-90"
          )}
          strokeWidth={1.5}
        />
        <span className="text-foreground min-w-0 flex-1 truncate font-medium">
          {client.name}
        </span>
        {client.archived ? (
          <span className="text-text-secondary text-meta">Past</span>
        ) : null}
        <span className="text-text-secondary text-meta tabular-nums">
          {client.credentials.length}
        </span>
      </button>

      {expanded ? (
        <div id={panelId} className="px-3 pb-3">
          <ul className="flex flex-col">
            {client.credentials.map((credential) => {
              const requestable = canRequestWith(credential.access);
              const checkboxId = `vault-pick-${credential.id}`;
              const Icon = credential.kind === "file" ? FileText : KeyRound;

              return (
                <li
                  key={credential.id}
                  className="hover:bg-surface-muted flex min-h-9 items-center gap-2 rounded-lg px-2 py-1"
                >
                  {requestable ? (
                    <input
                      id={checkboxId}
                      type="checkbox"
                      checked={selected.has(credential.id)}
                      onChange={(event) =>
                        toggle(credential.id, event.target.checked)
                      }
                      className="accent-brand-brown size-4 shrink-0"
                    />
                  ) : (
                    <Icon
                      aria-hidden
                      className="text-brand-brown-soft size-4 shrink-0"
                      strokeWidth={1.5}
                    />
                  )}
                  <label
                    htmlFor={requestable ? checkboxId : undefined}
                    className="min-w-0 flex-1 truncate text-sm"
                  >
                    {credential.title}
                    {requestable && credential.kind === "file" ? (
                      <span className="text-text-secondary"> · file</span>
                    ) : null}
                  </label>

                  {canRevealWith(credential.access) ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => onView(credential.id)}
                    >
                      <Eye aria-hidden />
                      View
                    </Button>
                  ) : credential.access !== "none" &&
                    credential.access !== "manage" ? (
                    <AccessStatusBadge status={credential.access} />
                  ) : null}
                </li>
              );
            })}
          </ul>

          {selected.size > 0 ? (
            <div className="mt-2 flex flex-col gap-2 px-2">
              <Input
                aria-label="Why do you need access? (optional)"
                placeholder="Why do you need it? (optional)"
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="h-8"
              />
              <Button type="button" size="sm" disabled={busy} onClick={request}>
                {busy ? "Sending…" : `Request access (${selected.size})`}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

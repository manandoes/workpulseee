"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ShieldOff, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateTime } from "@/components/ui/date-time";
import type { AccessAction } from "@/lib/vault";

export type AccessTableRow = {
  id: string;
  requesterName: string;
  requesterRole: string;
  clientName: string;
  credentialTitle: string;
  reason: string | null;
  requestedAt: string;
  decidedByName: string | null;
  decidedAt: string | null;
};

const ACTION_TOASTS: Record<AccessAction, string> = {
  approve: "Access approved",
  reject: "Request rejected",
  revoke: "Access revoked",
};

/**
 * Vault access rows for a vault manager (Plan: client vault): the pending
 * queue with Approve/Reject, or current access with Revoke. The requester is
 * notified by the server either way.
 */
export function AccessTable({
  rows,
  mode,
}: {
  rows: AccessTableRow[];
  mode: "pending" | "approved";
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(id: string, action: AccessAction) {
    setBusyId(id);
    const response = await fetch(`/api/vault/access/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await response.json().catch(() => null);
    setBusyId(null);

    if (!response.ok) {
      toast.error(body?.error ?? "Could not record that.");
      router.refresh();
      return;
    }
    toast.success(ACTION_TOASTS[action]);
    router.refresh();
  }

  return (
    <ul className="border-border bg-surface divide-border divide-y rounded-xl border">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex flex-wrap items-center gap-3 px-4 py-3"
        >
          <div className="min-w-0 flex-1">
            <p className="text-foreground">
              <span className="font-medium">{row.requesterName}</span>
              <span className="text-text-secondary text-meta">
                {" "}
                · {row.requesterRole}
              </span>
            </p>
            <p className="text-sm">
              {row.clientName} ·{" "}
              <span className="font-medium">{row.credentialTitle}</span>
            </p>
            {row.reason ? (
              <p className="text-text-secondary text-sm">“{row.reason}”</p>
            ) : null}
            <p className="text-text-secondary text-meta">
              {mode === "pending" ? (
                <>
                  Requested <DateTime value={row.requestedAt} />
                </>
              ) : (
                <>
                  Approved
                  {row.decidedByName ? ` by ${row.decidedByName}` : ""}{" "}
                  <DateTime value={row.decidedAt} />
                </>
              )}
            </p>
          </div>

          <div className="flex gap-2">
            {mode === "pending" ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  disabled={busyId === row.id}
                  onClick={() => act(row.id, "approve")}
                >
                  <Check aria-hidden />
                  Approve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyId === row.id}
                  onClick={() => act(row.id, "reject")}
                >
                  <X aria-hidden />
                  Reject
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busyId === row.id}
                onClick={() => act(row.id, "revoke")}
              >
                <ShieldOff aria-hidden />
                Revoke
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

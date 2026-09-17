"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PerformanceSubject } from "@/lib/performance-data";

/**
 * Mark an Active goal Achieved or Missed (Phases.md Phase 8).
 *
 * One-time, like a request decision: only rendered for a goal whose status is
 * still `Active` — the server refuses a second decision with 409.
 */
export function GoalDecisionActions({
  subject,
  goalId,
}: {
  subject: PerformanceSubject;
  goalId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function decide(status: "Achieved" | "Missed") {
    setBusy(true);

    const response = await fetch(
      `/api/performance/${subject.kind}/${subject.id}/goals/${goalId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }
    );

    const body = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok) {
      toast.error(body?.error ?? "Could not record that decision.");
      return;
    }

    toast.success(
      status === "Achieved" ? "Goal marked achieved" : "Goal marked missed"
    );
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => decide("Achieved")}
      >
        <Check aria-hidden />
        Achieved
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => decide("Missed")}
      >
        <X aria-hidden />
        Missed
      </Button>
    </div>
  );
}

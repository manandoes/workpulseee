"use client";

import React, { useState, useEffect } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EisenhowerMatrixDialog } from "@/components/eisenhower/eisenhower-matrix-dialog";

type TaskItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  assigneeName: string | null;
  projectName: string | null;
};

/**
 * Top bar button that opens the Eisenhower Decision Matrix dialog.
 * Placed next to the notification bell in the dashboard header.
 * Fetches tasks client-side when the dialog first opens.
 */
export function EisenhowerTopBarButton() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function loadTasks() {
    if (loaded) return;
    try {
      const res = await fetch("/api/my-tasks");
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks ?? []);
      }
    } catch {
      // Silently fail — user can retry by opening the dialog
    }
    setLoaded(true);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground hover:text-brand-brown"
        onClick={() => {
          loadTasks().then(() => setOpen(true));
        }}
        title="Eisenhower Decision Matrix"
        aria-label="Open Eisenhower Decision Matrix"
      >
        <Flag className="size-4" />
      </Button>
      <EisenhowerMatrixDialog
        open={open}
        onOpenChange={setOpen}
        tasks={tasks}
      />
    </>
  );
}

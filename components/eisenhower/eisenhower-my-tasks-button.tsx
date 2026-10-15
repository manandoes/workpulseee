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
 * My Tasks page header button that opens the Eisenhower Decision Matrix dialog.
 */
export function EisenhowerMatrixButton() {
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
      // Silently fail
    }
    setLoaded(true);
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => {
          loadTasks().then(() => setOpen(true));
        }}
      >
        <Flag className="size-4" />
        Eisenhower Matrix
      </Button>
      <EisenhowerMatrixDialog
        open={open}
        onOpenChange={setOpen}
        tasks={tasks}
      />
    </>
  );
}

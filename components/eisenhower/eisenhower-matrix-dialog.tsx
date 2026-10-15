"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, X, Flag } from "lucide-react";
import { cn } from "cn";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MatrixTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  assigneeName: string | null;
  projectName: string | null;
};

type MatrixEntry = {
  id: string;
  taskId: string;
  quadrant: string;
  sortOrder: number;
  task: MatrixTask;
};

type Quadrant = {
  key: string;
  label: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
};

const QUADRANTS: Quadrant[] = [
  {
    key: "DoNow",
    label: "Do Now",
    description: "Urgent & Important",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-950/20",
    borderColor: "border-red-200 dark:border-red-800",
  },
  {
    key: "Schedule",
    label: "Schedule",
    description: "Important, Not Urgent",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/20",
    borderColor: "border-blue-200 dark:border-blue-800",
  },
  {
    key: "Delegate",
    label: "Delegate",
    description: "Urgent, Not Important",
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-950/20",
    borderColor: "border-amber-200 dark:border-amber-800",
  },
  {
    key: "Eliminate",
    label: "Eliminate",
    description: "Not Urgent, Not Important",
    color: "text-gray-600 dark:text-gray-400",
    bgColor: "bg-gray-50 dark:bg-gray-950/20",
    borderColor: "border-gray-200 dark:border-gray-800",
  },
];

const PRIORITY_COLORS: Record<string, string> = {
  Urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  High: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  Medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  Low: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EisenhowerMatrixDialog({
  open,
  onOpenChange,
  tasks,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: MatrixTask[];
}) {
  const [entries, setEntries] = useState<MatrixEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load matrix entries when dialog opens
  useEffect(() => {
    if (open) {
      loadEntries();
    }
  }, [open]);

  async function loadEntries() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/eisenhower", {
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load matrix");
    } finally {
      setLoading(false);
    }
  }

  // Filter tasks based on search and priority
  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      !searchQuery ||
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (task.projectName?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (task.assigneeName?.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesPriority =
      priorityFilter === "all" || task.priority === priorityFilter;
    return matchesSearch && matchesPriority;
  });

  // Get entry for a task
  const getEntry = useCallback(
    (taskId: string) => entries.find((e) => e.taskId === taskId),
    [entries]
  );

  // Toggle selection
  const toggleSelect = (taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  // Add selected tasks to a quadrant
  const addToQuadrant = async (quadrant: string) => {
    if (selectedIds.size === 0) return;

    setLoading(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map(async (taskId) => {
          const res = await fetch("/api/eisenhower", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId, quadrant }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            throw new Error(data?.error ?? "Failed to add task");
          }
        })
      );
      setSelectedIds(new Set());
      await loadEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add tasks");
    } finally {
      setLoading(false);
    }
  };

  // Remove task from matrix
  const removeFromMatrix = async (taskId: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/eisenhower", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to remove task");
      }
      await loadEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove task");
    } finally {
      setLoading(false);
    }
  };

  // Move task to different quadrant
  const moveTask = async (taskId: string, quadrant: string) => {
    setLoading(true);
    try {
      const entry = getEntry(taskId);
      const res = await fetch("/api/eisenhower", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          quadrant,
          sortOrder: entry?.sortOrder ?? 0,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to move task");
      }
      await loadEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move task");
    } finally {
      setLoading(false);
    }
  };

  const quadrantEntries = QUADRANTS.reduce(
    (acc, q) => {
      acc[q.key] = entries.filter((e) => e.quadrant === q.key);
      return acc;
    },
    {} as Record<string, MatrixEntry[]>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="size-5" />
            Eisenhower Decision Matrix
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Error display */}
          {error ? (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4">
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-6 text-xs"
                onClick={() => setError(null)}
              >
                Dismiss
              </Button>
            </div>
          ) : null}

          <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: Matrix */}
            <div className="flex flex-col gap-3 overflow-y-auto">
              <h3 className="text-sm font-medium text-muted-foreground">
                Matrix View
              </h3>

              {/* X-axis labels */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="text-center text-xs font-medium text-muted-foreground">
                  Urgent
                </div>
                <div className="text-center text-xs font-medium text-muted-foreground">
                  Not Urgent
                </div>
              </div>

              {/* Y-axis labels + Grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Row 1: Important */}
                <div className="flex items-start gap-2">
                  <div className="flex flex-col justify-center">
                    <span className="text-xs font-medium text-muted-foreground rotate-90 whitespace-nowrap">
                      Important
                    </span>
                  </div>
                  <div className="flex-1 space-y-2">
                    <QuadrantCell
                      quadrant={QUADRANTS[0]}
                      entries={quadrantEntries.DoNow}
                      tasks={tasks}
                      getEntry={getEntry}
                      selectedIds={selectedIds}
                      loading={loading}
                      onRemove={removeFromMatrix}
                      onMove={moveTask}
                      onSelect={toggleSelect}
                      onAddSelected={addToQuadrant}
                    />
                    <QuadrantCell
                      quadrant={QUADRANTS[1]}
                      entries={quadrantEntries.Schedule}
                      tasks={tasks}
                      getEntry={getEntry}
                      selectedIds={selectedIds}
                      loading={loading}
                      onRemove={removeFromMatrix}
                      onMove={moveTask}
                      onSelect={toggleSelect}
                      onAddSelected={addToQuadrant}
                    />
                  </div>
                </div>

                {/* Row 2: Not Important */}
                <div className="flex items-start gap-2">
                  <div className="flex flex-col justify-center">
                    <span className="text-xs font-medium text-muted-foreground rotate-90 whitespace-nowrap">
                      Not Important
                    </span>
                  </div>
                  <div className="flex-1 space-y-2">
                    <QuadrantCell
                      quadrant={QUADRANTS[2]}
                      entries={quadrantEntries.Delegate}
                      tasks={tasks}
                      getEntry={getEntry}
                      selectedIds={selectedIds}
                      loading={loading}
                      onRemove={removeFromMatrix}
                      onMove={moveTask}
                      onSelect={toggleSelect}
                      onAddSelected={addToQuadrant}
                    />
                    <QuadrantCell
                      quadrant={QUADRANTS[3]}
                      entries={quadrantEntries.Eliminate}
                      tasks={tasks}
                      getEntry={getEntry}
                      selectedIds={selectedIds}
                      loading={loading}
                      onRemove={removeFromMatrix}
                      onMove={moveTask}
                      onSelect={toggleSelect}
                      onAddSelected={addToQuadrant}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Task List */}
            <div className="flex flex-col gap-3 overflow-hidden">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">
                  All Tasks ({tasks.length})
                </h3>
                {selectedIds.size > 0 ? (
                  <span className="text-xs text-primary font-medium">
                    {selectedIds.size} selected
                  </span>
                ) : null}
              </div>

              {/* Search and filter */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search tasks..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-7 h-8 text-sm"
                  />
                </div>
                <Select
                  value={priorityFilter}
                  onValueChange={setPriorityFilter}
                >
                  <option value="all">All Priority</option>
                  <option value="Urgent">Urgent</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </Select>
              </div>

              {/* Task list */}
              <div className="flex-1 overflow-y-auto space-y-1">
                {filteredTasks.map((task) => {
                  const entry = getEntry(task.id);
                  const isSelected = selectedIds.has(task.id);
                  const inQuadrant = !!entry;

                  return (
                    <div
                      key={task.id}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors",
                        isSelected
                          ? "bg-primary/10 border-primary"
                          : inQuadrant
                            ? "bg-muted/50 border-muted"
                            : "hover:bg-muted/50 border-transparent"
                      )}
                      onClick={() => toggleSelect(task.id)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(task.id)}
                        className="size-3.5 rounded border-border"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {task.title}
                        </p>
                        {task.projectName ? (
                          <p className="text-xs text-muted-foreground truncate">
                            {task.projectName}
                          </p>
                        ) : null}
                      </div>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-xs px-1.5 py-0",
                          PRIORITY_COLORS[task.priority] ??
                            "bg-gray-100 text-gray-700"
                        )}
                      >
                        {task.priority}
                      </Badge>
                      {inQuadrant ? (
                        <div className="relative group">
                          <Flag className="size-3.5 text-muted-foreground" />
                          <div className="absolute right-0 top-6 hidden group-hover:flex gap-1 bg-popover border rounded-md shadow-lg p-1 z-10">
                            {QUADRANTS.map((q) => (
                              <button
                                key={q.key}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveTask(task.id, q.key);
                                }}
                                className={cn(
                                  "text-xs px-2 py-1 rounded hover:bg-accent",
                                  entry.quadrant === q.key &&
                                    "bg-accent font-medium"
                                )}
                              >
                                {q.label}
                              </button>
                            ))}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFromMatrix(task.id);
                              }}
                              className="text-xs px-2 py-1 rounded hover:bg-destructive/10 hover:text-destructive"
                            >
                              <X className="size-3" />
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                {filteredTasks.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    No tasks match your filters
                  </p>
                ) : null}
              </div>

              {/* Add selected button */}
              {selectedIds.size > 0 ? (
                <div className="border-t pt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Add {selectedIds.size} selected task(s) to:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {QUADRANTS.map((q) => (
                      <Button
                        key={q.key}
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-8 text-xs justify-start",
                          q.bgColor,
                          q.borderColor
                        )}
                        onClick={() => addToQuadrant(q.key)}
                        disabled={loading}
                      >
                        {q.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function QuadrantCell({
  quadrant,
  entries,
  tasks,
  getEntry,
  selectedIds,
  loading,
  onRemove,
  onMove,
  onSelect,
  onAddSelected,
}: {
  quadrant: Quadrant;
  entries: MatrixEntry[];
  tasks: MatrixTask[];
  getEntry: (taskId: string) => MatrixEntry | undefined;
  selectedIds: Set<string>;
  loading: boolean;
  onRemove: (taskId: string) => void;
  onMove: (taskId: string, quadrant: string) => void;
  onSelect: (taskId: string) => void;
  onAddSelected: (quadrant: string) => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 min-h-[120px] flex flex-col",
        quadrant.bgColor,
        quadrant.borderColor
      )}
      onClick={() => onAddSelected(quadrant.key)}
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <h4 className={cn("text-sm font-semibold", quadrant.color)}>
            {quadrant.label}
          </h4>
          <p className="text-xs text-muted-foreground">
            {quadrant.description}
          </p>
        </div>
        <Badge variant="secondary" className="text-xs">
          {entries.length}
        </Badge>
      </div>

      <div className="flex-1 space-y-1.5">
        {entries.map((entry) => {
          const task = tasks.find((t) => t.id === entry.taskId);
          if (!task) return null;

          const isSelected = selectedIds.has(entry.taskId);

          return (
            <div
              key={entry.id}
              className={cn(
                "flex items-center gap-2 p-2 rounded bg-background/60 border cursor-pointer transition-colors",
                isSelected
                  ? "border-primary ring-1 ring-primary"
                  : "border-border hover:border-primary/50"
              )}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(entry.taskId);
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onSelect(entry.taskId)}
                className="size-3 rounded border-border"
                onClick={(e) => e.stopPropagation()}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{task.title}</p>
                {task.projectName ? (
                  <p className="text-xs text-muted-foreground truncate">
                    {task.projectName}
                  </p>
                ) : null}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(entry.taskId);
                }}
                className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
              >
                <X className="size-3" />
              </button>
            </div>
          );
        })}

        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No tasks
          </p>
        ) : null}
      </div>
    </div>
  );
}

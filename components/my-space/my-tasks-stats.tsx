"use client";

import { useState } from "react";
import type { MyWorkTask } from "@/lib/my-work-data";
import { MY_TASK_BUCKETS, myTaskBucket, type MyTaskBucket } from "@/lib/tasks";
import { MetricTile } from "@/components/dashboard/metric-tile";
import { TasksDialog } from "@/components/my-space/tasks-dialog";

const BUCKET_COPY: Record<MyTaskBucket, { title: string; empty: string }> = {
  overdue: { title: "Overdue", empty: "Nothing overdue." },
  dueToday: { title: "Due today", empty: "Nothing due today." },
  inProgress: { title: "In progress", empty: "Nothing in progress." },
  upcoming: { title: "Upcoming", empty: "Nothing waiting to be started." },
  done: { title: "Done", empty: "Nothing finished yet." },
};

/**
 * Client wrapper for My Tasks stats — makes the five stat boxes interactive,
 * each opening a dialog with the tasks in that bucket.
 */
export function MyTasksStats({
  tasks,
  now,
}: {
  tasks: MyWorkTask[];
  now: Date;
}) {
  const [openBucket, setOpenBucket] = useState<MyTaskBucket | null>(null);
  const activeBucket = openBucket
    ? bucketsFor(openBucket, tasks, now)
    : [];

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {MY_TASK_BUCKETS.map((bucket) => (
          <MetricTile
            key={bucket}
            label={BUCKET_COPY[bucket].title}
            value={String(bucketsFor(bucket, tasks, now).length)}
            onClick={() => setOpenBucket(bucket)}
          />
        ))}
      </div>

      <TasksDialog
        open={openBucket !== null}
        onOpenChange={(open) => {
          if (!open) setOpenBucket(null);
        }}
        bucket={openBucket ?? "done"}
        tasks={activeBucket}
        now={now}
      />
    </>
  );
}

function bucketsFor(bucket: MyTaskBucket, tasks: MyWorkTask[], now: Date): MyWorkTask[] {
  return tasks.filter((t) => myTaskBucket(t, now) === bucket);
}

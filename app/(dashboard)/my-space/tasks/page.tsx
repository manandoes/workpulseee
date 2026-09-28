import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { loadMyTasks, type MyWorkTask } from "@/lib/my-work-data";
import { MY_TASK_BUCKETS, myTaskBucket, type MyTaskBucket } from "@/lib/tasks";
import { EmptyState, PageHeader } from "@/components/dashboard/page-header";
import { MetricTile } from "@/components/dashboard/metric-tile";
import { TaskGroup } from "@/components/my-space/my-tasks";

export const metadata: Metadata = { title: "My Tasks" };

const BUCKET_COPY: Record<MyTaskBucket, { title: string; empty: string }> = {
  overdue: { title: "Overdue", empty: "Nothing overdue." },
  dueToday: { title: "Due today", empty: "Nothing due today." },
  inProgress: { title: "In progress", empty: "Nothing in progress." },
  upcoming: { title: "Upcoming", empty: "Nothing waiting to be started." },
  done: { title: "Done", empty: "Nothing finished yet." },
};

/**
 * Every task allotted to the signed-in employee, grouped by where it stands —
 * overdue, due today, in progress, upcoming and recently done. "My Work"
 * shows only the open slice of this; this page is the full picture.
 */
export default async function MyTasksPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.accountType !== "employee") redirect("/dashboard");

  const now = new Date();
  const tasks = await loadMyTasks(actor);

  const buckets = Object.fromEntries(
    MY_TASK_BUCKETS.map((bucket) => [bucket, [] as MyWorkTask[]])
  ) as Record<MyTaskBucket, MyWorkTask[]>;
  for (const task of tasks) buckets[myTaskBucket(task, now)].push(task);

  return (
    <>
      <PageHeader
        title="My Tasks"
        description="Everything assigned to you — what's late, due today, in progress, coming up and done."
      />

      {tasks.length === 0 ? (
        <EmptyState
          title="No tasks assigned yet"
          description="When a manager allots you a task it will show up here."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {MY_TASK_BUCKETS.map((bucket) => (
              <MetricTile
                key={bucket}
                label={BUCKET_COPY[bucket].title}
                value={String(buckets[bucket].length)}
              />
            ))}
          </div>

          <div className="flex flex-col gap-6">
            {MY_TASK_BUCKETS.map((bucket) => (
              <TaskGroup
                key={bucket}
                title={BUCKET_COPY[bucket].title}
                tasks={buckets[bucket]}
                now={now}
                emptyText={BUCKET_COPY[bucket].empty}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import { canViewProjects } from "@/lib/permissions";
import { loadMyWork } from "@/lib/my-work-data";
import {
  loadMyAttendance,
  loadOpenBreak,
  loadOpenSession,
} from "@/lib/attendance-data";
import { PageHeader } from "@/components/dashboard/page-header";
import { MetricTile } from "@/components/dashboard/metric-tile";
import { WorkloadBar } from "@/components/dashboard/workload-bar";
import { MyTaskList } from "@/components/my-space/my-tasks";
import { MyProjectList } from "@/components/my-space/my-projects";
import { AttendanceWidget } from "@/components/attendance/attendance-widget";
import { AttendanceTable } from "@/components/attendance/attendance-table";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "My Work — Talking Lens Media" };

/**
 * "My Work" (Phases.md Phase 10, PRD.md section 6.9): today's tasks, upcoming
 * deadlines, current projects and workload — the employee's own picture,
 * without needing manager/HR views. The other two self-service panels, "My
 * Growth" and "My Requests", were already built in Phases 8 and 7.
 */
export default async function MySpacePage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.accountType !== "employee") redirect("/dashboard");

  const now = new Date();
  const mayViewProjects = canViewProjects(actor);
  const [work, openSession, openBreak, attendance, companyProjects] =
    await Promise.all([
      loadMyWork(actor),
      loadOpenSession(actor),
      loadOpenBreak(actor),
      loadMyAttendance(actor),
      mayViewProjects
        ? db.project.findMany({
            where: scopedWhere(actor, {}),
            orderBy: [{ status: "asc" }, { name: "asc" }],
            select: {
              id: true,
              name: true,
              status: true,
              client: { select: { name: true } },
            },
          })
        : Promise.resolve(null),
    ]);

  return (
    <>
      <PageHeader
        title="My Work"
        description="Your tasks, deadlines, current projects and workload."
      />

      <Card>
        <CardContent className="py-2">
          <AttendanceWidget
            openSession={
              openSession
                ? {
                    id: openSession.id,
                    clockInAt: openSession.clockInAt.toISOString(),
                  }
                : null
            }
            onBreak={openBreak !== null}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col gap-1 py-2">
            <p className="text-text-secondary text-meta">Workload</p>
            <WorkloadBar percent={work.workloadPercent} />
          </CardContent>
        </Card>
        <MetricTile label="Open tasks" value={String(work.tasks.length)} />
        <MetricTile
          label="Current projects"
          value={String(work.projects.length)}
        />
      </div>

      <MyTaskList tasks={work.tasks} now={now} />

      <div className="flex flex-col gap-3">
        <h2 className="text-h3 text-brand-brown font-semibold">
          Current projects
        </h2>
        <MyProjectList projects={work.projects} />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 py-2">
          <h2 className="text-h3 text-brand-brown font-semibold">Attendance</h2>
          <AttendanceTable records={attendance} now={now} />
        </CardContent>
      </Card>

      {companyProjects ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-h3 text-brand-brown font-semibold">
            Company projects
          </h2>
          <p className="text-text-secondary text-meta">
            You can see every project because you&apos;ve been granted that
            power.
          </p>
          <MyProjectList projects={companyProjects} />
        </div>
      ) : null}
    </>
  );
}

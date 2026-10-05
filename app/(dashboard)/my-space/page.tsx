import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import { canViewProjects } from "@/lib/permissions";
import { loadMyWork } from "@/lib/my-work-data";
import {
  loadMyWorkCalendarData,
  type MonthRange,
} from "@/lib/my-work-data";
import {
  loadOpenSession,
  loadOpenBreak,
} from "@/lib/attendance-data";
import { PageHeader } from "@/components/dashboard/page-header";
import { MyTaskList } from "@/components/my-space/my-tasks";
import { MyProjectList } from "@/components/my-space/my-projects";
import { MyWorkStats } from "@/components/my-space/my-work-stats";
import { AttendanceWidget } from "@/components/attendance/attendance-widget";
import { AttendanceCalendar } from "@/components/attendance/attendance-calendar";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "My Work" };

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

  // Build the current month range for the calendar.
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthRange: MonthRange = {
    fromDayKey: `${year}-${String(month + 1).padStart(2, "0")}-01`,
    toDayKey: `${year}-${String(month + 1).padStart(2, "0")}-${new Date(year, month + 1, 0).getDate()}`,
  };

  const [work, openSession, openBreak, calendarData, companyProjects] =
    await Promise.all([
      loadMyWork(actor),
      loadOpenSession(actor),
      loadOpenBreak(actor),
      loadMyWorkCalendarData(actor, now, monthRange),
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

      <MyWorkStats
        tasks={work.tasks}
        projects={work.projects}
        workloadPercent={work.workloadPercent}
        now={now}
      />

      <MyTaskList tasks={work.tasks} now={now} />

      <div className="flex flex-col gap-3">
        <h2 className="text-h3 text-brand-brown font-semibold">
          Current projects
        </h2>
        <MyProjectList projects={work.projects} />
      </div>

      <Card>
        <CardContent className="py-2">
          <AttendanceCalendar
            data={calendarData}
            todayKey={calendarData.todayKey}
          />
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

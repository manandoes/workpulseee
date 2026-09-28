import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { LEVEL_LABELS } from "@/lib/permission-grants";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import { formatDate, formatDuration, humanizeEnum } from "@/lib/format";
import {
  canManageAccountPerformance,
  canManageEmployees,
  canViewAccountDetails,
  canViewAccountPerformance,
  canViewAttendance,
  canViewPersonalDetails,
  canViewPerformance,
} from "@/lib/permissions";
import { loadPersonAttendance } from "@/lib/attendance-data";
import { totalDurationMs } from "@/lib/attendance";
import { countTasksByStatus } from "@/lib/task-data";
import {
  loadFeedback,
  loadGoals,
  loadPerformanceHistory,
} from "@/lib/performance-data";
import { PageHeader } from "@/components/dashboard/page-header";
import { Avatar } from "@/components/dashboard/avatar";
import { Panel, Detail } from "@/components/dashboard/detail-panel";
import { AttendanceTable } from "@/components/attendance/attendance-table";
import { MessageButton } from "@/components/chat/message-button";
import { Button } from "@/components/ui/button";
import { PerformanceScoreBadge } from "@/components/performance/score-badge";
import { ScoreHistoryChart } from "@/components/performance/score-history-chart";
import { GoalList } from "@/components/performance/goal-views";
import { GoalForm } from "@/components/performance/goal-form";
import { FeedbackList } from "@/components/performance/feedback-views";
import { FeedbackForm } from "@/components/performance/feedback-form";

export const metadata: Metadata = { title: "Squad" };

/**
 * A Squad member's detail (Phase 11). Always shows the basic block; every
 * gated panel checks its own power (Plan: access levels) — personal or
 * contact details, attendance, and growth — so the Owner's switches decide
 * each one independently, for an employee or a company-login subject alike.
 */
export default async function SquadMemberPage({
  params,
}: PageProps<"/squad/[memberKind]/[memberId]">) {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const { memberKind, memberId } = await params;
  if (memberKind !== "employee" && memberKind !== "account") notFound();

  if (memberKind === "account") {
    const account = await db.companyAccount.findFirst({
      where: { id: memberId, companyId: actor.companyId, deletedAt: null },
      select: {
        id: true,
        fullName: true,
        workEmail: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
      },
    });
    if (!account) notFound();

    const isSelf = actor.accountType === "company" && actor.id === account.id;
    const maySeeDetail = canViewAccountDetails(actor, account);
    // Plan: attendance for all company accounts — whoever holds the
    // attendance power reviews anyone's, a company login's included, and
    // everyone sees their own.
    const maySeeAttendance = canViewAttendance(actor, {
      kind: "account",
      id: account.id,
    });
    // Plan: performance for all company accounts — reading or deciding a
    // company login's goals takes `ManagePerformance` (there is no manager
    // relationship to check, unlike an employee), matching the API routes.
    const maySeeGrowth = canViewAccountPerformance(actor, account);
    const mayDecide = canManageAccountPerformance(actor);

    const accountSubject = { kind: "account" as const, id: account.id };

    const [attendance, growthHistory, goals, feedback] = await Promise.all([
      maySeeAttendance
        ? loadPersonAttendance(actor, { kind: "account", id: account.id })
        : Promise.resolve(null),
      maySeeGrowth
        ? loadPerformanceHistory(actor.companyId, accountSubject)
        : Promise.resolve([]),
      maySeeGrowth ? loadGoals(actor.companyId, accountSubject) : Promise.resolve([]),
      maySeeGrowth ? loadFeedback(actor.companyId, accountSubject) : Promise.resolve([]),
    ]);
    const now = new Date();

    const latestScore = growthHistory[0]?.score ?? null;
    const chartHistory = [...growthHistory].reverse().map((point) => ({
      score: Number(point.score),
      computedAt: point.computedAt,
    }));

    return (
      <>
        <BackLink />
        <PageHeader
          title={account.fullName}
          description={LEVEL_LABELS[account.role]}
          action={!isSelf ? <MessageButton target={{ accountId: account.id }} /> : undefined}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Account" plain={false}>
            <Detail label="Level" value={LEVEL_LABELS[account.role]} />
            <Detail label="Added" value={formatDate(account.createdAt)} />
          </Panel>

          {maySeeDetail ? (
            <Panel
              title="Contact"
              note="Private — only for people with access to personal details."
            >
              <Detail label="Work email" value={account.workEmail} />
            </Panel>
          ) : (
            <Panel title="Contact" plain>
              <p className="text-text-secondary">
                Contact details are limited to HR, admins and the owner.
              </p>
            </Panel>
          )}

          {attendance ? (
            <Panel title="Attendance" plain>
              <p className="text-foreground">
                Total logged: {formatDuration(totalDurationMs(attendance, now))}
              </p>
              <AttendanceTable records={attendance} now={now} />
            </Panel>
          ) : (
            <Panel title="Attendance" plain>
              <p className="text-text-secondary">
                Attendance is limited to HR, admins, the owner and this person
                themselves.
              </p>
            </Panel>
          )}

          {maySeeGrowth ? (
            <Panel title="Growth" plain>
              <PerformanceScoreBadge score={latestScore === null ? null : Number(latestScore)} />
              <ScoreHistoryChart history={chartHistory} />
              <div className="mt-2">
                <GoalList subject={accountSubject} goals={goals} mayDecide={mayDecide} />
                {mayDecide ? <GoalForm subject={accountSubject} /> : null}
              </div>
              <div className="mt-2">
                <FeedbackList feedback={feedback} />
                {mayDecide ? <FeedbackForm subject={accountSubject} /> : null}
              </div>
            </Panel>
          ) : (
            <Panel title="Growth" plain>
              <p className="text-text-secondary">
                Growth is limited to HR, admins, the owner and this person
                themselves.
              </p>
            </Panel>
          )}
        </div>
      </>
    );
  }

  const employee = await db.employee.findFirst({
    where: scopedWhere(actor, { id: memberId }),
    select: {
      id: true,
      fullName: true,
      employeeCode: true,
      companyEmail: true,
      avatarUrl: true,
      jobRole: true,
      employmentType: true,
      startDate: true,
      status: true,
      createdAt: true,
      managerId: true,
      managerAccountId: true,
      personalEmail: true,
      phone: true,
      dateOfBirth: true,
      location: true,
      address: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      department: { select: { name: true } },
      manager: { select: { fullName: true } },
      managerAccount: { select: { fullName: true, role: true } },
    },
  });
  if (!employee) notFound();

  const isSelf = actor.accountType === "employee" && actor.id === employee.id;
  // Each of these includes the person themselves.
  const maySeeDetail = canViewPersonalDetails(actor, employee);
  const maySeeAttendance = canViewAttendance(actor, {
    kind: "employee",
    id: employee.id,
  });
  const maySeeGrowth = canViewPerformance(actor, employee);
  const mayEdit = canManageEmployees(actor);
  const employeeSubject = { kind: "employee" as const, id: employee.id };

  const [attendance, taskCounts, history, goals, feedback] = await Promise.all([
    maySeeAttendance
      ? loadPersonAttendance(actor, { kind: "employee", id: employee.id })
      : Promise.resolve(null),
    // Task counts are work data, so they follow performance, not the
    // private attendance panel they used to share.
    maySeeGrowth
      ? countTasksByStatus(actor.companyId, employee.id)
      : Promise.resolve(null),
    maySeeGrowth
      ? loadPerformanceHistory(actor.companyId, employeeSubject)
      : Promise.resolve([]),
    maySeeGrowth ? loadGoals(actor.companyId, employeeSubject) : Promise.resolve([]),
    maySeeGrowth ? loadFeedback(actor.companyId, employeeSubject) : Promise.resolve([]),
  ]);
  const now = new Date();

  const manager = employee.manager
    ? employee.manager.fullName
    : employee.managerAccount
      ? `${employee.managerAccount.fullName} (${LEVEL_LABELS[employee.managerAccount.role]})`
      : "—";

  const latestScore = history[0]?.score ?? null;
  const chartHistory = [...history].reverse().map((point) => ({
    score: Number(point.score),
    computedAt: point.computedAt,
  }));

  return (
    <>
      <BackLink />
      <PageHeader
        title={employee.fullName}
        description={
          [employee.jobRole, employee.department?.name].filter(Boolean).join(" · ") ||
          "No job title set"
        }
        action={
          <div className="flex flex-wrap items-center gap-3">
            {!isSelf ? <MessageButton target={{ employeeId: employee.id }} /> : null}
            {mayEdit ? (
              <Button asChild variant="outline">
                <Link href={`/squad/employee/${employee.id}/edit`}>
                  <Pencil aria-hidden />
                  Edit profile
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="mb-6 flex items-center gap-3">
        <Avatar name={employee.fullName} avatarUrl={employee.avatarUrl} className="size-14" />
        <div>
          <p className="text-foreground font-medium">{employee.employeeCode}</p>
          <p className="text-text-secondary text-meta">{employee.companyEmail}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Professional">
          <Detail label="Department" value={employee.department?.name} />
          <Detail label="Job title" value={employee.jobRole} />
          <Detail label="Employment type" value={humanizeEnum(employee.employmentType)} />
          <Detail label="Start date" value={formatDate(employee.startDate)} />
          <Detail label="Reports to" value={manager} />
          <Detail label="Status" value={employee.status} />
        </Panel>

        {maySeeDetail ? (
          <Panel
            title="Personal"
            note="Private — only for people with access to personal details."
          >
            <Detail label="Personal email" value={employee.personalEmail} />
            <Detail label="Phone" value={employee.phone} />
            <Detail label="Date of birth" value={formatDate(employee.dateOfBirth)} />
            <Detail label="Location" value={employee.location} />
            <Detail label="Address" value={employee.address} />
            <Detail
              label="Emergency contact"
              value={
                employee.emergencyContactName
                  ? [employee.emergencyContactName, employee.emergencyContactPhone]
                      .filter(Boolean)
                      .join(" · ")
                  : null
              }
            />
          </Panel>
        ) : (
          <Panel title="Personal" plain>
            <p className="text-text-secondary">
              Personal details are limited to HR, admins and the owner, or
              whoever the owner gives access to.
            </p>
          </Panel>
        )}

        {attendance ? (
          <Panel title="Working hours" plain>
            <p className="text-foreground">
              Total logged: {formatDuration(totalDurationMs(attendance, now))}
            </p>
            <AttendanceTable records={attendance} now={now} />
          </Panel>
        ) : (
          <Panel title="Working hours" plain>
            <p className="text-text-secondary">
              Attendance is limited to HR, admins and the owner, or whoever the
              owner gives access to.
            </p>
          </Panel>
        )}

        {maySeeGrowth ? (
          <Panel title="Growth" plain>
            {taskCounts ? (
              <p className="text-foreground">
                Tasks: {taskCounts.done} done · {taskCounts.pending} pending
              </p>
            ) : null}
            <PerformanceScoreBadge score={latestScore === null ? null : Number(latestScore)} />
            <ScoreHistoryChart history={chartHistory} />
            <div className="mt-2">
              <GoalList subject={employeeSubject} goals={goals} mayDecide={false} />
            </div>
            <div className="mt-2">
              <FeedbackList feedback={feedback} />
            </div>
          </Panel>
        ) : (
          <Panel title="Growth" plain>
            <p className="text-text-secondary">
              Growth is limited to managers, HR, admins and the owner.
            </p>
          </Panel>
        )}
      </div>
    </>
  );
}

function BackLink() {
  return (
    <Link
      href="/squad"
      className="text-text-secondary hover:text-brand-brown mb-4 inline-flex items-center gap-1.5"
    >
      <ArrowLeft aria-hidden className="size-4" strokeWidth={1.5} />
      Back to Squad
    </Link>
  );
}

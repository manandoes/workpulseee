import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import { formatDate, formatDateTime, humanizeEnum } from "@/lib/format";
import {
  canEditEmployee,
  canManageEmployees,
  canViewAllEmployees,
  canViewPersonalDetails,
  canViewProjects,
} from "@/lib/permissions";
import { loadPersonAttendance } from "@/lib/attendance-data";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmployeeStatusBadge } from "@/components/employees/status-badge";
import { EmployeeStatusActions } from "@/components/employees/employee-status-actions";
import { EmployeeDeleteButton } from "@/components/employees/employee-delete-button";
import { ProjectStatusBadge } from "@/components/projects/status-badge";
import { WorkloadBar } from "@/components/dashboard/workload-bar";
import { AttendanceTable } from "@/components/attendance/attendance-table";
import { Button } from "@/components/ui/button";
import { Panel, Detail } from "@/components/dashboard/detail-panel";

export const metadata: Metadata = { title: "Employee" };

/**
 * Employee profile (PRD.md section 6.2).
 *
 * Personal details are rendered only for the roles allowed to see them
 * (Rules.md section 3). This is a server component, so a field that is not
 * rendered is never serialised into the response — a role without the right
 * does not receive the values at all, hidden or otherwise.
 */
export default async function EmployeeProfilePage({
  params,
}: PageProps<"/employees/[id]">) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canViewAllEmployees(actor)) redirect("/my-space");

  const { id } = await params;

  const employee = await db.employee.findFirst({
    // Tenant scoping (Rules.md section 2): an id from another company reads as
    // "not found" rather than revealing that the record exists.
    where: scopedWhere(actor, { id }),
    select: {
      id: true,
      fullName: true,
      employeeCode: true,
      companyEmail: true,
      jobRole: true,
      employmentType: true,
      startDate: true,
      status: true,
      joinedAt: true,
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
      workloadPercent: true,
      workloadUpdatedAt: true,
      department: { select: { name: true } },
      manager: { select: { id: true, fullName: true } },
      managerAccount: { select: { fullName: true, role: true } },
      invitedBy: { select: { fullName: true } },
      reports: {
        where: { deletedAt: null },
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true, jobRole: true, status: true },
      },
    },
  });

  if (!employee) notFound();

  /**
   * Their projects (Phases.md Phase 4). Read through `Project` rather than
   * `ProjectMember` so the query goes through the tenant filter, and only for
   * the roles that have the Projects section at all.
   */
  const projects = canViewProjects(actor)
    ? await db.project.findMany({
        where: scopedWhere(actor, {
          members: { some: { employeeId: employee.id } },
        }),
        orderBy: [{ status: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          status: true,
          client: { select: { name: true } },
        },
      })
    : null;

  const mayEdit = canEditEmployee(actor, employee);
  const maySeePersonal = canViewPersonalDetails(actor, employee);
  const mayChangeStatus = canManageEmployees(actor);

  // Attendance is as sensitive as the rest of the Personal panel, so it
  // follows the same visibility rule and is only loaded when it will
  // actually be rendered.
  const attendance = maySeePersonal
    ? await loadPersonAttendance(actor, { kind: "employee", id: employee.id })
    : null;
  const now = new Date();

  const manager = employee.manager
    ? employee.manager.fullName
    : employee.managerAccount
      ? `${employee.managerAccount.fullName} (${employee.managerAccount.role})`
      : "—";

  return (
    <>
      <Link
        href="/employees"
        className="text-text-secondary hover:text-brand-brown mb-4 inline-flex items-center gap-1.5"
      >
        <ArrowLeft aria-hidden className="size-4" strokeWidth={1.5} />
        Back to directory
      </Link>

      <PageHeader
        title={employee.fullName}
        description={
          [employee.jobRole, employee.department?.name]
            .filter(Boolean)
            .join(" · ") || "No job title set"
        }
        action={
          <div className="flex flex-wrap items-center gap-3">
            <EmployeeStatusBadge status={employee.status} />
            {mayEdit ? (
              <Button asChild variant="outline">
                <Link href={`/employees/${employee.id}/edit`}>
                  <Pencil aria-hidden />
                  Edit profile
                </Link>
              </Button>
            ) : null}
            {mayChangeStatus ? (
              <EmployeeStatusActions
                employeeId={employee.id}
                status={employee.status}
                fullName={employee.fullName}
              />
            ) : null}
            {mayChangeStatus ? (
              <EmployeeDeleteButton
                employeeId={employee.id}
                fullName={employee.fullName}
              />
            ) : null}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Professional">
          <Detail label="Employee ID" value={employee.employeeCode} />
          <Detail label="Work email" value={employee.companyEmail} />
          <Detail label="Department" value={employee.department?.name} />
          <Detail label="Job title" value={employee.jobRole} />
          <Detail
            label="Employment type"
            value={humanizeEnum(employee.employmentType)}
          />
          <Detail label="Start date" value={formatDate(employee.startDate)} />
          <Detail label="Reports to" value={manager} />
        </Panel>

        <Panel title="Workload" plain>
          <WorkloadBar
            percent={
              employee.workloadPercent === null
                ? null
                : Number(employee.workloadPercent)
            }
          />
          {employee.workloadUpdatedAt ? (
            <p className="text-text-secondary text-meta">
              As of {formatDateTime(employee.workloadUpdatedAt)}
            </p>
          ) : null}
        </Panel>

        {maySeePersonal ? (
          <Panel
            title="Personal"
            note="Visible to owners, admins, HR and this person's manager only."
          >
            <Detail label="Personal email" value={employee.personalEmail} />
            <Detail label="Phone" value={employee.phone} />
            <Detail
              label="Date of birth"
              value={formatDate(employee.dateOfBirth)}
            />
            <Detail label="Location" value={employee.location} />
            <Detail label="Address" value={employee.address} />
            <Detail
              label="Emergency contact"
              value={
                employee.emergencyContactName
                  ? [
                      employee.emergencyContactName,
                      employee.emergencyContactPhone,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : null
              }
            />
          </Panel>
        ) : (
          <Panel title="Personal" plain>
            <p className="text-text-secondary">
              Personal details are limited to owners, admins, HR and this
              person&apos;s own manager.
            </p>
          </Panel>
        )}

        {attendance ? (
          <Panel
            title="Attendance"
            note="Visible to owners, admins, HR and this person's manager only."
            plain
          >
            <AttendanceTable records={attendance} now={now} />
          </Panel>
        ) : (
          <Panel title="Attendance" plain>
            <p className="text-text-secondary">
              Attendance is limited to owners, admins, HR and this person&apos;s
              own manager.
            </p>
          </Panel>
        )}

        <Panel title="Account">
          <Detail label="Status" value={employee.status} />
          <Detail label="Added" value={formatDate(employee.createdAt)} />
          <Detail
            label="Accepted invite"
            value={
              employee.joinedAt ? formatDate(employee.joinedAt) : "Not yet"
            }
          />
          <Detail label="Added by" value={employee.invitedBy?.fullName} />
        </Panel>

        {projects ? (
          <Panel title="Projects" plain>
            {projects.length === 0 ? (
              <p className="text-text-secondary">
                {employee.fullName.split(" ")[0]} is not on any project team
                yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {projects.map((project) => (
                  <li
                    key={project.id}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <Link
                      href={`/projects/${project.id}`}
                      className="text-brand-brown font-medium underline-offset-4 hover:underline"
                    >
                      {project.name}
                    </Link>
                    <span className="text-text-secondary text-meta">
                      {project.client.name}
                    </span>
                    <ProjectStatusBadge status={project.status} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        ) : null}

        <Panel title="Direct reports" plain>
          {employee.reports.length === 0 ? (
            <p className="text-text-secondary">
              Nobody reports to {employee.fullName.split(" ")[0]} yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {employee.reports.map((report) => (
                <li
                  key={report.id}
                  className="flex flex-wrap items-center gap-2"
                >
                  <Link
                    href={`/employees/${report.id}`}
                    className="text-brand-brown font-medium underline-offset-4 hover:underline"
                  >
                    {report.fullName}
                  </Link>
                  <span className="text-text-secondary text-meta">
                    {report.jobRole ?? "No role set"}
                  </span>
                  <EmployeeStatusBadge status={report.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {mayEdit ? (
        <div className="border-border bg-surface-muted mt-6 flex items-center justify-between rounded-xl border px-5 py-4">
          <p className="text-text-secondary">
            Score, goals and manager feedback (Phases.md Phase 8).
          </p>
          <Link
            href={`/performance/employee/${employee.id}`}
            className="text-brand-brown font-medium underline-offset-4 hover:underline"
          >
            View performance →
          </Link>
        </div>
      ) : null}
    </>
  );
}

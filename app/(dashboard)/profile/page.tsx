import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, humanizeEnum } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { AvatarUpload } from "@/components/dashboard/avatar-upload";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "My Profile" };

/**
 * Self-service profile: the signed-in user's own personal details and their
 * company's details. Reached from the name/role block at the bottom of the
 * sidebar.
 *
 * Unlike `employees/[id]/page.tsx`, personal fields here are never gated by
 * `canViewPersonalDetails` — that check governs viewing *other* people's
 * records; a person can always see their own data.
 */
export default async function ProfilePage() {
  const actor = await getActor();
  if (!actor) redirect("/login");

  if (actor.accountType === "company") {
    const account = await db.companyAccount.findFirst({
      where: { id: actor.id, companyId: actor.companyId },
      select: {
        fullName: true,
        workEmail: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
        invitedBy: { select: { fullName: true } },
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            currency: true,
            weeklyCapacityHours: true,
            createdAt: true,
          },
        },
      },
    });

    if (!account) redirect("/login");

    return (
      <>
        <PageHeader
          title="My Profile"
          description={`${account.role} · ${account.company.name}`}
        />

        <div className="mb-6">
          <AvatarUpload name={account.fullName} avatarUrl={account.avatarUrl} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Personal">
            <Detail label="Full name" value={account.fullName} />
            <Detail label="Email" value={account.workEmail} />
          </Panel>

          <Panel title="Account">
            <Detail label="Role" value={account.role} />
            <Detail label="Member since" value={formatDate(account.createdAt)} />
            <Detail label="Invited by" value={account.invitedBy?.fullName} />
          </Panel>

          <Panel title="Company">
            <Detail label="Company name" value={account.company.name} />
            <Detail label="Company ID" value={account.company.id} />
            <Detail label="Tenant slug" value={account.company.slug} />
            <Detail label="Currency" value={account.company.currency} />
            <Detail
              label="Company since"
              value={formatDate(account.company.createdAt)}
            />
          </Panel>
        </div>
      </>
    );
  }

  const employee = await db.employee.findFirst({
    where: { id: actor.id, companyId: actor.companyId },
    select: {
      fullName: true,
      companyEmail: true,
      employeeCode: true,
      avatarUrl: true,
      jobRole: true,
      employmentType: true,
      startDate: true,
      status: true,
      joinedAt: true,
      createdAt: true,
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
      invitedBy: { select: { fullName: true } },
      company: {
        select: {
          id: true,
          name: true,
          slug: true,
          currency: true,
          createdAt: true,
        },
      },
    },
  });

  if (!employee) redirect("/login");

  const manager = employee.manager
    ? employee.manager.fullName
    : employee.managerAccount
      ? `${employee.managerAccount.fullName} (${employee.managerAccount.role})`
      : "—";

  return (
    <>
      <PageHeader
        title="My Profile"
        description={
          [employee.jobRole, employee.company.name].filter(Boolean).join(" · ") ||
          employee.company.name
        }
      />

      <div className="mb-6">
        <AvatarUpload name={employee.fullName} avatarUrl={employee.avatarUrl} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Personal">
          <Detail label="Full name" value={employee.fullName} />
          <Detail label="Work email" value={employee.companyEmail} />
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

        <Panel title="Professional">
          <Detail label="Employee ID" value={employee.employeeCode} />
          <Detail label="Department" value={employee.department?.name} />
          <Detail label="Job title" value={employee.jobRole} />
          <Detail
            label="Employment type"
            value={humanizeEnum(employee.employmentType)}
          />
          <Detail label="Start date" value={formatDate(employee.startDate)} />
          <Detail label="Reports to" value={manager} />
          <Detail label="Status" value={employee.status} />
        </Panel>

        <Panel title="Company">
          <Detail label="Company name" value={employee.company.name} />
          <Detail label="Company ID" value={employee.company.id} />
          <Detail label="Tenant slug" value={employee.company.slug} />
          <Detail label="Currency" value={employee.company.currency} />
          <Detail
            label="Company since"
            value={formatDate(employee.company.createdAt)}
          />
        </Panel>
      </div>
    </>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-2">
        <h2 className="text-h3 text-brand-brown font-semibold">{title}</h2>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>
      </CardContent>
    </Card>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-text-secondary text-meta">{label}</dt>
      <dd className="text-foreground break-words">{value || "—"}</dd>
    </div>
  );
}

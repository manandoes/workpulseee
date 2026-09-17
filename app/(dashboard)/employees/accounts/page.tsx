import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import { formatDate } from "@/lib/format";
import {
  canManageCompanyAccounts,
  employeeSectionsFor,
} from "@/lib/permissions";
import { PageHeader } from "@/components/dashboard/page-header";
import { SectionTabs } from "@/components/dashboard/section-tabs";
import { InviteAccountForm } from "@/components/employees/invite-account-form";
import { RoleBadge } from "@/components/employees/status-badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Company accounts — WorkPulse" };

/**
 * The Owner / Admin / Manager / HR logins (Architecture.md section 4).
 *
 * These are a different table from `Employee` with a different login, so they
 * are managed here rather than mixed into the employee directory. Only Owners
 * and Admins can see or change who administers the tenant.
 */
export default async function CompanyAccountsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canManageCompanyAccounts(actor)) redirect("/employees");

  const rows = await db.companyAccount.findMany({
    where: scopedWhere(actor),
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      fullName: true,
      workEmail: true,
      role: true,
      createdAt: true,
      passwordHash: true,
    },
  });

  /**
   * The hash is read only to work out whether the invite has been accepted,
   * and is dropped here so it is never rendered or serialised to the client.
   */
  const accounts = rows.map(({ passwordHash, ...account }) => ({
    ...account,
    pending: passwordHash === null,
  }));

  return (
    <>
      <PageHeader
        title="Company accounts"
        description="The people who administer this workspace. They sign in through Company Login, separately from employees."
      />

      <SectionTabs
        label="Employees sections"
        items={employeeSectionsFor(actor)}
      />

      <Card className="mb-6">
        <CardContent className="flex flex-col gap-5 py-2">
          <div className="flex flex-col gap-1">
            <h2 className="text-h3 text-brand-brown font-semibold">
              Invite a company account
            </h2>
            <p className="text-text-secondary text-meta">
              They receive a link to set their own password. Owner cannot be
              granted — that role is set once, when the company registers.
            </p>
          </div>
          <InviteAccountForm />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-2">
          <h2 className="text-h3 text-brand-brown mb-4 font-semibold">
            {accounts.length === 1
              ? "1 account"
              : `${accounts.length} accounts`}
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-muted">
                <tr className="text-text-secondary text-meta">
                  <th className="rounded-l-lg px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Work email</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Added</th>
                  <th className="rounded-r-lg px-3 py-2 font-medium">
                    Sign-in
                  </th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id} className="border-border border-b">
                    <td className="text-brand-brown px-3 py-3 font-medium">
                      {account.fullName}
                      {account.id === actor.id ? (
                        <span className="text-text-secondary text-meta">
                          {" "}
                          (you)
                        </span>
                      ) : null}
                    </td>
                    <td className="text-text-secondary px-3 py-3">
                      {account.workEmail}
                    </td>
                    <td className="px-3 py-3">
                      <RoleBadge role={account.role} />
                    </td>
                    <td className="text-text-secondary px-3 py-3">
                      {formatDate(account.createdAt)}
                    </td>
                    <td className="px-3 py-3">
                      {/* Design.md section 6: status uses the status palette
                          and is always paired with a text label. */}
                      <span
                        className={
                          account.pending
                            ? "text-warning-text font-medium"
                            : "text-success-text font-medium"
                        }
                      >
                        {account.pending ? "Invite pending" : "Active"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

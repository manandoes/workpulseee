import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Check, Minus } from "lucide-react";
import { getActor } from "@/lib/auth";
import { canManagePermissionGrants } from "@/lib/permissions";
import {
  LEVEL_DEFAULTS,
  LEVEL_LABELS,
  LEVELS,
  POWER_GROUPS,
  POWERS,
} from "@/lib/permission-grants";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { AuthorityPanel } from "@/components/dashboard/authority-panel";

export const metadata: Metadata = { title: "Authority" };

/**
 * The Owner's Authority page (Plan: access levels): every person's powers as
 * switches, their level, and the history of changes — plus, underneath, the
 * level defaults everyone starts from. Owner only (`canManagePermissionGrants`);
 * every route it calls re-checks that.
 */
export default async function AuthorityPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canManagePermissionGrants(actor)) redirect("/settings");

  return (
    <>
      <Link
        href="/settings"
        className="text-text-secondary hover:text-brand-brown mb-4 inline-flex items-center gap-1.5"
      >
        <ArrowLeft aria-hidden className="size-4" strokeWidth={1.5} />
        Back to settings
      </Link>

      <PageHeader
        title="Authority"
        description="Decide what each person can see and do. Everyone starts from their level's defaults; switch any power on or off for one person. Changes apply on their next click."
      />

      <AuthorityPanel />

      <Card className="mt-6">
        <CardContent className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1">
            <h2 className="text-h3 text-brand-brown font-semibold">
              Level defaults
            </h2>
            <p className="text-text-secondary text-meta">
              What each level gets before any switch is changed. Managers also
              always set goals, give feedback and approve requests for their own
              direct reports, and everyone always sees their own record.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left">
              <caption className="sr-only">
                Default powers for each level
              </caption>
              <thead>
                <tr className="border-border border-b">
                  <th
                    scope="col"
                    className="text-text-secondary text-meta py-2 pr-4 font-medium"
                  >
                    Power
                  </th>
                  {LEVELS.map((level) => (
                    <th
                      key={level}
                      scope="col"
                      className="text-text-secondary text-meta px-2 py-2 text-center font-medium"
                    >
                      {LEVEL_LABELS[level]}
                    </th>
                  ))}
                </tr>
              </thead>
              {POWER_GROUPS.map((group) => (
                <tbody key={group} className="divide-border divide-y">
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={LEVELS.length + 1}
                      className="text-foreground pt-4 pb-1 font-semibold"
                    >
                      {group}
                    </th>
                  </tr>
                  {POWERS.filter((power) => power.group === group).map(
                    (power) => (
                      <tr key={power.value}>
                        <th
                          scope="row"
                          className="text-foreground py-2 pr-4 text-sm font-normal"
                        >
                          {power.label}
                        </th>
                        {LEVELS.map((level) => (
                          <td key={level} className="px-2 py-2 text-center">
                            {LEVEL_DEFAULTS[level].includes(power.value) ? (
                              <Check
                                aria-label="Yes"
                                className="text-brand-brown mx-auto size-4"
                                strokeWidth={2}
                              />
                            ) : (
                              <Minus
                                aria-label="No"
                                className="text-text-secondary mx-auto size-4"
                                strokeWidth={1.5}
                              />
                            )}
                          </td>
                        ))}
                      </tr>
                    )
                  )}
                </tbody>
              ))}
            </table>
          </div>
          <p className="text-text-secondary text-meta">
            Owner only, never switchable: this page, billing, branding and email
            delivery.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

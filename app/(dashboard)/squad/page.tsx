import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { loadSquadMembers } from "@/lib/squad-data";
import { PageHeader } from "@/components/dashboard/page-header";
import { Avatar } from "@/components/dashboard/avatar";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Squad — WorkPulse" };

/**
 * Every member of the company, as a directory of cards (Phase 11) — Owner,
 * Admin, Manager, HR and every Employee. Reachable by both account types.
 * Clicking a card opens the detail view, where the depth of what's shown is
 * gated per viewer (`app/(dashboard)/squad/[memberKind]/[memberId]/page.tsx`).
 */
export default async function SquadPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const members = await loadSquadMembers(actor);

  return (
    <>
      <PageHeader
        title="Squad"
        description="Everyone at the company — founders, managers, HR and employees."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((member) => (
          <Link key={`${member.kind}:${member.id}`} href={`/squad/${member.kind}/${member.id}`}>
            <Card className="hover:ring-brand-brown-light transition-colors">
              <CardContent className="flex items-center gap-3 py-2">
                <Avatar name={member.name} avatarUrl={member.avatarUrl} className="size-11" />
                <div className="min-w-0">
                  <p className="text-foreground truncate font-medium">{member.name}</p>
                  <p className="text-text-secondary text-meta truncate">
                    {member.employeeCode ? `${member.employeeCode} · ` : ""}
                    {member.subtitle}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}

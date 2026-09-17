import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { loadConnection } from "@/lib/calendar-data";
import { loadSquadMembers } from "@/lib/squad-data";
import { googleCalendarConfigured } from "@/lib/google-calendar-crypto";
import { PageHeader } from "@/components/dashboard/page-header";
import { CalendarShell } from "@/components/calendar/calendar-shell";

export const metadata: Metadata = { title: "Calendar — WorkPulse" };

/**
 * Calendar (Plan.md Phase 17). Reachable by both account types, the same as
 * Squad/Chat. Auth and the initial server-known state (connection, squad
 * directory) are resolved here; everything live (the week's meetings,
 * availability) is fetched client-side by `CalendarShell`, mirroring
 * `/chat`'s split rather than `/squad`'s fully server-rendered page.
 */
export default async function CalendarPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const [connection, members] = await Promise.all([
    loadConnection(actor),
    loadSquadMembers(actor),
  ]);

  return (
    <>
      <PageHeader
        title="Calendar"
        description="See your own schedule, preview a colleague's busy times, and book meetings that live in WorkPulse."
      />
      <CalendarShell
        actor={{
          kind: actor.accountType === "employee" ? "employee" : "account",
          id: actor.id,
        }}
        connection={
          connection
            ? { googleEmail: connection.googleEmail }
            : null
        }
        googleConfigured={googleCalendarConfigured()}
        members={members.map((member) => ({
          kind: member.kind,
          id: member.id,
          name: member.name,
        }))}
      />
    </>
  );
}

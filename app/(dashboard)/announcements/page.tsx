import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { getActor } from "@/lib/auth";
import { canManageAnnouncements } from "@/lib/permissions";
import { loadAnnouncementsPage } from "@/lib/announcement-data";
import { paginationSchema } from "@/lib/pagination";
import { EmptyState, PageHeader } from "@/components/dashboard/page-header";
import { Pagination } from "@/components/dashboard/pagination";
import { AnnouncementCard } from "@/components/announcements/announcement-card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Announcements — WorkPulse" };

/**
 * The company's announcement feed (Plan: top bar rework) — readable by
 * everyone signed in; posting is gated to company account roles
 * (`canManageAnnouncements`).
 */
export default async function AnnouncementsPage({
  searchParams,
}: PageProps<"/announcements">) {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const query = await searchParams;
  const { page } = paginationSchema.parse(query);
  const { announcements, ...meta } = await loadAnnouncementsPage(actor, page);
  const canCreate = canManageAnnouncements(actor);

  return (
    <>
      <PageHeader
        title="Announcements"
        description="Company-wide updates, with the occasional poll for a quick read on the room."
        action={
          canCreate ? (
            <Button asChild>
              <Link href="/announcements/new">
                <Megaphone aria-hidden />
                New announcement
              </Link>
            </Button>
          ) : undefined
        }
      />

      {announcements.length === 0 ? (
        <EmptyState
          title="No announcements yet"
          description={
            canCreate
              ? "Post the first one — an update, a heads-up, or a quick poll."
              : "Nothing has been posted yet. Check back later."
          }
          action={
            canCreate ? (
              <Button asChild>
                <Link href="/announcements/new">Post an announcement</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {announcements.map((announcement) => (
            <AnnouncementCard key={announcement.id} announcement={announcement} />
          ))}
          <Pagination basePath="/announcements" query={query} meta={meta} />
        </div>
      )}
    </>
  );
}

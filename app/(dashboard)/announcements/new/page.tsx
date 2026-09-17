import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { canManageAnnouncements } from "@/lib/permissions";
import { PageHeader } from "@/components/dashboard/page-header";
import { AnnouncementForm } from "@/components/announcements/announcement-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "New announcement — WorkPulse" };

export default async function NewAnnouncementPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canManageAnnouncements(actor)) redirect("/announcements");

  return (
    <>
      <PageHeader
        title="New announcement"
        description="Everyone in the company will be notified. Add a poll if you want a quick read on the room."
      />

      <Card>
        <CardContent className="py-2">
          <AnnouncementForm />
        </CardContent>
      </Card>
    </>
  );
}

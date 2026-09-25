import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import {
  loadChannelSettings,
  loadNotificationsPage,
  unreadNotificationCount,
} from "@/lib/notification-data";
import { paginationSchema } from "@/lib/pagination";
import { EmptyState, PageHeader } from "@/components/dashboard/page-header";
import { Pagination } from "@/components/dashboard/pagination";
import { MarkAllReadButton } from "@/components/dashboard/mark-all-read-button";
import { NotificationRow } from "@/components/dashboard/notification-row";
import { Card, CardContent } from "@/components/ui/card";
import { NotificationSettingsForm } from "@/components/dashboard/notification-settings-form";

export const metadata: Metadata = {
  title: "Notifications",
};

/**
 * The full notification history (Phases.md Phase 12 — notification
 * refinement), reachable for both account types like the bell already is.
 * The bell's own dropdown stays the last-20 unread-first glance; this is the
 * paginated record of everything.
 */
export default async function NotificationsPage({
  searchParams,
}: PageProps<"/notifications">) {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const query = await searchParams;
  const { page: requestedPage } = paginationSchema.parse(query);

  const [{ notifications, ...meta }, unreadCount, channelSettings] =
    await Promise.all([
      loadNotificationsPage(actor, requestedPage),
      unreadNotificationCount(actor),
      loadChannelSettings(actor),
    ]);

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Everything you've been notified about, newest first."
        action={unreadCount > 0 ? <MarkAllReadButton /> : undefined}
      />

      {/*
        Phase 13 — the channels this person receives on. Kept on this page
        rather than /settings because both account types can already reach it,
        and an employee has no access to /settings at all.
      */}
      <Card>
        <CardContent className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1">
            <h2 className="text-h3 text-brand-brown font-semibold">
              How you are notified
            </h2>
            <p className="text-text-secondary text-meta">
              The bell always keeps a copy. These are the channels a
              notification also goes out on.
            </p>
          </div>
          <NotificationSettingsForm settings={channelSettings} />
        </CardContent>
      </Card>

      {notifications.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          description="Notifications about your tasks, deadlines and requests will show up here."
        />
      ) : (
        <>
          <Card size="sm">
            <ul className="divide-border divide-y">
              {notifications.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={{
                    id: notification.id,
                    type: notification.type,
                    message: notification.message,
                    link: notification.link,
                    readAt: notification.readAt?.toISOString() ?? null,
                    createdAt: notification.createdAt.toISOString(),
                  }}
                />
              ))}
            </ul>
          </Card>
          <Pagination basePath="/notifications" query={query} meta={meta} />
        </>
      )}
    </>
  );
}

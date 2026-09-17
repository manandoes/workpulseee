import { formatDateTime } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { PollVoting } from "@/components/announcements/poll-voting";
import type { LoadedAnnouncement } from "@/lib/announcement-data";

export function AnnouncementCard({
  announcement,
}: {
  announcement: LoadedAnnouncement;
}) {
  return (
    <Card id={announcement.id}>
      <CardContent className="flex flex-col gap-3 py-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-h3 text-brand-brown font-semibold">
            {announcement.title}
          </h2>
          <p className="text-text-secondary text-meta">
            {announcement.authorName} ·{" "}
            {formatDateTime(announcement.createdAt)}
          </p>
        </div>

        <p className="text-foreground whitespace-pre-line">
          {announcement.body}
        </p>

        {announcement.poll ? (
          <PollVoting
            announcementId={announcement.id}
            options={announcement.poll.options}
            totalVotes={announcement.poll.totalVotes}
            ownOptionId={announcement.poll.ownOptionId}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

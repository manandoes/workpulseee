"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/page-header";
import { formatDateTime } from "@/lib/format";
import { ConnectGoogleCard } from "@/components/calendar/connect-google-card";
import { ProposeMeetingForm } from "@/components/calendar/propose-meeting-form";

export type CalendarPerson = { kind: "employee" | "account"; id: string; name: string };

type MeetingParticipant = { kind: "employee" | "account"; id: string; name: string };

type Meeting = {
  id: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  location: string | null;
  status: "Scheduled" | "Cancelled";
  organizer: MeetingParticipant | null;
  participants: MeetingParticipant[];
};

type BusyInterval = { start: string; end: string };

const POLL_MS = 30_000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function weekRange(anchor: Date) {
  const day = anchor.getUTCDay();
  // Monday-start week, matching this codebase's date-only-in-UTC convention.
  const diffToMonday = (day + 6) % 7;
  const start = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate() - diffToMonday)
  );
  const end = new Date(start.getTime() + WEEK_MS);
  return { start, end };
}

export function CalendarShell({
  actor,
  connection,
  googleConfigured,
  members,
}: {
  actor: { kind: "employee" | "account"; id: string };
  connection: { googleEmail: string } | null;
  googleConfigured: boolean;
  members: CalendarPerson[];
}) {
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const { start, end } = useMemo(() => weekRange(weekAnchor), [weekAnchor]);

  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [selectedMember, setSelectedMember] = useState<string>("");
  const [busy, setBusy] = useState<BusyInterval[] | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const response = await fetch(
        `/api/meetings?from=${start.toISOString()}&to=${end.toISOString()}`
      );
      if (!response.ok || cancelled) return;
      const body = await response.json();
      if (!cancelled) setMeetings(body.meetings);
    }

    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [start, end]);

  useEffect(() => {
    if (!selectedMember) return;

    const [kind, id] = selectedMember.split(":");
    let cancelled = false;

    fetch(
      `/api/calendar/availability?kind=${kind}&id=${id}&from=${start.toISOString()}&to=${end.toISOString()}`
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (cancelled || !body) return;
        setBusy(body.self ? body.meetings.map((m: Meeting) => ({ start: m.startAt, end: m.endAt })) : body.busy);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedMember, start, end]);

  async function cancelMeeting(id: string) {
    const response = await fetch(`/api/meetings/${id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Could not cancel that meeting.");
      return;
    }
    toast.success("Meeting cancelled");
    setMeetings((current) =>
      current?.map((m) => (m.id === id ? { ...m, status: "Cancelled" } : m)) ?? null
    );
  }

  const upcoming = meetings?.filter((m) => m.status === "Scheduled") ?? [];

  return (
    <div className="flex flex-col gap-6">
      <ConnectGoogleCard connection={connection} googleConfigured={googleConfigured} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setWeekAnchor(new Date(weekAnchor.getTime() - WEEK_MS))}
          >
            ← Previous week
          </Button>
          <span className="text-text-secondary text-meta">
            {formatDateTime(start)} – {formatDateTime(end)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setWeekAnchor(new Date(weekAnchor.getTime() + WEEK_MS))}
          >
            Next week →
          </Button>
        </div>
        <Button type="button" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Close" : "Propose a meeting"}
        </Button>
      </div>

      {showForm ? (
        <ProposeMeetingForm
          members={members.filter((m) => !(m.kind === actor.kind && m.id === actor.id))}
          onDone={() => setShowForm(false)}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-[1fr_18rem]">
        <div className="flex flex-col gap-3">
          {meetings === null ? (
            <p className="text-text-secondary">Loading…</p>
          ) : upcoming.length === 0 ? (
            <EmptyState
              title="No meetings this week"
              description="Meetings you organize or are invited to will show up here."
            />
          ) : (
            upcoming.map((meeting) => (
              <Card key={meeting.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 py-2">
                  <div>
                    <p className="text-foreground font-medium">{meeting.title}</p>
                    <p className="text-text-secondary text-meta">
                      {formatDateTime(meeting.startAt)} – {formatDateTime(meeting.endAt)}
                    </p>
                    {meeting.location ? (
                      <p className="text-text-secondary text-meta">{meeting.location}</p>
                    ) : null}
                    <p className="text-text-secondary text-meta">
                      With {meeting.participants.map((p) => p.name).join(", ")}
                    </p>
                  </div>
                  {meeting.organizer?.kind === actor.kind && meeting.organizer.id === actor.id ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => cancelMeeting(meeting.id)}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Card>
          <CardContent className="flex flex-col gap-3 py-2">
            <p className="text-foreground font-medium">Preview a colleague</p>
            <select
              className="border-input bg-surface text-foreground h-9 w-full rounded-lg border px-3"
              value={selectedMember}
              onChange={(event) => {
                setSelectedMember(event.target.value);
                setBusy(null);
              }}
            >
              <option value="">Choose someone…</option>
              {members.map((member) => (
                <option key={`${member.kind}:${member.id}`} value={`${member.kind}:${member.id}`}>
                  {member.name}
                </option>
              ))}
            </select>
            {selectedMember ? (
              busy === null ? (
                <p className="text-text-secondary text-meta">Loading…</p>
              ) : busy.length === 0 ? (
                <p className="text-text-secondary text-meta">
                  No busy times found this week.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {busy.map((interval, index) => (
                    <li key={index} className="text-text-secondary text-meta">
                      Busy {formatDateTime(interval.start)} – {formatDateTime(interval.end)}
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

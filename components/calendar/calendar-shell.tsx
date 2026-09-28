"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "cn";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateTime, useTimeZone } from "@/components/ui/date-time";
import { ConnectGoogleCard } from "@/components/calendar/connect-google-card";
import { ProposeMeetingForm } from "@/components/calendar/propose-meeting-form";
import {
  DayAgenda,
  MonthView,
  WeekView,
  type Entry,
  type Person,
  type Viewer,
} from "@/components/calendar/calendar-views";
import {
  addDays,
  bucketByDay,
  shiftAnchor,
  visibleDays,
  type CalendarView,
} from "@/lib/calendar-grid";
import { dayKeyInZone, instantForLocalTime } from "@/lib/timezone";

export type CalendarPerson = Person;

/** `/api/calendar/items` as it arrives over the wire — dates are strings. */
type ItemsResponse = {
  meetings: {
    id: string;
    title: string;
    description: string | null;
    startAt: string;
    endAt: string;
    location: string | null;
    status: "Scheduled" | "Cancelled";
    organizer: Person | null;
    participants: Person[];
  }[];
  tasks: {
    id: string;
    title: string;
    status: Extract<Entry, { kind: "task" }>["status"];
    priority: Extract<Entry, { kind: "task" }>["priority"];
    dueDate: string;
    assigneeName: string | null;
    projectName: string | null;
  }[];
  googleEvents: {
    id: string;
    title: string;
    start: string;
    end: string;
    location: string | null;
    allDay: boolean;
  }[];
  timeOff: {
    id: string;
    type: "Leave" | "WFH";
    status: "Pending" | "Approved" | "Rejected";
    dayPart: "FullDay" | "FirstHalf" | "SecondHalf" | null;
    startDate: string;
    endDate: string;
    employeeName: string;
  }[];
};

type BusyInterval = { start: string; end: string };

const POLL_MS = 30_000;

function toEntries(body: ItemsResponse): Entry[] {
  return [
    ...body.timeOff.map((row) => ({
      ...row,
      kind: "timeOff" as const,
      startDate: new Date(row.startDate),
      endDate: new Date(row.endDate),
    })),
    ...body.tasks.map((row) => ({
      ...row,
      kind: "task" as const,
      dueDate: new Date(row.dueDate),
    })),
    ...body.googleEvents.map((row) => ({
      ...row,
      kind: "event" as const,
      start: new Date(row.start),
      end: new Date(row.end),
    })),
    ...body.meetings
      .filter((row) => row.status === "Scheduled")
      .map(({ startAt, endAt, ...row }) => ({
        ...row,
        kind: "meeting" as const,
        start: new Date(startAt),
        end: new Date(endAt),
      })),
  ];
}

const LEGEND = [
  { label: "Meeting", className: "bg-brand-yellow" },
  { label: "Google Calendar", className: "bg-info" },
  { label: "Task due", className: "bg-brand-brown-light" },
  { label: "Task overdue", className: "bg-danger" },
  { label: "Task done", className: "bg-success" },
  { label: "Leave / WFH", className: "bg-warning" },
];

/**
 * The calendar page (Plan.md Phase 17), laid out the way Google Calendar is:
 * a month grid or an hour-by-hour week, carrying everything with a date on it
 * for the signed-in person — meetings, tasks by due date, their own Google
 * events, and leave/WFH — with the chosen day's full agenda beside it.
 *
 * Days are the viewer's (`useTimeZone`), so the grid and `<DateTime>` agree.
 */
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
  const timeZone = useTimeZone();
  const [now, setNow] = useState(() => new Date());
  const today = dayKeyInZone(now, timeZone);

  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState(today);
  const [selectedDay, setSelectedDay] = useState<string>(today);

  const days = useMemo(() => visibleDays(view, anchor), [view, anchor]);
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  const range = useMemo(
    () => ({
      from: instantForLocalTime(firstDay, 0, timeZone),
      to: instantForLocalTime(addDays(lastDay, 1), 0, timeZone),
    }),
    [firstDay, lastDay, timeZone]
  );

  // Tagged with the range they were fetched for, so moving to another
  // month reads as loading rather than as that month being empty.
  const rangeKey = `${range.from.toISOString()}/${range.to.toISOString()}`;
  const [loaded, setLoaded] = useState<{ rangeKey: string; entries: Entry[] } | null>(null);
  const entries = loaded?.entries ?? null;
  const loading = loaded?.rangeKey !== rangeKey;
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedMember, setSelectedMember] = useState<string>("");
  const [busy, setBusy] = useState<BusyInterval[] | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const response = await fetch(
        `/api/calendar/items?from=${range.from.toISOString()}&to=${range.to.toISOString()}`
      );
      if (!response.ok || cancelled) return;
      const body: ItemsResponse = await response.json();
      if (cancelled) return;
      setLoaded({ rangeKey, entries: toEntries(body) });
      setNow(new Date());
    }

    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [range, rangeKey, reloadKey]);

  useEffect(() => {
    if (!selectedMember) return;

    const [kind, id] = selectedMember.split(":");
    let cancelled = false;

    fetch(
      `/api/calendar/availability?kind=${kind}&id=${id}&from=${range.from.toISOString()}&to=${range.to.toISOString()}`
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (cancelled || !body) return;
        setBusy(
          body.self
            ? body.meetings.map((m: { startAt: string; endAt: string }) => ({
                start: m.startAt,
                end: m.endAt,
              }))
            : body.busy
        );
      });

    return () => {
      cancelled = true;
    };
  }, [selectedMember, range]);

  const buckets = useMemo(
    () => bucketByDay(days, entries ?? [], timeZone),
    [days, entries, timeZone]
  );

  async function cancelMeeting(id: string) {
    const response = await fetch(`/api/meetings/${id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Could not cancel that meeting.");
      return;
    }
    toast.success("Meeting cancelled");
    setLoaded((current) =>
      current && {
        ...current,
        entries: current.entries.filter(
          (entry) => !(entry.kind === "meeting" && entry.id === id)
        ),
      }
    );
  }

  function navigate(direction: -1 | 1) {
    const next = shiftAnchor(view, anchor, direction);
    setAnchor(next);
    setSelectedDay(view === "week" ? addDays(selectedDay, 7 * direction) : next);
  }

  function goToday() {
    setAnchor(today);
    setSelectedDay(today);
  }

  function selectDay(day: string) {
    setSelectedDay(day);
    // Picking a leading/trailing day in month view moves to its month.
    if (view === "month" && day.slice(0, 7) !== anchor.slice(0, 7)) setAnchor(day);
  }

  const title = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${view === "week" ? firstDay : anchor}T00:00:00Z`));

  const viewer: Viewer = { kind: actor.kind, id: actor.id, timeZone, now };

  return (
    <div className="flex flex-col gap-6">
      <ConnectGoogleCard connection={connection} googleConfigured={googleConfigured} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={view === "week" ? "Previous week" : "Previous month"}
            onClick={() => navigate(-1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={view === "week" ? "Next week" : "Next month"}
            onClick={() => navigate(1)}
          >
            <ChevronRight />
          </Button>
          <h2 className="text-h2 text-brand-brown font-semibold" aria-live="polite">
            {title}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <div role="group" aria-label="Calendar view" className="border-brand-brown-light flex rounded-lg border p-0.5">
            {(["month", "week"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => {
                  setView(option);
                  setAnchor(selectedDay);
                }}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium capitalize",
                  view === option
                    ? "bg-brand-yellow text-brand-brown"
                    : "text-text-secondary hover:text-brand-brown"
                )}
              >
                {option}
              </button>
            ))}
          </div>
          <Button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close" : "Propose a meeting"}
          </Button>
        </div>
      </div>

      {showForm ? (
        <ProposeMeetingForm
          members={members.filter((m) => !(m.kind === actor.kind && m.id === actor.id))}
          onDone={() => {
            setShowForm(false);
            setReloadKey((key) => key + 1);
          }}
        />
      ) : null}

      <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Legend">
        {LEGEND.map((item) => (
          <li key={item.label} className="text-text-secondary text-meta flex items-center gap-1.5">
            <span aria-hidden className={cn("size-2.5 rounded-sm", item.className)} />
            {item.label}
          </li>
        ))}
      </ul>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="relative min-w-0">
          {view === "month" ? (
            <MonthView
              days={days}
              buckets={buckets}
              anchor={anchor}
              today={today}
              selectedDay={selectedDay}
              viewer={viewer}
              onSelectDay={selectDay}
            />
          ) : (
            <WeekView
              days={days}
              buckets={buckets}
              today={today}
              selectedDay={selectedDay}
              viewer={viewer}
              onSelectDay={selectDay}
            />
          )}
          {loading ? (
            <p className="text-text-secondary text-meta bg-surface absolute top-2 right-2 rounded px-2 py-1 shadow-sm">
              Loading…
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="py-2">
              <DayAgenda
                day={selectedDay}
                bucket={buckets.get(selectedDay) ?? { allDay: [], timed: [] }}
                viewer={viewer}
                onCancelMeeting={cancelMeeting}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3 py-2">
              <p className="text-foreground font-medium">Preview a colleague</p>
              <select
                aria-label="Colleague to preview"
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
                    No busy times found in this {view}.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {busy.map((interval, index) => (
                      <li key={index} className="text-text-secondary text-meta">
                        Busy <DateTime value={interval.start} /> –{" "}
                        <DateTime value={interval.end} />
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

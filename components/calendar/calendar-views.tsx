"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Circle,
  CircleAlert,
  CircleCheck,
  House,
  TreePalm,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { DateTime } from "@/components/ui/date-time";
import { formatDate, formatDayKey, humanizeEnum } from "@/lib/format";
import { isOverdue } from "@/lib/tasks";
import { formatTimeInZone, instantForLocalTime } from "@/lib/timezone";
import {
  layoutOverlaps,
  type DayBucket,
  type GridEvent,
  type GridMeeting,
  type GridTask,
  type GridTimeOff,
} from "@/lib/calendar-grid";
import type { TaskPriority, TaskStatus } from "@/lib/generated/prisma/enums";

// ---------------------------------------------------------------------------
// Entries — the grid's items with what the chips and agenda need to show
// ---------------------------------------------------------------------------

export type Person = { kind: "employee" | "account"; id: string; name: string };

export type MeetingEntry = GridMeeting & {
  description: string | null;
  location: string | null;
  status: "Scheduled" | "Cancelled";
  organizer: Person | null;
  participants: Person[];
};

export type EventEntry = GridEvent & { location: string | null };

export type TaskEntry = GridTask & {
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeName: string | null;
  projectName: string | null;
};

export type TimeOffEntry = GridTimeOff & {
  type: "Leave" | "WFH";
  status: "Pending" | "Approved" | "Rejected";
  dayPart: "FullDay" | "FirstHalf" | "SecondHalf" | null;
  employeeName: string;
};

export type Entry = MeetingEntry | EventEntry | TaskEntry | TimeOffEntry;

export type Viewer = {
  kind: "employee" | "account";
  id: string;
  timeZone: string;
  now: Date;
};

type EntryLook = {
  icon: LucideIcon;
  /** What the icon means, for screen readers — color never carries it alone. */
  kindLabel: string;
  title: string;
  className: string;
  /** A finished task: its title is struck through. */
  done?: boolean;
};

function entryLook(entry: Entry, viewer: Viewer): EntryLook {
  switch (entry.kind) {
    case "meeting":
      return {
        icon: Users,
        kindLabel: "Meeting",
        title: entry.title,
        className: "bg-brand-yellow-light text-brand-brown border-brand-yellow",
      };
    case "event":
      return {
        icon: CalendarDays,
        kindLabel: "Google Calendar event",
        title: entry.title,
        className: "bg-info/10 text-info-text border-info",
      };
    case "task": {
      if (entry.status === "Done") {
        return {
          icon: CircleCheck,
          kindLabel: "Task done",
          title: entry.title,
          className: "bg-success/10 text-success-text border-success",
          done: true,
        };
      }
      if (isOverdue(entry, viewer.now)) {
        return {
          icon: CircleAlert,
          kindLabel: "Task overdue",
          title: entry.title,
          className: "bg-danger/10 text-danger-text border-danger",
        };
      }
      return {
        icon: Circle,
        kindLabel: "Task due",
        title: entry.title,
        className: "bg-surface-muted text-foreground border-brand-brown-light",
      };
    }
    case "timeOff": {
      const who = viewer.kind === "account" ? `${entry.employeeName} · ` : "";
      const pending = entry.status === "Pending" ? " (pending)" : "";
      return entry.type === "Leave"
        ? {
            icon: TreePalm,
            kindLabel: "Leave",
            title: `${who}Leave${pending}`,
            className: cn(
              "bg-warning/10 text-warning-text border-warning",
              pending && "border-dashed"
            ),
          }
        : {
            icon: House,
            kindLabel: "Work from home",
            title: `${who}WFH${pending}`,
            className: cn(
              "bg-surface-muted text-text-secondary border-brand-brown-light",
              pending && "border-dashed"
            ),
          };
    }
  }
}

function timeLabel(entry: Entry, timeZone: string): string | null {
  if (entry.kind === "meeting" || (entry.kind === "event" && !entry.allDay)) {
    return formatTimeInZone(entry.start, timeZone);
  }
  return null;
}

export const entryKey = (entry: Entry) => `${entry.kind}:${entry.id}`;

/** One compact line in a month cell or the week's all-day strip. */
function EntryChip({
  entry,
  viewer,
  onSelect,
}: {
  entry: Entry;
  viewer: Viewer;
  onSelect: () => void;
}) {
  const look = entryLook(entry, viewer);
  const time = timeLabel(entry, viewer.timeZone);
  const Icon = look.icon;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      title={time ? `${time} ${look.title}` : look.title}
      className={cn(
        "flex w-full min-w-0 items-center gap-1 rounded border-l-2 px-1 py-px text-left text-[11px] leading-4 hover:brightness-95",
        look.className
      )}
    >
      <Icon aria-hidden className="size-3 shrink-0" />
      <span className="sr-only">{look.kindLabel}: </span>
      {time ? <span className="shrink-0 font-medium">{time}</span> : null}
      <span className={cn("truncate", look.done && "line-through")}>{look.title}</span>
    </button>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayNumber(dayKey: string) {
  return Number(dayKey.slice(8, 10));
}

// ---------------------------------------------------------------------------
// Month view
// ---------------------------------------------------------------------------

const MONTH_CELL_LIMIT = 3;

export function MonthView({
  days,
  buckets,
  anchor,
  today,
  selectedDay,
  viewer,
  onSelectDay,
}: {
  days: string[];
  buckets: Map<string, DayBucket<Entry>>;
  anchor: string;
  today: string;
  selectedDay: string | null;
  viewer: Viewer;
  onSelectDay: (day: string) => void;
}) {
  const month = anchor.slice(0, 7);

  return (
    <div className="border-border overflow-hidden rounded-xl border">
      <div className="bg-surface-muted grid grid-cols-7 text-center">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="text-text-secondary text-meta py-1.5 font-medium">
            {weekday}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const bucket = buckets.get(day) ?? { allDay: [], timed: [] };
          const entries = [...bucket.allDay, ...bucket.timed];
          const shown = entries.slice(0, MONTH_CELL_LIMIT);
          const hidden = entries.length - shown.length;
          const inMonth = day.startsWith(month);

          return (
            <div
              key={day}
              role="button"
              tabIndex={0}
              aria-label={`${formatDayKey(day)}, ${entries.length} item${entries.length === 1 ? "" : "s"}`}
              aria-pressed={selectedDay === day}
              onClick={() => onSelectDay(day)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectDay(day);
                }
              }}
              className={cn(
                "border-border flex min-h-16 min-w-0 cursor-pointer flex-col gap-0.5 border-t border-l p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-28 [&:nth-child(7n+1)]:border-l-0",
                !inMonth && "bg-surface-muted/60",
                selectedDay === day && "bg-brand-yellow-light/60"
              )}
            >
              <span
                className={cn(
                  "text-meta mx-auto flex size-6 items-center justify-center rounded-full sm:mx-0",
                  day === today
                    ? "bg-brand-brown font-semibold text-white"
                    : inMonth
                      ? "text-foreground"
                      : "text-text-secondary"
                )}
              >
                {dayNumber(day)}
              </span>

              {/* Phone width: dots only — the chosen day's agenda has the detail. */}
              <div className="flex flex-wrap justify-center gap-0.5 sm:hidden">
                {entries.slice(0, 4).map((entry) => (
                  <span
                    key={entryKey(entry)}
                    aria-hidden
                    className={cn("size-1.5 rounded-full border", entryLook(entry, viewer).className)}
                  />
                ))}
              </div>

              <div className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                {shown.map((entry) => (
                  <EntryChip
                    key={entryKey(entry)}
                    entry={entry}
                    viewer={viewer}
                    onSelect={() => onSelectDay(day)}
                  />
                ))}
                {hidden > 0 ? (
                  <span className="text-text-secondary px-1 text-[11px] font-medium">
                    +{hidden} more
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Week view
// ---------------------------------------------------------------------------

const HOUR_PX = 44;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const SCROLL_TO_HOUR = 8;

export function WeekView({
  days,
  buckets,
  today,
  selectedDay,
  viewer,
  onSelectDay,
}: {
  days: string[];
  buckets: Map<string, DayBucket<Entry>>;
  today: string;
  selectedDay: string | null;
  viewer: Viewer;
  onSelectDay: (day: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: SCROLL_TO_HOUR * HOUR_PX });
  }, []);

  const hourLabel = (hour: number) =>
    hour === 0 ? "" : `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? "AM" : "PM"}`;

  const nowMinutes = (() => {
    const midnight = instantForLocalTime(today, 0, viewer.timeZone);
    return (viewer.now.getTime() - midnight.getTime()) / 60_000;
  })();

  return (
    <div className="border-border overflow-x-auto rounded-xl border">
      <div className="min-w-[44rem]">
        {/* Day headers + all-day strip */}
        <div className="bg-surface-muted grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
          <div />
          {days.map((day, index) => (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDay(day)}
              aria-pressed={selectedDay === day}
              className={cn(
                "border-border flex flex-col items-center gap-0.5 border-l py-1.5",
                selectedDay === day && "bg-brand-yellow-light/60"
              )}
            >
              <span className="text-text-secondary text-meta font-medium">{WEEKDAYS[index]}</span>
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-sm",
                  day === today ? "bg-brand-brown font-semibold text-white" : "text-foreground"
                )}
              >
                {dayNumber(day)}
              </span>
            </button>
          ))}
        </div>
        <div className="border-border grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-t">
          <div className="text-text-secondary flex items-start justify-end pt-1 pr-2 text-[10px]">
            All day
          </div>
          {days.map((day) => (
            <div key={day} className="border-border flex min-h-8 min-w-0 flex-col gap-0.5 border-l p-0.5">
              {(buckets.get(day)?.allDay ?? []).map((entry) => (
                <EntryChip
                  key={entryKey(entry)}
                  entry={entry}
                  viewer={viewer}
                  onSelect={() => onSelectDay(day)}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Hour grid */}
        <div ref={scroller} className="border-border max-h-[32rem] overflow-y-auto border-t">
          <div
            className="relative grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]"
            style={{ height: 24 * HOUR_PX }}
          >
            <div className="relative">
              {HOURS.map((hour) => (
                <span
                  key={hour}
                  className="text-text-secondary absolute right-2 -translate-y-1/2 text-[10px]"
                  style={{ top: hour * HOUR_PX }}
                >
                  {hourLabel(hour)}
                </span>
              ))}
            </div>

            {days.map((day) => {
              const midnight = instantForLocalTime(day, 0, viewer.timeZone).getTime();
              const timed = (buckets.get(day)?.timed ?? []) as (MeetingEntry | EventEntry)[];

              return (
                <div
                  key={day}
                  className="border-border relative border-l"
                  style={{
                    backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${HOUR_PX}px)`,
                  }}
                >
                  {layoutOverlaps(timed).map(({ item, column, columns }) => {
                    const look = entryLook(item, viewer);
                    const top = Math.max(0, (item.start.getTime() - midnight) / 60_000);
                    const bottom = Math.min(24 * 60, (item.end.getTime() - midnight) / 60_000);
                    const height = Math.max(20, ((bottom - top) / 60) * HOUR_PX);

                    return (
                      <button
                        key={entryKey(item)}
                        type="button"
                        onClick={() => onSelectDay(day)}
                        className={cn(
                          "absolute overflow-hidden rounded border-l-2 px-1 py-0.5 text-left text-[11px] leading-4 hover:brightness-95",
                          look.className
                        )}
                        style={{
                          top: (top / 60) * HOUR_PX,
                          height,
                          left: `calc(${(column / columns) * 100}% + 1px)`,
                          width: `calc(${100 / columns}% - 2px)`,
                        }}
                      >
                        <span className="sr-only">{look.kindLabel}: </span>
                        <span className="block truncate font-medium">{look.title}</span>
                        <span className="block truncate">
                          {formatTimeInZone(item.start, viewer.timeZone)} –{" "}
                          {formatTimeInZone(item.end, viewer.timeZone)}
                        </span>
                      </button>
                    );
                  })}

                  {day === today && nowMinutes >= 0 && nowMinutes < 24 * 60 ? (
                    <div
                      aria-hidden
                      className="bg-danger pointer-events-none absolute right-0 left-0 h-0.5"
                      style={{ top: (nowMinutes / 60) * HOUR_PX }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day agenda — full detail for the chosen day
// ---------------------------------------------------------------------------

export function DayAgenda({
  day,
  bucket,
  viewer,
  onCancelMeeting,
}: {
  day: string;
  bucket: DayBucket<Entry>;
  viewer: Viewer;
  onCancelMeeting: (id: string) => void;
}) {
  const entries = [...bucket.allDay, ...bucket.timed];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-foreground font-medium">{formatDayKey(day)}</p>
      {entries.length === 0 ? (
        <p className="text-text-secondary text-meta">Nothing scheduled.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => {
            const look = entryLook(entry, viewer);
            const Icon = look.icon;
            return (
              <li
                key={entryKey(entry)}
                className={cn("flex items-start gap-2 rounded-lg border-l-4 px-3 py-2", look.className)}
              >
                <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                  <span className="text-meta font-medium uppercase opacity-80">{look.kindLabel}</span>
                  <AgendaDetail entry={entry} viewer={viewer} onCancelMeeting={onCancelMeeting} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AgendaDetail({
  entry,
  viewer,
  onCancelMeeting,
}: {
  entry: Entry;
  viewer: Viewer;
  onCancelMeeting: (id: string) => void;
}) {
  switch (entry.kind) {
    case "meeting": {
      const isOrganizer =
        entry.organizer?.kind === viewer.kind && entry.organizer.id === viewer.id;
      return (
        <>
          <span className="text-foreground font-medium">{entry.title}</span>
          <span className="text-text-secondary text-meta">
            <DateTime value={entry.start} /> – <DateTime value={entry.end} />
          </span>
          {entry.location ? (
            <span className="text-text-secondary text-meta">{entry.location}</span>
          ) : null}
          <span className="text-text-secondary text-meta">
            With {entry.participants.map((p) => p.name).join(", ")}
          </span>
          {isOrganizer ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => onCancelMeeting(entry.id)}
            >
              Cancel meeting
            </Button>
          ) : null}
        </>
      );
    }
    case "event":
      return (
        <>
          <span className="text-foreground font-medium">{entry.title}</span>
          <span className="text-text-secondary text-meta">
            {entry.allDay ? (
              "All day"
            ) : (
              <>
                <DateTime value={entry.start} /> – <DateTime value={entry.end} />
              </>
            )}
          </span>
          {entry.location ? (
            <span className="text-text-secondary text-meta">{entry.location}</span>
          ) : null}
        </>
      );
    case "task":
      return (
        <>
          <Link
            href={viewer.kind === "account" ? `/tasks/${entry.id}` : "/my-space/tasks"}
            className={cn(
              "text-foreground font-medium underline-offset-4 hover:underline",
              entry.status === "Done" && "line-through"
            )}
          >
            {entry.title}
          </Link>
          <span className="text-text-secondary text-meta">
            {humanizeEnum(entry.status)} · {entry.priority} priority
            {entry.projectName ? ` · ${entry.projectName}` : ""}
          </span>
          {viewer.kind === "account" ? (
            <span className="text-text-secondary text-meta">
              {entry.assigneeName ? `Allotted to ${entry.assigneeName}` : "Unassigned"}
            </span>
          ) : null}
        </>
      );
    case "timeOff":
      return (
        <>
          <span className="text-foreground font-medium">
            {viewer.kind === "account" ? `${entry.employeeName} — ` : ""}
            {entry.type === "Leave" ? "Leave" : "Work from home"}
          </span>
          <span className="text-text-secondary text-meta">
            {formatDate(entry.startDate)}
            {entry.endDate.getTime() !== entry.startDate.getTime()
              ? ` – ${formatDate(entry.endDate)}`
              : ""}
            {entry.dayPart && entry.dayPart !== "FullDay" ? ` · ${humanizeEnum(entry.dayPart)}` : ""}
            {" · "}
            {entry.status}
          </span>
        </>
      );
  }
}

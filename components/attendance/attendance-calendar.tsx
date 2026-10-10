"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileUpload, type UploadedFile } from "@/components/ui/file-upload";
import { FormField, TextareaField } from "@/components/forms/fields";
import {
  buildAttendanceDays,
  type AttendanceDaysBreakdown,
} from "@/lib/attendance-days";
import type { MyWorkCalendarData } from "@/lib/my-work-data";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const CLASSIFICATION_LABEL: Record<"full" | "half" | "leave" | "wfh", string> = {
  full: "Present",
  half: "Half day",
  leave: "Leave",
  wfh: "WFH",
};

/**
 * A month-grid attendance calendar for the My Work page.
 *
 * Each cell shows:
 *  - A colour dot for the day's classification (green=Present, blue=WFH,
 *    orange=Half day, red=Leave, grey=unmarked).
 *  - Tiny task stats (✓done · ⏰due) when there are any for that day.
 *
 * Clicking a day opens a bottom sheet with quick actions to request Leave
 * or WFH on that date (navigates to the existing new-request form with the
 * date and type pre-filled via URL params).
 */
export function AttendanceCalendar({
  data,
  todayKey,
}: {
  data: MyWorkCalendarData;
  todayKey: string;
}) {
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date(data.todayKey + "T00:00:00Z");
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Build the grid for the current month.
  const monthStart = new Date(Date.UTC(currentMonth.year, currentMonth.month, 1));
  const firstDayOfWeek = monthStart.getUTCDay();
  const daysInMonth = new Date(
    Date.UTC(currentMonth.year, currentMonth.month + 1, 0)
  ).getUTCDate();

  const prevMonth = currentMonth.month === 0 ? 11 : currentMonth.month - 1;
  const prevYear = currentMonth.month === 0 ? currentMonth.year - 1 : currentMonth.year;
  const prevMonthDays = new Date(Date.UTC(prevYear, prevMonth + 1, 0)).getUTCDate();

  const nextMonth = currentMonth.month === 11 ? 0 : currentMonth.month + 1;
  const nextYear = currentMonth.month === 11 ? currentMonth.year + 1 : currentMonth.year;

  const totalCells = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;
  const cells: { dayKey: string; isCurrentMonth: boolean }[] = [];

  for (let i = 0; i < firstDayOfWeek; i++) {
    const day = prevMonthDays - firstDayOfWeek + i + 1;
    const key = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ dayKey: key, isCurrentMonth: false });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ dayKey: key, isCurrentMonth: true });
  }

  const remaining = totalCells - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const key = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ dayKey: key, isCurrentMonth: false });
  }

  // Build the attendance breakdown for display.
  const currentMonthCells = cells.filter((c) => c.isCurrentMonth);
  const fromKey = currentMonthCells[0]?.dayKey ?? "";
  const toKey = currentMonthCells[currentMonthCells.length - 1]?.dayKey ?? "";

  const breakdown = buildAttendanceDays(
    {
      sessions: data.sessions,
      breaks: data.breaks,
      leaveWindows: data.leaveWindows,
      fromDayKey: fromKey || null,
      toDayKey: toKey || null,
      timeZone: data.timeZone,
    },
    new Date()
  );

  const dayMap = new Map(breakdown.days.map((d) => [d.dayKey, d]));

  function goToPrevMonth() {
    setCurrentMonth((prev) =>
      prev.month === 0
        ? { year: prev.year - 1, month: 11 }
        : { year: prev.year, month: prev.month - 1 }
    );
  }

  function goToNextMonth() {
    setCurrentMonth((prev) =>
      prev.month === 11
        ? { year: prev.year + 1, month: 0 }
        : { year: prev.year, month: prev.month + 1 }
    );
  }

  function handleDayClick(dayKey: string) {
    setSelectedDate(dayKey);
  }

  function handleCloseSheet() {
    setSelectedDate(null);
  }

  async function submitRequest(type: "Leave" | "WFH", reason: string, files: UploadedFile[]): Promise<boolean> {
    if (!selectedDate) return false;

    const response = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        subject: `${type} request for ${formatDayKeyFriendly(selectedDate)}`,
        description: reason,
        startDate: selectedDate,
        endDate: selectedDate,
        attachmentFileIds: files.map((f) => f.id),
      }),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(body?.error ?? "Could not submit request.");
      return false;
    }

    toast.success(`${type} request submitted`);
    router.refresh();
    return true;
  }

  function handleRequestLeave(reason: string, files: UploadedFile[]) {
    return submitRequest("Leave", reason, files);
  }

  function handleRequestWFH(reason: string, files: UploadedFile[]) {
    return submitRequest("WFH", reason, files);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-h4 text-brand-brown font-semibold">
          {MONTH_NAMES[currentMonth.month]} {currentMonth.year}
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goToPrevMonth}
            className="rounded-lg p-1.5 text-text-secondary hover:bg-surface-muted hover:text-foreground transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() =>
              setCurrentMonth({
                year: new Date(data.todayKey + "T00:00:00Z").getUTCFullYear(),
                month: new Date(data.todayKey + "T00:00:00Z").getUTCMonth(),
              })
            }
            className="rounded-lg px-2.5 py-1.5 text-meta text-sm text-foreground hover:bg-surface-muted transition-colors"
          >
            Today
          </button>
          <button
            type="button"
            onClick={goToNextMonth}
            className="rounded-lg p-1.5 text-text-secondary hover:bg-surface-muted hover:text-foreground transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-px rounded-t-xl overflow-hidden border border-border border-b-0">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="text-center text-meta text-xs font-medium text-text-secondary py-2 bg-surface-muted/40"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px border border-border rounded-b-xl overflow-hidden">
        {cells.map(({ dayKey, isCurrentMonth }) => {
          const dayInfo = dayMap.get(dayKey);
          const classification = dayInfo?.classification;
          const stats = data.dayTasks.get(dayKey) ?? { doneCount: 0, dueCount: 0 };
          const isToday = dayKey === todayKey;
          const isSelected = dayKey === selectedDate;

          const dotColor = (() => {
            switch (classification) {
              case "full": return "bg-success";
              case "wfh": return "bg-info";
              case "half": return "bg-warning";
              case "leave": return "bg-danger";
              default: return "bg-border";
            }
          })();

          return (
            <button
              key={dayKey}
              type="button"
              onClick={() => handleDayClick(dayKey)}
              disabled={!isCurrentMonth}
              className={[
                "relative flex flex-col items-center justify-start min-h-17 px-1 py-1.5 transition-colors",
                isCurrentMonth
                  ? "bg-background hover:bg-accent/40 cursor-pointer"
                  : "bg-surface-muted/20 cursor-default",
                isSelected ? "ring-2 ring-inset ring-primary" : "",
              ].filter(Boolean).join(" ")}
            >
              {/* Day number */}
              <span
                className={[
                  "text-xs font-medium leading-none mb-0.5",
                  isToday
                    ? "rounded-full bg-primary text-primary-foreground w-5 h-5 flex items-center justify-center"
                    : "text-foreground",
                  !isCurrentMonth && "text-text-secondary/40",
                ].filter(Boolean).join(" ")}
              >
                {parseInt(dayKey.split("-")[2], 10)}
              </span>

              {/* Classification dot */}
              {classification ? (
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${dotColor} mt-0.5`}
                  title={CLASSIFICATION_LABEL[classification]}
                />
              ) : null}

              {/* Task stats */}
              {isCurrentMonth && (stats.doneCount > 0 || stats.dueCount > 0) && (
                <div className="mt-auto flex items-center gap-1">
                  {stats.doneCount > 0 && (
                    <span className="text-[9px] text-success leading-none" title="Tasks completed">
                      ✓{stats.doneCount}
                    </span>
                  )}
                  {stats.dueCount > 0 && (
                    <span className="text-[9px] text-warning leading-none" title="Tasks due">
                      ⏰{stats.dueCount}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-meta text-xs">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-success" />
          Present
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-info" />
          WFH
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-warning" />
          Half day
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-danger" />
          Leave
        </span>
        <span className="flex items-center gap-1 text-text-secondary">
          <span className="inline-block h-2 w-2 rounded-full bg-border" />
          Unmarked
        </span>
        <span className="ml-auto flex items-center gap-2 text-text-secondary">
          <span>
            <span className="text-success font-medium">✓</span> done
          </span>
          <span>
            <span className="text-warning font-medium">⏰</span> due
          </span>
        </span>
      </div>

      {/* Day action sheet */}
      {selectedDate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pointer-events-none">
          <div
            className="absolute inset-0 bg-black/30 pointer-events-auto"
            onClick={handleCloseSheet}
          />
          <DayActionSheet
            dayKey={selectedDate}
            classification={dayMap.get(selectedDate)?.classification}
            stats={data.dayTasks.get(selectedDate) ?? { doneCount: 0, dueCount: 0 }}
            onClose={handleCloseSheet}
            onRequestLeave={handleRequestLeave}
            onRequestWFH={handleRequestWFH}
          />
        </div>
      )}
    </div>
  );
}

function DayActionSheet({
  dayKey,
  classification,
  stats,
  onClose,
  onRequestLeave,
  onRequestWFH,
}: {
  dayKey: string;
  classification?: "full" | "half" | "leave" | "wfh";
  stats: { doneCount: number; dueCount: number };
  onClose: () => void;
  onRequestLeave: (reason: string, files: UploadedFile[]) => Promise<boolean>;
  onRequestWFH: (reason: string, files: UploadedFile[]) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<"choose" | "leave" | "wfh">("choose");
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(type: "Leave" | "WFH") {
    if (!reason.trim()) {
      toast.error("Please enter a reason.");
      return;
    }
    setBusy(true);
    const handler = type === "Leave" ? onRequestLeave : onRequestWFH;
    const ok = await handler(reason, files);
    if (ok) {
      setMode("choose");
      setReason("");
      setFiles([]);
    }
    setBusy(false);
  }

  function handleBack() {
    setMode("choose");
    setReason("");
    setFiles([]);
  }

  // Render the action choice screen
  if (mode === "choose") {
    return (
      <div className="relative w-full max-w-md bg-background border-t border-border rounded-t-2xl p-4 pb-6 pointer-events-auto shadow-lg animate-in slide-in-from-bottom-4 fade-in duration-200">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-h4 font-semibold text-brand-brown">
              {formatDayKeyFriendly(dayKey)}
            </p>
            <p className="text-meta text-sm text-text-secondary mt-0.5">
              {classification ? CLASSIFICATION_LABEL[classification] : "No record"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-secondary hover:bg-surface-muted hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 mb-4 text-sm">
          {stats.doneCount > 0 && (
            <span className="flex items-center gap-1 text-success">
              <span className="font-semibold">✓</span> {stats.doneCount} done
            </span>
          )}
          {stats.dueCount > 0 && (
            <span className="flex items-center gap-1 text-warning">
              <span className="font-semibold">⏰</span> {stats.dueCount} due
            </span>
          )}
          {stats.doneCount === 0 && stats.dueCount === 0 && (
            <span className="text-text-secondary text-sm">No tasks this day</span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("leave")}
            className="flex-1 rounded-lg border border-danger/30 bg-danger/5 text-danger text-sm font-medium px-3 py-2 hover:bg-danger/10 transition-colors"
          >
            Request Leave
          </button>
          <button
            type="button"
            onClick={() => setMode("wfh")}
            className="flex-1 rounded-lg border border-info/30 bg-info/5 text-info text-sm font-medium px-3 py-2 hover:bg-info/10 transition-colors"
          >
            Request WFH
          </button>
        </div>
      </div>
    );
  }

  // Render the request form screen
  const isLeave = mode === "leave";
  return (
    <div className="relative w-full max-w-md bg-background border-t border-border rounded-t-2xl p-4 pb-6 pointer-events-auto shadow-lg animate-in slide-in-from-bottom-4 fade-in duration-200">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-h4 font-semibold text-brand-brown">
            {formatDayKeyFriendly(dayKey)}
          </p>
          <p className="text-meta text-sm text-text-secondary mt-0.5">
            {isLeave ? "Leave request" : "WFH request"}
          </p>
        </div>
        <button
          type="button"
          onClick={handleBack}
          className="rounded-lg p-1.5 text-text-secondary hover:bg-surface-muted hover:text-foreground transition-colors"
          aria-label="Back"
        >
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      <div className="flex flex-col gap-4">
        <TextareaField
          id="reason"
          label="Reason"
          placeholder={isLeave ? "Why are you taking leave?" : "Why do you need to work from home?"}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={!reason.trim() && busy ? "Reason is required" : undefined}
        />

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">
            Supporting document (optional)
          </span>
          <p className="text-sm text-text-secondary">
            Attach a medical certificate, appointment letter, or any other proof.
            PDFs and images up to 5 MB.
          </p>
          <FileUpload
            value={files}
            onChange={setFiles}
            multiple
            label="Attach file"
            accept="image/*,application/pdf"
          />
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleBack}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => handleSubmit(isLeave ? "Leave" : "WFH")}
            disabled={busy}
            className="flex-1"
          >
            {busy ? "Submitting…" : `Submit ${isLeave ? "Leave" : "WFH"} Request`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatDayKeyFriendly(dayKey: string): string {
  const parts = dayKey.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (!year || !month || !day) return dayKey;
  const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

import { describe, expect, it } from "vitest";
import { buildPerformanceBreakdown } from "@/lib/performance-breakdown";

const at = (day: string, time = "00:00:00") =>
  new Date(`${day}T${time}.000Z`);
const now = at("2026-09-15");

const baseInput = {
  sessions: [],
  breaks: [],
  timeEntries: [],
  tasks: [],
  workloadPercent: null,
  feedbackRatings: [],
  goals: [],
};

describe("buildPerformanceBreakdown", () => {
  it("sums worked, break, and tracked time from the underlying modules", () => {
    const breakdown = buildPerformanceBreakdown(
      {
        ...baseInput,
        sessions: [{ clockInAt: at("2026-09-15", "09:00:00"), clockOutAt: at("2026-09-15", "17:00:00") }],
        breaks: [{ startedAt: at("2026-09-15", "13:00:00"), endedAt: at("2026-09-15", "13:30:00") }],
        timeEntries: [
          {
            startedAt: at("2026-09-15", "09:30:00"),
            endedAt: at("2026-09-15", "11:30:00"),
          },
        ],
      },
      now
    );

    expect(breakdown.attendance).toEqual({ workedMs: 7.5 * 60 * 60 * 1000, sessionCount: 1 });
    expect(breakdown.breaks).toEqual({ totalMs: 30 * 60 * 1000, count: 1 });
    expect(breakdown.focus).toEqual({ trackedMs: 2 * 60 * 60 * 1000 });
  });

  it("counts completed, due, and delayed tasks", () => {
    const breakdown = buildPerformanceBreakdown(
      {
        ...baseInput,
        tasks: [
          { status: "Done", dueDate: null, completedAt: at("2026-09-10") },
          { status: "Todo", dueDate: at("2026-09-01"), completedAt: null },
          { status: "InProgress", dueDate: at("2026-09-20"), completedAt: null },
          { status: "Todo", dueDate: null, completedAt: null },
        ],
      },
      now
    );

    expect(breakdown.tasks.completed).toBe(1);
    // Two open tasks carry a due date; the third has none, so it's excluded.
    expect(breakdown.tasks.due).toBe(2);
    // Only the 2026-09-01 task has slipped past `now` (2026-09-15).
    expect(breakdown.tasks.delayed).toBe(1);
  });

  it("has no attendance, breaks, or tasks for someone with no records", () => {
    const breakdown = buildPerformanceBreakdown(baseInput, now);

    expect(breakdown.attendance).toEqual({ workedMs: 0, sessionCount: 0 });
    expect(breakdown.breaks).toEqual({ totalMs: 0, count: 0 });
    expect(breakdown.focus).toEqual({ trackedMs: 0 });
    expect(breakdown.tasks).toEqual({
      completed: 0,
      due: 0,
      delayed: 0,
      completionRate: null,
      onTimeRate: null,
    });
    expect(breakdown.score).toBeNull();
  });

  it("reuses calculatePerformanceScore for the collective figure", () => {
    const breakdown = buildPerformanceBreakdown(
      {
        ...baseInput,
        tasks: [{ status: "Done", dueDate: null, completedAt: at("2026-09-10") }],
      },
      now
    );

    expect(breakdown.score).not.toBeNull();
  });
});

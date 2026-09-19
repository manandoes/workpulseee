import { describe, expect, it } from "vitest";
import {
  averageTaskTurnaroundMs,
  breakToWorkedRatio,
  buildPerformanceBreakdown,
  projectContribution,
} from "@/lib/performance-breakdown";

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
  dayAttendance: {
    sessions: [],
    breaks: [],
    leaveWindows: [],
    fromDayKey: null,
    toDayKey: null,
    timeZone: "UTC",
  },
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
    // 30m of breaks against 8h gross (7.5h worked + 30m break).
    expect(breakdown.breaks).toEqual({
      totalMs: 30 * 60 * 1000,
      count: 1,
      ratioPercent: (30 / (7.5 * 60 + 30)) * 100,
    });
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
    expect(breakdown.breaks).toEqual({ totalMs: 0, count: 0, ratioPercent: null });
    expect(breakdown.focus).toEqual({ trackedMs: 0 });
    expect(breakdown.tasks).toEqual({
      completed: 0,
      due: 0,
      delayed: 0,
      completionRate: null,
      onTimeRate: null,
      avgTurnaroundMs: null,
    });
    expect(breakdown.projects).toEqual({ distinctProjects: 0, tasksWithProject: 0 });
    expect(breakdown.score).toBeNull();
    expect(breakdown.days.presentDays).toBe(0);
  });

  it("delegates day-level attendance to buildAttendanceDays", () => {
    const breakdown = buildPerformanceBreakdown(
      {
        ...baseInput,
        dayAttendance: {
          sessions: [{ clockInAt: at("2026-09-15", "09:00:00"), clockOutAt: at("2026-09-15", "17:00:00") }],
          breaks: [],
          leaveWindows: [{ type: "WFH", startDayKey: "2026-09-16", endDayKey: "2026-09-16", dayPart: null }],
          fromDayKey: "2026-09-15",
          toDayKey: "2026-09-16",
          timeZone: "UTC",
        },
      },
      now
    );

    expect(breakdown.days.fullDays).toBe(1);
    expect(breakdown.days.wfhDays).toBe(1);
    expect(breakdown.days.presentDays).toBe(2);
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

describe("breakToWorkedRatio", () => {
  it("is null with no worked or break time", () => {
    expect(breakToWorkedRatio(0, 0)).toBeNull();
  });

  it("is breaks as a % of gross (worked + break) time", () => {
    expect(breakToWorkedRatio(90 * 60 * 1000, 10 * 60 * 1000)).toBe(10);
  });
});

describe("averageTaskTurnaroundMs", () => {
  it("is null with no Done tasks", () => {
    expect(
      averageTaskTurnaroundMs([
        { status: "Todo", dueDate: null, completedAt: null, createdAt: at("2026-09-01") },
      ])
    ).toBeNull();
  });

  it("is null when a Done task is missing createdAt or completedAt", () => {
    expect(
      averageTaskTurnaroundMs([
        { status: "Done", dueDate: null, completedAt: at("2026-09-05"), createdAt: undefined },
      ])
    ).toBeNull();
  });

  it("averages completedAt - createdAt across Done tasks that carry both", () => {
    const avg = averageTaskTurnaroundMs([
      // 2 days
      {
        status: "Done",
        dueDate: null,
        createdAt: at("2026-09-01"),
        completedAt: at("2026-09-03"),
      },
      // 4 days
      {
        status: "Done",
        dueDate: null,
        createdAt: at("2026-09-01"),
        completedAt: at("2026-09-05"),
      },
      // Not Done — excluded even though it carries both timestamps.
      {
        status: "InProgress",
        dueDate: null,
        createdAt: at("2026-09-01"),
        completedAt: null,
      },
    ]);
    expect(avg).toBe(3 * 24 * 60 * 60 * 1000);
  });
});

describe("projectContribution", () => {
  it("is empty with no tasks", () => {
    expect(projectContribution([])).toEqual({ distinctProjects: 0, tasksWithProject: 0 });
  });

  it("counts distinct projects and how many tasks carry one", () => {
    const contribution = projectContribution([
      { status: "Done", dueDate: null, completedAt: null, projectId: "p1" },
      { status: "Todo", dueDate: null, completedAt: null, projectId: "p1" },
      { status: "Todo", dueDate: null, completedAt: null, projectId: "p2" },
      // No project — a personal/client-direct task.
      { status: "Todo", dueDate: null, completedAt: null, projectId: null },
    ]);
    expect(contribution).toEqual({ distinctProjects: 2, tasksWithProject: 3 });
  });
});

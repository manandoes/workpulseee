import { describe, expect, it } from "vitest";
import {
  calculatePerformanceScore,
  feedbackContribution,
  goalContribution,
  onTimeDeliveryRate,
  PERFORMANCE_WEIGHTS,
  performanceBand,
  performanceBandLabel,
  resolvePeriod,
  scopeInputsToPeriod,
  taskCompletionRate,
  workloadContribution,
  type Period,
} from "@/lib/performance";

const due = (day: string) => new Date(`${day}T00:00:00.000Z`);

describe("taskCompletionRate", () => {
  it("is null for someone never assigned a task", () => {
    expect(taskCompletionRate([])).toBeNull();
  });

  it("is the share of ever-assigned tasks that reached Done", () => {
    const rate = taskCompletionRate([
      { status: "Done", dueDate: null, completedAt: null },
      { status: "Todo", dueDate: null, completedAt: null },
      { status: "InProgress", dueDate: null, completedAt: null },
      { status: "Done", dueDate: null, completedAt: null },
    ]);
    expect(rate).toBe(50);
  });
});

describe("onTimeDeliveryRate", () => {
  it("is null when nothing has reached Done yet", () => {
    expect(
      onTimeDeliveryRate([{ status: "Todo", dueDate: null, completedAt: null }])
    ).toBeNull();
  });

  it("counts a Done task with no due date as on time", () => {
    const rate = onTimeDeliveryRate([
      { status: "Done", dueDate: null, completedAt: due("2026-09-01") },
    ]);
    expect(rate).toBe(100);
  });

  it("counts finishing on or before the due date as on time", () => {
    const rate = onTimeDeliveryRate([
      {
        status: "Done",
        dueDate: due("2026-09-10"),
        completedAt: due("2026-09-10"),
      },
    ]);
    expect(rate).toBe(100);
  });

  it("counts finishing after the due date as late", () => {
    const rate = onTimeDeliveryRate([
      {
        status: "Done",
        dueDate: due("2026-09-10"),
        completedAt: due("2026-09-12"),
      },
      {
        status: "Done",
        dueDate: due("2026-09-10"),
        completedAt: due("2026-09-10"),
      },
    ]);
    expect(rate).toBe(50);
  });

  it("ignores tasks that never reached Done", () => {
    const rate = onTimeDeliveryRate([
      {
        status: "Done",
        dueDate: due("2026-09-10"),
        completedAt: due("2026-09-10"),
      },
      { status: "Todo", dueDate: due("2026-01-01"), completedAt: null },
    ]);
    expect(rate).toBe(100);
  });
});

describe("workloadContribution", () => {
  it("is null when workload has never been computed", () => {
    expect(workloadContribution(null)).toBeNull();
  });

  it("passes through a workload at or below capacity", () => {
    expect(workloadContribution(55)).toBe(55);
  });

  it("caps an overloaded workload at 100 rather than rewarding overload", () => {
    expect(workloadContribution(150)).toBe(100);
  });
});

describe("feedbackContribution", () => {
  it("is null when nobody has given feedback yet", () => {
    expect(feedbackContribution([])).toBeNull();
  });

  it("scales the average rating from 1-5 to 0-100", () => {
    expect(feedbackContribution([5])).toBe(100);
    expect(feedbackContribution([1])).toBe(0);
    expect(feedbackContribution([3])).toBe(50);
  });

  it("averages multiple ratings", () => {
    expect(feedbackContribution([5, 1])).toBe(50);
  });
});

describe("goalContribution", () => {
  it("is null with no goals at all", () => {
    expect(goalContribution([])).toBeNull();
  });

  it("is null when every goal is still Active", () => {
    expect(goalContribution([{ status: "Active" }])).toBeNull();
  });

  it("excludes Active goals from the ratio, decided goals only", () => {
    const contribution = goalContribution([
      { status: "Active" },
      { status: "Achieved" },
      { status: "Missed" },
    ]);
    expect(contribution).toBe(50);
  });

  it("is 100 when every decided goal was achieved", () => {
    expect(
      goalContribution([{ status: "Achieved" }, { status: "Achieved" }])
    ).toBe(100);
  });
});

describe("calculatePerformanceScore", () => {
  it("is null when there is nothing at all to score", () => {
    const score = calculatePerformanceScore({
      tasks: [],
      workloadPercent: null,
      feedbackRatings: [],
      goals: [],
    });
    expect(score).toBeNull();
  });

  it("scores purely from tasks when nothing else exists yet", () => {
    const score = calculatePerformanceScore({
      tasks: [{ status: "Done", dueDate: null, completedAt: null }],
      workloadPercent: null,
      feedbackRatings: [],
      goals: [],
    });
    // completion 100, on-time 100 — both weighted equally against each other
    // once workload/feedback/goals are renormalized out.
    expect(score).toBe(100);
  });

  it("renormalizes weights so a missing component doesn't drag the score down", () => {
    // Every present component reads 100; a missing feedback/goals component
    // must not pull the result below that.
    const score = calculatePerformanceScore({
      tasks: [
        {
          status: "Done",
          dueDate: due("2026-09-10"),
          completedAt: due("2026-09-09"),
        },
      ],
      workloadPercent: 100,
      feedbackRatings: [],
      goals: [],
    });
    expect(score).toBe(100);
  });

  it("weighs completion and on-time delivery as specified", () => {
    const score = calculatePerformanceScore({
      tasks: [{ status: "Done", dueDate: null, completedAt: null }],
      workloadPercent: 0,
      feedbackRatings: [1],
      goals: [{ status: "Missed" }],
    });
    const expected =
      (100 * PERFORMANCE_WEIGHTS.completion +
        100 * PERFORMANCE_WEIGHTS.onTime +
        0 * PERFORMANCE_WEIGHTS.workload +
        0 * PERFORMANCE_WEIGHTS.feedback +
        0 * PERFORMANCE_WEIGHTS.goals) /
      (PERFORMANCE_WEIGHTS.completion +
        PERFORMANCE_WEIGHTS.onTime +
        PERFORMANCE_WEIGHTS.workload +
        PERFORMANCE_WEIGHTS.feedback +
        PERFORMANCE_WEIGHTS.goals);
    expect(score).toBe(Math.round(expected * 100) / 100);
  });
});

describe("resolvePeriod", () => {
  // A Wednesday, so the week boundaries are visibly not the day itself.
  const now = new Date("2026-09-16T10:30:00.000Z");

  it("is null for all time, which is the whole record", () => {
    expect(resolvePeriod("all", undefined, undefined, now)).toBeNull();
  });

  it("runs a week Monday to Sunday, inclusive of the last instant", () => {
    const period = resolvePeriod("week", undefined, undefined, now);
    expect(period?.from.toISOString()).toBe("2026-09-14T00:00:00.000Z");
    expect(period?.to.toISOString()).toBe("2026-09-20T23:59:59.999Z");
  });

  it("runs a month from the 1st to the real last day", () => {
    const february = resolvePeriod(
      "month",
      undefined,
      undefined,
      new Date("2026-02-10T12:00:00.000Z")
    );
    expect(february?.from.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(february?.to.toISOString()).toBe("2026-02-28T23:59:59.999Z");
  });

  it("includes both ends of a custom range", () => {
    const period = resolvePeriod("custom", "2026-03-01", "2026-03-31", now);
    expect(period?.from.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(period?.to.toISOString()).toBe("2026-03-31T23:59:59.999Z");
  });

  it("falls back to all time rather than erroring on a hand-edited URL", () => {
    expect(resolvePeriod("custom", undefined, undefined, now)).toBeNull();
    expect(resolvePeriod("custom", "2026-03-01", undefined, now)).toBeNull();
    expect(resolvePeriod("custom", "not-a-date", "2026-03-31", now)).toBeNull();
    // End before start is a range nobody meant.
    expect(resolvePeriod("custom", "2026-03-31", "2026-03-01", now)).toBeNull();
  });
});

describe("scopeInputsToPeriod", () => {
  const march: Period = {
    from: new Date("2026-03-01T00:00:00.000Z"),
    to: new Date("2026-03-31T23:59:59.999Z"),
  };

  const input = {
    tasks: [
      // Finished inside March, late against its own deadline.
      {
        status: "Done" as const,
        dueDate: due("2026-03-10"),
        completedAt: due("2026-03-12"),
      },
      // Finished in February — another month's work.
      {
        status: "Done" as const,
        dueDate: due("2026-02-10"),
        completedAt: due("2026-02-11"),
      },
      // Came due in March and still is not finished.
      { status: "Todo" as const, dueDate: due("2026-03-20"), completedAt: null },
      // Neither finished nor due in March.
      { status: "Todo" as const, dueDate: due("2026-05-01"), completedAt: null },
    ],
    workloadPercent: 80,
    feedback: [
      { rating: 5, createdAt: due("2026-03-15") },
      { rating: 1, createdAt: due("2026-02-15") },
    ],
    goals: [
      { status: "Achieved" as const, decidedAt: due("2026-03-05") },
      { status: "Missed" as const, decidedAt: due("2026-01-05") },
      { status: "Active" as const, decidedAt: due("2026-03-06") },
    ],
  };

  it("passes the whole record through for all time", () => {
    const scoped = scopeInputsToPeriod(input, null);
    expect(scoped.tasks).toHaveLength(4);
    expect(scoped.feedbackRatings).toEqual([5, 1]);
    expect(scoped.goals).toHaveLength(3);
    expect(scoped.workloadPercent).toBe(80);
  });

  it("keeps work finished in the window, and work that came due in it unfinished", () => {
    const scoped = scopeInputsToPeriod(input, march);
    expect(scoped.tasks).toHaveLength(2);
    // One of the two reached Done, and it was late.
    expect(taskCompletionRate(scoped.tasks)).toBe(50);
    expect(onTimeDeliveryRate(scoped.tasks)).toBe(0);
  });

  it("excludes a Done task with no completion timestamp to place it", () => {
    const scoped = scopeInputsToPeriod(
      {
        ...input,
        tasks: [
          { status: "Done", dueDate: due("2026-03-10"), completedAt: null },
        ],
      },
      march
    );
    expect(scoped.tasks).toHaveLength(0);
  });

  it("keeps only feedback given in the window", () => {
    expect(scopeInputsToPeriod(input, march).feedbackRatings).toEqual([5]);
  });

  it("keeps only goals decided in the window, never still-Active ones", () => {
    const scoped = scopeInputsToPeriod(input, march);
    expect(scoped.goals).toEqual([{ status: "Achieved", decidedAt: due("2026-03-05") }]);
  });

  it("drops workload from a bounded period, since it has no history", () => {
    expect(scopeInputsToPeriod(input, march).workloadPercent).toBeNull();
  });

  it("scores null for a window nothing happened in", () => {
    const empty = scopeInputsToPeriod(input, {
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-08-31T23:59:59.999Z"),
    });
    expect(calculatePerformanceScore(empty)).toBeNull();
  });

  it("includes the first and last instant of the window", () => {
    const edges = scopeInputsToPeriod(
      {
        ...input,
        tasks: [
          {
            status: "Done",
            dueDate: null,
            completedAt: new Date("2026-03-01T00:00:00.000Z"),
          },
          {
            status: "Done",
            dueDate: null,
            completedAt: new Date("2026-03-31T23:59:59.999Z"),
          },
        ],
      },
      march
    );
    expect(edges.tasks).toHaveLength(2);
  });
});

describe("performanceBand", () => {
  it("matches the documented thresholds", () => {
    expect(performanceBand(0)).toBe("danger");
    expect(performanceBand(39)).toBe("danger");
    expect(performanceBand(40)).toBe("warning");
    expect(performanceBand(69)).toBe("warning");
    expect(performanceBand(70)).toBe("success");
    expect(performanceBand(100)).toBe("success");
  });

  it("pairs a word with every band, never color alone", () => {
    expect(performanceBandLabel("success")).toBe("Strong");
    expect(performanceBandLabel("warning")).toBe("Steady");
    expect(performanceBandLabel("danger")).toBe("Needs support");
  });
});

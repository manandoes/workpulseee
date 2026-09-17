import { describe, expect, it } from "vitest";
import {
  attachmentLabel,
  completionFor,
  completionPercent,
  daysFromToday,
  isHttpUrl,
  isOpen,
  isOverdue,
  OPEN_STATUSES,
  startOfDayUtc,
  taskFilter,
  taskVisibilityFilter,
  TASK_STATUSES,
  UNASSIGNED,
} from "@/lib/tasks";

/** Mid-afternoon on 9 September, so a same-day comparison is not a tie. */
const NOW = new Date("2026-09-09T15:30:00.000Z");
/** Deadlines are stored at UTC midnight — build them the way the app does. */
const due = (day: string) => new Date(`${day}T00:00:00.000Z`);

describe("isOverdue", () => {
  it("flags open work whose deadline has passed", () => {
    expect(isOverdue({ status: "Todo", dueDate: due("2026-09-08") }, NOW)).toBe(
      true
    );
    expect(
      isOverdue({ status: "InReview", dueDate: due("2026-01-01") }, NOW)
    ).toBe(true);
  });

  /**
   * The reason the comparison is against midnight rather than the clock: a task
   * due today still has the rest of the day, and must not turn red at 00:01.
   */
  it("gives a task due today the whole day", () => {
    expect(isOverdue({ status: "Todo", dueDate: due("2026-09-09") }, NOW)).toBe(
      false
    );
    expect(
      isOverdue(
        { status: "Todo", dueDate: due("2026-09-09") },
        new Date("2026-09-09T00:01:00.000Z")
      )
    ).toBe(false);
  });

  it("never flags finished work, however old", () => {
    expect(isOverdue({ status: "Done", dueDate: due("2020-01-01") }, NOW)).toBe(
      false
    );
  });

  it("never flags a task with no deadline", () => {
    expect(isOverdue({ status: "InProgress", dueDate: null }, NOW)).toBe(false);
  });

  it("reads the date string a JSON response carries", () => {
    expect(
      isOverdue({ status: "Todo", dueDate: "2026-09-08T00:00:00.000Z" }, NOW)
    ).toBe(true);
  });

  it("treats an unparseable date as no deadline rather than as late", () => {
    expect(isOverdue({ status: "Todo", dueDate: "not a date" }, NOW)).toBe(
      false
    );
  });
});

describe("completionFor", () => {
  it("stamps the moment a task first reaches Done", () => {
    expect(completionFor("Done", null, NOW)).toEqual(NOW);
  });

  it("keeps the original timestamp when a Done task is saved again", () => {
    const first = new Date("2026-09-01T09:00:00.000Z");
    expect(completionFor("Done", first, NOW)).toEqual(first);
  });

  /**
   * Otherwise a reopened task would keep claiming it was delivered, and
   * Phase 8's on-time-delivery score would count it twice.
   */
  it("clears the timestamp when a task is moved back out of Done", () => {
    expect(completionFor("InProgress", new Date("2026-09-01"), NOW)).toBeNull();
  });
});

describe("completionPercent", () => {
  it("is the share of tasks that are done", () => {
    expect(completionPercent(4, 1)).toBe(25);
    expect(completionPercent(3, 3)).toBe(100);
  });

  it("is unknown rather than zero when there are no tasks", () => {
    expect(completionPercent(0, 0)).toBeNull();
  });
});

describe("status vocabulary", () => {
  it("runs in the order work moves through it", () => {
    expect([...TASK_STATUSES]).toEqual([
      "Todo",
      "InProgress",
      "InReview",
      "Done",
    ]);
  });

  it("counts everything but Done as outstanding", () => {
    expect([...OPEN_STATUSES]).toEqual(["Todo", "InProgress", "InReview"]);
    expect(isOpen("Done")).toBe(false);
    expect(isOpen("InReview")).toBe(true);
  });
});

describe("startOfDayUtc / daysFromToday", () => {
  it("truncates to midnight UTC", () => {
    expect(startOfDayUtc(NOW).toISOString()).toBe("2026-09-09T00:00:00.000Z");
  });

  it("counts whole days from that midnight", () => {
    expect(daysFromToday(NOW, 7).toISOString()).toBe(
      "2026-09-16T00:00:00.000Z"
    );
  });
});

describe("taskFilter", () => {
  it("is empty when nothing is filtered, so the caller's tenant scope decides", () => {
    expect(taskFilter({}, NOW)).toEqual({});
  });

  it("searches the task, its project and its assignee", () => {
    const where = taskFilter({ q: "northwind" }, NOW) as {
      OR: Record<string, unknown>[];
    };
    expect(where.OR).toHaveLength(4);
    expect(where.OR[0]).toEqual({
      title: { contains: "northwind", mode: "insensitive" },
    });
  });

  it("ignores a search of nothing but spaces", () => {
    expect(taskFilter({ q: "   " }, NOW)).toEqual({});
  });

  it("filters unassigned work by a null assignee, not by the literal word", () => {
    expect(taskFilter({ assigneeId: UNASSIGNED }, NOW)).toEqual({
      assigneeId: null,
    });
    expect(taskFilter({ assigneeId: "emp_1" }, NOW)).toEqual({
      assigneeId: "emp_1",
    });
  });

  it("reaches a client through its projects, or a task filed directly under it", () => {
    expect(taskFilter({ clientId: "cli_1" }, NOW)).toEqual({
      AND: [
        {
          OR: [
            { project: { clientId: "cli_1" } },
            { clientId: "cli_1" },
          ],
        },
      ],
    });
  });

  describe("deadline windows", () => {
    it("asks the database for overdue rather than filtering in memory", () => {
      expect(taskFilter({ due: "overdue" }, NOW)).toEqual({
        status: { not: "Done" },
        dueDate: { lt: startOfDayUtc(NOW) },
      });
    });

    it("bounds 'today' to the day itself", () => {
      expect(taskFilter({ due: "today" }, NOW)).toEqual({
        status: { not: "Done" },
        dueDate: { gte: startOfDayUtc(NOW), lt: daysFromToday(NOW, 1) },
      });
    });

    it("includes what is already late in 'this week'", () => {
      expect(taskFilter({ due: "week" }, NOW)).toEqual({
        status: { not: "Done" },
        dueDate: { lt: daysFromToday(NOW, 7) },
      });
    });

    /**
     * A window plus an explicit status must not have its status overwritten:
     * "overdue and in review" is a question a manager asks.
     */
    it("keeps an explicitly chosen status alongside a window", () => {
      expect(taskFilter({ due: "overdue", status: "InReview" }, NOW)).toEqual({
        status: "InReview",
        dueDate: { lt: startOfDayUtc(NOW) },
      });
    });
  });
});

describe("isHttpUrl", () => {
  it("accepts ordinary web links", () => {
    expect(isHttpUrl("https://drive.example.com/file/d/abc")).toBe(true);
    expect(isHttpUrl("  http://intranet/spec.pdf  ")).toBe(true);
  });

  /** The reason this check exists: a stored link is a link somebody clicks. */
  it("rejects script and local-file schemes", () => {
    expect(isHttpUrl("javascript:alert(document.cookie)")).toBe(false);
    expect(isHttpUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(isHttpUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects anything that is not a URL at all", () => {
    expect(isHttpUrl("the brief")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
  });
});

describe("taskVisibilityFilter", () => {
  it("always includes tasks on a project", () => {
    const where = taskVisibilityFilter({
      id: "acct_1",
      accountType: "company",
    });
    expect(where.OR).toContainEqual({ projectId: { not: null } });
  });

  it("scopes a standalone task to its creator for a company actor", () => {
    const where = taskVisibilityFilter({
      id: "acct_1",
      accountType: "company",
    });
    expect(where.OR).toContainEqual({ createdById: "acct_1" });
  });

  it("scopes a standalone task to its assignee for an employee actor", () => {
    const where = taskVisibilityFilter({
      id: "emp_1",
      accountType: "employee",
    });
    expect(where.OR).toContainEqual({ assigneeId: "emp_1" });
  });
});

describe("attachmentLabel", () => {
  it("prefers what the person typed", () => {
    expect(attachmentLabel("https://x.test/a/b.pdf", " Brief ")).toBe("Brief");
  });

  it("falls back to the file name in the link", () => {
    expect(attachmentLabel("https://x.test/files/final%20brief.pdf")).toBe(
      "final brief.pdf"
    );
  });

  it("falls back to the host when the link has no path", () => {
    expect(attachmentLabel("https://figma.com/")).toBe("figma.com");
  });
});

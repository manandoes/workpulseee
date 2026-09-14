import { describe, expect, it } from "vitest";
import { formatDate } from "@/lib/format";
import {
  DEADLINE_WARNING_DAYS,
  resolveApproversFor,
  deadlineDedupeKey,
  deadlineMessage,
  isDeliverablePhone,
  normalizePhone,
  resolveChannels,
  resolveCompletionWatchers,
  taskAssignedMessage,
  taskCompletedMessage,
  type ChannelPreferences,
  type ContactPoints,
} from "@/lib/notifications";

/**
 * Unit tests for the pure half of notifications (Rules.md section 10 —
 * critical business logic gets tests). The channel rule is the one worth
 * covering hardest: every message that costs money leaves through it.
 */

describe("resolveApproversFor", () => {
  const accounts = [
    { id: "owner_1", role: "Owner" },
    { id: "admin_1", role: "Admin" },
    { id: "hr_1", role: "HR" },
    { id: "mgr_1", role: "Manager" },
    { id: "mgr_2", role: "Manager" },
  ];

  it("always includes Owner, Admin and HR", () => {
    const approvers = resolveApproversFor(accounts, {
      managerAccountId: null,
    });
    expect(approvers.sort()).toEqual(["admin_1", "hr_1", "owner_1"]);
  });

  it("adds the employee's own manager account, but no other Manager", () => {
    const approvers = resolveApproversFor(accounts, {
      managerAccountId: "mgr_1",
    });
    expect(approvers.sort()).toEqual(["admin_1", "hr_1", "mgr_1", "owner_1"]);
    expect(approvers).not.toContain("mgr_2");
  });

  /**
   * A `managerAccountId` naming an Owner/Admin/HR account (an unusual setup,
   * but the schema allows any CompanyAccount to be a manager) must not produce
   * a duplicate entry.
   */
  it("de-duplicates when the manager account is already Owner/Admin/HR", () => {
    const approvers = resolveApproversFor(accounts, {
      managerAccountId: "owner_1",
    });
    expect(approvers.filter((id) => id === "owner_1")).toHaveLength(1);
  });

  it("ignores a manager account id that does not exist in the company", () => {
    const approvers = resolveApproversFor(accounts, {
      managerAccountId: "ghost",
    });
    expect(approvers.sort()).toEqual(["admin_1", "hr_1", "owner_1"]);
  });
});

const REACHABLE: ContactPoints = {
  email: "someone@example.com",
  phone: "+919876543210",
  hasPushSubscription: true,
};

const ALL_OFF: ChannelPreferences = {
  emailEnabled: false,
  whatsappEnabled: false,
  pushEnabled: false,
};

describe("resolveChannels", () => {
  it("sends a task assignment on every channel when nothing is switched off", () => {
    expect(resolveChannels("TaskAssigned", null, REACHABLE).sort()).toEqual([
      "Email",
      "InApp",
      "Push",
      "WhatsApp",
    ]);
  });

  it("treats a missing preference row as everything enabled", () => {
    const withRow = resolveChannels(
      "TaskCompleted",
      {
        emailEnabled: true,
        whatsappEnabled: true,
        pushEnabled: true,
      },
      REACHABLE
    );

    expect(resolveChannels("TaskCompleted", null, REACHABLE)).toEqual(withRow);
  });

  it("keeps the bell even when every channel is switched off", () => {
    expect(resolveChannels("TaskAssigned", ALL_OFF, REACHABLE)).toEqual([
      "InApp",
    ]);
  });

  it("drops email when there is no address", () => {
    const channels = resolveChannels("TaskAssigned", null, {
      ...REACHABLE,
      email: null,
    });

    expect(channels).not.toContain("Email");
    expect(channels).toContain("InApp");
  });

  it("drops WhatsApp when the number is not E.164", () => {
    // A local number: deliverable-looking to a human, unusable to Meta.
    const channels = resolveChannels("TaskAssigned", null, {
      ...REACHABLE,
      phone: "9876543210",
    });

    expect(channels).not.toContain("WhatsApp");
  });

  it("drops push when no browser is subscribed", () => {
    const channels = resolveChannels("TaskAssigned", null, {
      ...REACHABLE,
      hasPushSubscription: false,
    });

    expect(channels).not.toContain("Push");
  });

  it("keeps a submitted request off email and WhatsApp", () => {
    // Approvers see a queue of these all day; Phase 7 was in-app only.
    expect(resolveChannels("RequestSubmitted", null, REACHABLE).sort()).toEqual(
      ["InApp", "Push"]
    );
  });
});

describe("normalizePhone", () => {
  it("keeps a number that is already E.164", () => {
    expect(normalizePhone("+919876543210")).toBe("+919876543210");
  });

  it("strips the punctuation people type", () => {
    expect(normalizePhone(" +91 98765-43210 ")).toBe("+919876543210");
    expect(normalizePhone("+1 (555) 010-4477")).toBe("+15550104477");
  });

  it("reads a leading 00 as the international prefix", () => {
    expect(normalizePhone("0091 98765 43210")).toBe("+919876543210");
  });

  it("refuses to guess a country code for a local number", () => {
    expect(normalizePhone("9876543210")).toBeNull();
  });

  it("rejects a country code starting with zero", () => {
    expect(normalizePhone("+0919876543210")).toBeNull();
  });

  it("returns null for nothing at all", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });

  it("rejects a number that is too short or too long", () => {
    expect(normalizePhone("+1234567")).toBeNull();
    expect(normalizePhone("+1234567890123456")).toBeNull();
  });
});

describe("isDeliverablePhone", () => {
  it("accepts E.164 and nothing else", () => {
    expect(isDeliverablePhone("+919876543210")).toBe(true);
    expect(isDeliverablePhone("919876543210")).toBe(false);
    expect(isDeliverablePhone(null)).toBe(false);
  });
});

describe("resolveCompletionWatchers", () => {
  const accounts = [
    { id: "owner", role: "Owner" },
    { id: "admin", role: "Admin" },
    { id: "hr", role: "HR" },
    { id: "lead", role: "Manager" },
    { id: "other-manager", role: "Manager" },
  ];

  it("always tells Owner and Admin", () => {
    const watchers = resolveCompletionWatchers(accounts, {
      projectLeadAccountId: null,
      createdById: null,
    });

    expect(watchers.sort()).toEqual(["admin", "owner"]);
  });

  it("adds the project lead and whoever raised the task", () => {
    const watchers = resolveCompletionWatchers(accounts, {
      projectLeadAccountId: "lead",
      createdById: "other-manager",
    });

    expect(watchers.sort()).toEqual([
      "admin",
      "lead",
      "other-manager",
      "owner",
    ]);
  });

  it("leaves out Managers with no stake in this task", () => {
    const watchers = resolveCompletionWatchers(accounts, {
      projectLeadAccountId: "lead",
      createdById: null,
    });

    expect(watchers).not.toContain("other-manager");
    expect(watchers).not.toContain("hr");
  });

  it("names each watcher once when the lead also raised it", () => {
    const watchers = resolveCompletionWatchers(accounts, {
      projectLeadAccountId: "lead",
      createdById: "lead",
    });

    expect(watchers.filter((id) => id === "lead")).toHaveLength(1);
  });

  it("ignores an id that is not an account in this company", () => {
    const watchers = resolveCompletionWatchers(accounts, {
      projectLeadAccountId: "deleted-account",
      createdById: null,
    });

    expect(watchers.sort()).toEqual(["admin", "owner"]);
  });
});

describe("deadlineMessage", () => {
  it("says today and tomorrow by name rather than by number", () => {
    expect(deadlineMessage("Ship the deck", 0)).toBe(
      '"Ship the deck" is due today.'
    );
    expect(deadlineMessage("Ship the deck", 1)).toBe(
      '"Ship the deck" is due tomorrow.'
    );
  });

  it("counts days for anything further out", () => {
    expect(deadlineMessage("Ship the deck", 3)).toBe(
      '"Ship the deck" is due in 3 days.'
    );
  });

  it("says overdue rather than a negative count", () => {
    expect(deadlineMessage("Ship the deck", -2)).toBe(
      '"Ship the deck" is overdue.'
    );
  });
});

describe("deadlineDedupeKey", () => {
  const dueDate = new Date("2026-09-20T00:00:00.000Z");

  it("is stable for the same task, deadline and milestone", () => {
    expect(deadlineDedupeKey("t1", dueDate, 1)).toBe(
      deadlineDedupeKey("t1", new Date("2026-09-20T00:00:00.000Z"), 1)
    );
  });

  it("differs per milestone, so both warnings get through", () => {
    expect(deadlineDedupeKey("t1", dueDate, 1)).not.toBe(
      deadlineDedupeKey("t1", dueDate, 0)
    );
  });

  it("differs once the deadline moves, so the new date warns again", () => {
    expect(deadlineDedupeKey("t1", dueDate, 1)).not.toBe(
      deadlineDedupeKey("t1", new Date("2026-09-27T00:00:00.000Z"), 1)
    );
  });

  it("warns the day before and the day of", () => {
    expect([...DEADLINE_WARNING_DAYS]).toEqual([1, 0]);
  });
});

describe("task messages", () => {
  it("names the deadline when a task has one", () => {
    // Asserted through `formatDate` rather than a literal: the notification
    // must read exactly as the date does everywhere else in the app, and the
    // month abbreviation itself comes from the runtime's locale data.
    const dueDate = new Date("2026-09-20T00:00:00.000Z");

    expect(taskAssignedMessage("Ship the deck", dueDate)).toBe(
      `You have been assigned "Ship the deck". Due ${formatDate(dueDate)}.`
    );
  });

  it("reads the deadline in UTC, not the viewer's timezone", () => {
    // Stored at UTC midnight, so a naive local read would show the 19th west
    // of Greenwich — the bug `formatDate` exists to avoid.
    expect(
      taskAssignedMessage("Ship the deck", new Date("2026-09-20T00:00:00.000Z"))
    ).toContain("20");
  });

  it("says nothing about a deadline when there is none", () => {
    expect(taskAssignedMessage("Ship the deck", null)).toBe(
      'You have been assigned "Ship the deck".'
    );
  });

  it("falls back to someone when the assignee is gone", () => {
    expect(taskCompletedMessage("Ship the deck", null)).toBe(
      'Someone completed "Ship the deck".'
    );
  });
});

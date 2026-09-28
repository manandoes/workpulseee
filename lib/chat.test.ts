import { describe, expect, it } from "vitest";
import {
  CHAT_MESSAGE_RETENTION_DAYS,
  CHAT_MESSAGE_TTL_MS,
  chatMessageCutoff,
  conversationPreview,
  isExpiredChatMessage,
  isSameParticipant,
  otherParticipant,
} from "@/lib/chat";

const NOW = new Date("2026-09-11T15:00:00.000Z");

const DAY_MS = 24 * 60 * 60 * 1000;

describe("chatMessageCutoff", () => {
  it("is exactly 31 days before now", () => {
    expect(CHAT_MESSAGE_RETENTION_DAYS).toBe(31);
    expect(chatMessageCutoff(NOW).getTime()).toBe(NOW.getTime() - 31 * DAY_MS);
    expect(CHAT_MESSAGE_TTL_MS).toBe(31 * DAY_MS);
  });
});

describe("isExpiredChatMessage", () => {
  it("treats a message older than 31 days as expired", () => {
    const createdAt = new Date(NOW.getTime() - 31 * DAY_MS - 1);
    expect(isExpiredChatMessage(createdAt, NOW)).toBe(true);
  });

  it("keeps a message that is past the old 3-day window but within 31 days", () => {
    const fourDaysOld = new Date(NOW.getTime() - 4 * DAY_MS);
    const thirtyDaysOld = new Date(NOW.getTime() - 30 * DAY_MS);
    expect(isExpiredChatMessage(fourDaysOld, NOW)).toBe(false);
    expect(isExpiredChatMessage(thirtyDaysOld, NOW)).toBe(false);
  });

  it("treats a message sent an hour ago as not expired", () => {
    const createdAt = new Date(NOW.getTime() - 60 * 60 * 1000);
    expect(isExpiredChatMessage(createdAt, NOW)).toBe(false);
  });
});

describe("isSameParticipant", () => {
  it("matches on employeeId when set", () => {
    expect(
      isSameParticipant(
        { employeeId: "e1", accountId: null },
        { employeeId: "e1" }
      )
    ).toBe(true);
    expect(
      isSameParticipant(
        { employeeId: "e1", accountId: null },
        { employeeId: "e2" }
      )
    ).toBe(false);
  });

  it("matches on accountId when set", () => {
    expect(
      isSameParticipant(
        { employeeId: null, accountId: "a1" },
        { accountId: "a1" }
      )
    ).toBe(true);
  });
});

describe("otherParticipant", () => {
  const participants = [
    { employeeId: "e1", accountId: null, name: "Employee One" },
    { employeeId: null, accountId: "a1", name: "Account One" },
  ];

  it("returns the participant that is not the actor (employee actor)", () => {
    const other = otherParticipant(participants, {
      id: "e1",
      accountType: "employee",
    });
    expect(other?.name).toBe("Account One");
  });

  it("returns the participant that is not the actor (company actor)", () => {
    const other = otherParticipant(participants, {
      id: "a1",
      accountType: "company",
    });
    expect(other?.name).toBe("Employee One");
  });

  it("returns null when no non-actor participant is found", () => {
    const other = otherParticipant(
      [{ employeeId: "e1", accountId: null, name: "Employee One" }],
      { id: "e1", accountType: "employee" }
    );
    expect(other).toBeNull();
  });
});

describe("conversationPreview", () => {
  it("uses the message body when there is one", () => {
    expect(conversationPreview("hey there", null)).toBe("hey there");
    // Text wins even alongside an attachment.
    expect(conversationPreview("see attached", "report.pdf")).toBe("see attached");
  });

  it("falls back to the attachment name for a bare file share", () => {
    // body is "" (falsy but not nullish) - a naive `body ?? fallback` misses this.
    expect(conversationPreview("", "photo.png")).toBe("📎 photo.png");
  });

  it("returns an empty string when there is neither", () => {
    expect(conversationPreview("", null)).toBe("");
  });
});

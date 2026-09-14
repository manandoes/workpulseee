import { describe, expect, it } from "vitest";
import {
  CHAT_MESSAGE_TTL_MS,
  chatMessageCutoff,
  isExpiredChatMessage,
  isSameParticipant,
  otherParticipant,
} from "@/lib/chat";

const NOW = new Date("2026-09-11T15:00:00.000Z");

describe("chatMessageCutoff", () => {
  it("is exactly three days before now", () => {
    expect(chatMessageCutoff(NOW).getTime()).toBe(
      NOW.getTime() - 3 * 24 * 60 * 60 * 1000
    );
    expect(CHAT_MESSAGE_TTL_MS).toBe(3 * 24 * 60 * 60 * 1000);
  });
});

describe("isExpiredChatMessage", () => {
  it("treats a message older than three days as expired", () => {
    const createdAt = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000 - 1);
    expect(isExpiredChatMessage(createdAt, NOW)).toBe(true);
  });

  it("treats a message within three days as not expired", () => {
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

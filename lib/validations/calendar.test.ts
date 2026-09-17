import { describe, expect, it } from "vitest";
import { proposeMeetingSchema } from "@/lib/validations/calendar";

const base = {
  title: "Weekly sync",
  description: "",
  location: "",
  startAt: "2026-09-16T09:00:00.000Z",
  endAt: "2026-09-16T10:00:00.000Z",
  participants: [{ kind: "employee" as const, id: "emp_1" }],
};

describe("proposeMeetingSchema", () => {
  it("accepts a valid meeting", () => {
    expect(proposeMeetingSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an end time at or before the start time", () => {
    const result = proposeMeetingSchema.safeParse({
      ...base,
      endAt: base.startAt,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["endAt"]);
    }
  });

  it("rejects no participants", () => {
    const result = proposeMeetingSchema.safeParse({ ...base, participants: [] });
    expect(result.success).toBe(false);
  });

  it("rejects the same person invited twice", () => {
    const result = proposeMeetingSchema.safeParse({
      ...base,
      participants: [
        { kind: "employee", id: "emp_1" },
        { kind: "employee", id: "emp_1" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("allows the same id across different kinds", () => {
    const result = proposeMeetingSchema.safeParse({
      ...base,
      participants: [
        { kind: "employee", id: "same" },
        { kind: "account", id: "same" },
      ],
    });
    expect(result.success).toBe(true);
  });
});

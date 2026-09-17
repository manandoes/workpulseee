import { describe, expect, it } from "vitest";
import { resolveRequest } from "@/lib/request-data";
import type { CreateRequestInput } from "@/lib/validations/requests";

/**
 * `resolveRequest` is pure (no DB access), unlike the rest of this module —
 * safe to unit test directly, mirroring `lib/requests.test.ts`'s coverage of
 * the predicates it relies on.
 */
const base: CreateRequestInput = {
  type: "Leave",
  subject: "Annual leave",
  description: "A week off",
  startDate: "2026-10-01",
  endDate: "2026-10-05",
};

describe("resolveRequest — dayPart", () => {
  it("defaults an omitted dayPart to FullDay for a Leave request", () => {
    const resolved = resolveRequest(base);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.data.dayPart).toBe("FullDay");
  });

  it("keeps an explicit half day for a Leave request", () => {
    const resolved = resolveRequest({ ...base, dayPart: "FirstHalf" });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.data.dayPart).toBe("FirstHalf");
  });

  it("stores null for a type that doesn't need a day part", () => {
    const resolved = resolveRequest({
      type: "HR",
      subject: "Question",
      description: "Just a question",
      dayPart: "FirstHalf",
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.data.dayPart).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { createRequestSchema } from "@/lib/validations/requests";

const base = {
  subject: "Annual leave",
  description: "A week off",
  requestedApproverAccountId: "acct_1",
};

describe("createRequestSchema — dayPart", () => {
  it("is optional — resolveRequest applies the FullDay default", () => {
    const parsed = createRequestSchema.parse({
      ...base,
      type: "HR",
    });
    expect(parsed.dayPart).toBeUndefined();
  });

  it("accepts a full-day Leave over a date range", () => {
    const result = createRequestSchema.safeParse({
      ...base,
      type: "Leave",
      startDate: "2026-10-01",
      endDate: "2026-10-05",
      dayPart: "FullDay",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a half day when start and end are the same day", () => {
    const result = createRequestSchema.safeParse({
      ...base,
      type: "Leave",
      startDate: "2026-10-01",
      endDate: "2026-10-01",
      dayPart: "FirstHalf",
    });
    expect(result.success).toBe(true);
  });

  it("refuses a half day spanning more than one day", () => {
    const result = createRequestSchema.safeParse({
      ...base,
      type: "Leave",
      startDate: "2026-10-01",
      endDate: "2026-10-02",
      dayPart: "SecondHalf",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["endDate"]);
    }
  });

  it("ignores dayPart for a type that doesn't need it", () => {
    const result = createRequestSchema.safeParse({
      ...base,
      type: "Reimbursement",
      amount: "1500",
      dayPart: "FirstHalf",
      startDate: "2026-10-01",
      endDate: "2026-10-02",
    });
    expect(result.success).toBe(true);
  });
});

describe("createRequestSchema — approver (Phase 21)", () => {
  const leave = {
    type: "HR" as const,
    subject: "Annual leave",
    description: "A week off",
  };

  it("requires an approver", () => {
    const result = createRequestSchema.safeParse(leave);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual([
        "requestedApproverAccountId",
      ]);
    }
  });

  it("accepts an employee approver with the account field left blank", () => {
    const result = createRequestSchema.safeParse({
      ...leave,
      requestedApproverAccountId: "",
      requestedApproverEmployeeId: "emp_1",
    });
    expect(result.success).toBe(true);
  });

  it("refuses both kinds of approver at once", () => {
    const result = createRequestSchema.safeParse({
      ...leave,
      requestedApproverAccountId: "acct_1",
      requestedApproverEmployeeId: "emp_1",
    });
    expect(result.success).toBe(false);
  });
});

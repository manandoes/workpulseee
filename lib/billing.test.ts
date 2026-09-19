import { describe, expect, it } from "vitest";
import { employeeCapFor, hasActiveSubscription } from "@/lib/billing";
import type { SubscriptionSummary } from "@/lib/billing";

const summary = (
  overrides: Partial<SubscriptionSummary> = {}
): SubscriptionSummary => ({
  plan: "Starter",
  status: "Active",
  extraSeats: 0,
  currentPeriodEnd: new Date("2026-10-01T00:00:00Z"),
  ...overrides,
});

const NOW = new Date("2026-09-19T00:00:00Z");

describe("hasActiveSubscription", () => {
  it("is false when there is no subscription at all", () => {
    expect(hasActiveSubscription(null, NOW)).toBe(false);
  });

  it("is false for a company that has never paid (Inactive)", () => {
    expect(
      hasActiveSubscription(summary({ status: "Inactive" }), NOW)
    ).toBe(false);
  });

  it("is true while the paid period has not yet ended", () => {
    expect(hasActiveSubscription(summary(), NOW)).toBe(true);
  });

  it("is false once the period has passed, with no separate Expired write needed", () => {
    expect(
      hasActiveSubscription(
        summary({ currentPeriodEnd: new Date("2026-09-01T00:00:00Z") }),
        NOW
      )
    ).toBe(false);
  });

  it("is false when Active but currentPeriodEnd was never set", () => {
    expect(
      hasActiveSubscription(summary({ currentPeriodEnd: null }), NOW)
    ).toBe(false);
  });
});

describe("employeeCapFor", () => {
  it("is 0 for a company that has never subscribed", () => {
    expect(employeeCapFor(null)).toBe(0);
  });

  it("is the plan's own cap with no extra seats", () => {
    expect(employeeCapFor(summary({ plan: "Starter" }))).toBe(10);
    expect(employeeCapFor(summary({ plan: "Growth" }))).toBe(20);
    expect(employeeCapFor(summary({ plan: "Scale" }))).toBe(50);
  });

  it("adds purchased extra seats on top of the plan cap", () => {
    expect(
      employeeCapFor(summary({ plan: "Starter", extraSeats: 7 }))
    ).toBe(17);
  });
});

import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIME_ZONE,
  dayKeyInZone,
  isValidTimeZone,
  resolveTimeZone,
  zoneForCountry,
} from "@/lib/timezone";

describe("isValidTimeZone", () => {
  it("accepts real IANA zones", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects garbage, including attacker-controlled cookie payloads", () => {
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("../../etc/passwd")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
  });
});

describe("zoneForCountry", () => {
  it("maps a known country code", () => {
    expect(zoneForCountry("IN")).toBe("Asia/Kolkata");
    expect(zoneForCountry("in")).toBe("Asia/Kolkata");
  });

  it("returns null for an unknown or missing country", () => {
    expect(zoneForCountry("ZZ")).toBeNull();
    expect(zoneForCountry(null)).toBeNull();
  });
});

describe("resolveTimeZone", () => {
  it("prefers a valid cookie over the country header", () => {
    expect(resolveTimeZone("America/Los_Angeles", "IN")).toBe("America/Los_Angeles");
  });

  it("falls back to the country header when the cookie is missing or invalid", () => {
    expect(resolveTimeZone(null, "IN")).toBe("Asia/Kolkata");
    expect(resolveTimeZone("../../etc/passwd", "GB")).toBe("Europe/London");
  });

  it("falls back to UTC when neither resolves", () => {
    expect(resolveTimeZone(null, null)).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone(undefined, "ZZ")).toBe(DEFAULT_TIME_ZONE);
  });
});

describe("dayKeyInZone", () => {
  it("buckets an instant into the correct local day", () => {
    // 19:30 UTC on 2026-03-10 is already past midnight in Kolkata (+5:30).
    const instant = new Date("2026-03-10T19:30:00.000Z");
    expect(dayKeyInZone(instant, "Asia/Kolkata")).toBe("2026-03-11");
    // ...but still 2026-03-10 on the US west coast.
    expect(dayKeyInZone(instant, "America/Los_Angeles")).toBe("2026-03-10");
    expect(dayKeyInZone(instant, "UTC")).toBe("2026-03-10");
  });

  it("is DST-correct across a spring-forward transition", () => {
    // America/New_York moved clocks forward on 2026-03-08.
    const beforeTransition = new Date("2026-03-08T06:00:00.000Z");
    expect(dayKeyInZone(beforeTransition, "America/New_York")).toBe("2026-03-08");
  });
});

import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIME_ZONE,
  dayKeyInZone,
  instantForLocalTime,
  isValidTimeZone,
  minutesToTimeInput,
  resolveTimeZone,
  timeInputToMinutes,
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

describe("instantForLocalTime", () => {
  it("resolves a wall-clock time to the instant it happens at", () => {
    // Asia/Kolkata is UTC+5:30 year-round, so 18:00 local is 12:30 UTC.
    expect(
      instantForLocalTime("2026-09-11", 18 * 60, "Asia/Kolkata").toISOString()
    ).toBe("2026-09-11T12:30:00.000Z");
  });

  it("is the inverse of dayKeyInZone", () => {
    const instant = instantForLocalTime("2026-09-11", 18 * 60, "Asia/Kolkata");
    expect(dayKeyInZone(instant, "Asia/Kolkata")).toBe("2026-09-11");
  });

  it("uses the offset in force on that date, not today's", () => {
    // New York is UTC-4 in September (EDT) and UTC-5 in January (EST), so the
    // same wall-clock time lands on a different UTC instant in each.
    expect(
      instantForLocalTime("2026-09-11", 18 * 60, "America/New_York").toISOString()
    ).toBe("2026-09-11T22:00:00.000Z");
    expect(
      instantForLocalTime("2026-01-15", 18 * 60, "America/New_York").toISOString()
    ).toBe("2026-01-15T23:00:00.000Z");
  });

  it("handles a day the clocks go forward", () => {
    // US DST starts 2026-03-08; 18:00 that evening is already EDT.
    const instant = instantForLocalTime("2026-03-08", 18 * 60, "America/New_York");

    expect(instant.toISOString()).toBe("2026-03-08T22:00:00.000Z");
    expect(dayKeyInZone(instant, "America/New_York")).toBe("2026-03-08");
  });

  it("round-trips midnight, where a naive offset flip would change the day", () => {
    const instant = instantForLocalTime("2026-09-11", 0, "Asia/Kolkata");

    expect(instant.toISOString()).toBe("2026-09-10T18:30:00.000Z");
    expect(dayKeyInZone(instant, "Asia/Kolkata")).toBe("2026-09-11");
  });
});

describe("time input conversion", () => {
  it("round-trips minutes through the HH:MM a time input holds", () => {
    expect(minutesToTimeInput(1080)).toBe("18:00");
    expect(minutesToTimeInput(0)).toBe("00:00");
    expect(minutesToTimeInput(9 * 60 + 5)).toBe("09:05");
    expect(timeInputToMinutes("18:00")).toBe(1080);
    expect(timeInputToMinutes("09:05")).toBe(9 * 60 + 5);
  });

  it("rejects anything that is not a time of day", () => {
    expect(timeInputToMinutes("24:00")).toBeNull();
    expect(timeInputToMinutes("18:60")).toBeNull();
    expect(timeInputToMinutes("6pm")).toBeNull();
    expect(timeInputToMinutes("")).toBeNull();
  });
});

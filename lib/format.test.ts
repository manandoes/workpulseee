import { describe, expect, it } from "vitest";
import { dateTimeParts, formatCountdown, formatDateTime } from "@/lib/format";

describe("dateTimeParts", () => {
  it("splits an instant into a date and a 12-hour time in the given zone", () => {
    // 10:35 UTC is 4:05 PM in Kolkata (UTC+5:30).
    expect(dateTimeParts("2026-03-12T10:35:00Z", "Asia/Kolkata")).toEqual({
      date: "12 Mar 2026",
      time: "4:05 PM",
    });
  });

  it("rolls the date over with the zone", () => {
    expect(
      dateTimeParts("2026-03-12T02:00:00Z", "America/New_York")?.date
    ).toBe("11 Mar 2026");
  });

  it("never labels the zone", () => {
    expect(formatDateTime("2026-03-12T10:35:00Z", "UTC")).toBe(
      "12 Mar 2026, 10:35 AM"
    );
  });

  it("returns null for a missing or invalid value", () => {
    expect(dateTimeParts(null, "UTC")).toBeNull();
    expect(dateTimeParts("not a date", "UTC")).toBeNull();
  });
});

describe("formatCountdown", () => {
  it("counts down while time is left", () => {
    expect(formatCountdown(15 * 60_000)).toBe("00:15:00");
    expect(formatCountdown(500)).toBe("00:00:01");
  });

  it("reads zero exactly at the limit", () => {
    expect(formatCountdown(0)).toBe("00:00:00");
  });

  it("goes negative past the limit", () => {
    expect(formatCountdown(-1)).toBe("-00:00:01");
    expect(formatCountdown(-(4 * 60_000 + 12_000))).toBe("-00:04:12");
  });
});

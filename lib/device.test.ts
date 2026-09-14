import { describe, expect, it } from "vitest";
import { attendanceAllowedOnDevice } from "@/lib/device";

describe("attendanceAllowedOnDevice", () => {
  it("allows a desktop browser (undefined device type)", () => {
    expect(attendanceAllowedOnDevice(undefined)).toBe(true);
  });

  it("blocks mobile", () => {
    expect(attendanceAllowedOnDevice("mobile")).toBe(false);
  });

  it("blocks tablet", () => {
    expect(attendanceAllowedOnDevice("tablet")).toBe(false);
  });

  it("allows device types the rule does not care about", () => {
    expect(attendanceAllowedOnDevice("smarttv")).toBe(true);
    expect(attendanceAllowedOnDevice("console")).toBe(true);
    expect(attendanceAllowedOnDevice("wearable")).toBe(true);
    expect(attendanceAllowedOnDevice("embedded")).toBe(true);
  });
});

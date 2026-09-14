import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getActor } from "@/lib/auth";
import { employeeActor, createTestCompany, createEmployee } from "@/lib/test-helpers";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({ getActor: vi.fn() }));

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function requestWithUserAgent(userAgent: string) {
  return new NextRequest("http://localhost/api/attendance/clock-in", {
    method: "POST",
    headers: { "user-agent": userAgent },
  });
}

describe("POST /api/attendance/clock-in", () => {
  beforeEach(() => {
    vi.mocked(getActor).mockReset();
  });

  it("refuses to clock in from a mobile device", async () => {
    const { companyId } = await createTestCompany();
    const employeeId = await createEmployee(companyId);
    vi.mocked(getActor).mockResolvedValue(employeeActor(companyId, employeeId));

    const response = await POST(requestWithUserAgent(MOBILE_UA));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.code).toBe("small_screen");
  });

  it("clocks in from a desktop device", async () => {
    const { companyId } = await createTestCompany();
    const employeeId = await createEmployee(companyId);
    vi.mocked(getActor).mockResolvedValue(employeeActor(companyId, employeeId));

    const response = await POST(requestWithUserAgent(DESKTOP_UA));

    expect(response.status).toBe(200);
  });
});

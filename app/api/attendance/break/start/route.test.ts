import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  companyActor,
  employeeActor,
  createTestCompany,
  createEmployee,
} from "@/lib/test-helpers";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({ getActor: vi.fn() }));

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function request(userAgent = DESKTOP_UA) {
  return new NextRequest("http://localhost/api/attendance/break/start", {
    method: "POST",
    headers: { "user-agent": userAgent },
  });
}

describe("POST /api/attendance/break/start", () => {
  beforeEach(() => {
    vi.mocked(getActor).mockReset();
  });

  it("refuses when the caller is not clocked in", async () => {
    const { companyId } = await createTestCompany();
    const employeeId = await createEmployee(companyId);
    vi.mocked(getActor).mockResolvedValue(employeeActor(companyId, employeeId));

    const response = await POST(request());

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("invalid_reference");
  });

  it("refuses from a mobile device even while clocked in", async () => {
    const { companyId } = await createTestCompany();
    const employeeId = await createEmployee(companyId);
    await db.attendanceRecord.create({
      data: { companyId, employeeId },
    });
    vi.mocked(getActor).mockResolvedValue(employeeActor(companyId, employeeId));

    const response = await POST(request(MOBILE_UA));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.code).toBe("small_screen");
  });

  it("starts a break, pausing a running task timer", async () => {
    const { companyId } = await createTestCompany();
    const employeeId = await createEmployee(companyId);
    const session = await db.attendanceRecord.create({
      data: { companyId, employeeId },
    });
    const task = await db.task.create({
      data: { companyId, title: "Ship it", assigneeId: employeeId },
    });
    const entry = await db.taskTimeEntry.create({
      data: { companyId, taskId: task.id, employeeId },
    });
    vi.mocked(getActor).mockResolvedValue(employeeActor(companyId, employeeId));

    const response = await POST(request());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.record.pausedTaskIds).toEqual([task.id]);

    const closedEntry = await db.taskTimeEntry.findUniqueOrThrow({
      where: { id: entry.id },
    });
    expect(closedEntry.endedAt).not.toBeNull();
    expect(closedEntry.endReason).toBe("Break");

    const openSession = await db.attendanceRecord.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(openSession.clockOutAt).toBeNull();
  });

  it("refuses a second break while one is already open", async () => {
    const { companyId } = await createTestCompany();
    const employeeId = await createEmployee(companyId);
    await db.attendanceRecord.create({ data: { companyId, employeeId } });
    vi.mocked(getActor).mockResolvedValue(employeeActor(companyId, employeeId));

    const first = await POST(request());
    expect(first.status).toBe(200);

    const second = await POST(request());
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.code).toBe("duplicate");
  });

  /**
   * Plan: attendance for all company accounts — a company account has no
   * running task timers to pause (it is never a task assignee), so this is
   * the natural no-op `attendance-data.ts` documents, not a failure.
   */
  it("starts a break for a company account, pausing nothing", async () => {
    const { companyId, ownerId } = await createTestCompany();
    await db.attendanceRecord.create({
      data: { companyId, accountId: ownerId },
    });
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, ownerId, "Owner")
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.record.pausedTaskIds).toEqual([]);

    const record = await db.breakRecord.findUniqueOrThrow({
      where: { id: body.record.id },
    });
    expect(record.accountId).toBe(ownerId);
    expect(record.employeeId).toBeNull();
  });
});

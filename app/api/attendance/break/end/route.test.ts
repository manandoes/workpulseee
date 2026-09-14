import { beforeEach, describe, expect, it, vi } from "vitest";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { employeeActor, createTestCompany, createEmployee } from "@/lib/test-helpers";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({ getActor: vi.fn() }));

describe("POST /api/attendance/break/end", () => {
  beforeEach(() => {
    vi.mocked(getActor).mockReset();
  });

  it("refuses when the caller is not on a break", async () => {
    const { companyId } = await createTestCompany();
    const employeeId = await createEmployee(companyId);
    vi.mocked(getActor).mockResolvedValue(employeeActor(companyId, employeeId));

    const response = await POST();

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("invalid_reference");
  });

  it("ends a break and resumes exactly the tasks it paused", async () => {
    const { companyId } = await createTestCompany();
    const employeeId = await createEmployee(companyId);
    const session = await db.attendanceRecord.create({
      data: { companyId, employeeId },
    });
    const pausedTask = await db.task.create({
      data: { companyId, title: "Paused", assigneeId: employeeId },
    });
    const untouchedTask = await db.task.create({
      data: { companyId, title: "Never timed", assigneeId: employeeId },
    });
    const brk = await db.breakRecord.create({
      data: {
        companyId,
        employeeId,
        attendanceRecordId: session.id,
        pausedTaskIds: [pausedTask.id],
      },
    });
    vi.mocked(getActor).mockResolvedValue(employeeActor(companyId, employeeId));

    const response = await POST();

    expect(response.status).toBe(200);

    const closedBreak = await db.breakRecord.findUniqueOrThrow({
      where: { id: brk.id },
    });
    expect(closedBreak.endedAt).not.toBeNull();

    const resumedEntries = await db.taskTimeEntry.findMany({
      where: { companyId, employeeId },
    });
    expect(resumedEntries).toHaveLength(1);
    expect(resumedEntries[0].taskId).toBe(pausedTask.id);
    expect(resumedEntries[0].endedAt).toBeNull();
    expect(resumedEntries.some((e) => e.taskId === untouchedTask.id)).toBe(
      false
    );
  });

  it("resumes nothing for a break that paused no tasks", async () => {
    const { companyId } = await createTestCompany();
    const employeeId = await createEmployee(companyId);
    const session = await db.attendanceRecord.create({
      data: { companyId, employeeId },
    });
    await db.breakRecord.create({
      data: {
        companyId,
        employeeId,
        attendanceRecordId: session.id,
        pausedTaskIds: [],
      },
    });
    vi.mocked(getActor).mockResolvedValue(employeeActor(companyId, employeeId));

    const response = await POST();

    expect(response.status).toBe(200);
    const entries = await db.taskTimeEntry.findMany({
      where: { companyId, employeeId },
    });
    expect(entries).toHaveLength(0);
  });
});

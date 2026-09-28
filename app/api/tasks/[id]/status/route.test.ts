import { beforeEach, describe, expect, it, vi } from "vitest";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  companyActor,
  createClient,
  createCompanyAccount,
  createEmployee,
  createProject,
  createTask,
  createTestCompany,
  employeeActor,
  jsonRequest,
} from "@/lib/test-helpers";
import { PATCH } from "./route";

vi.mock("@/lib/auth", () => ({ getActor: vi.fn() }));

describe("PATCH /api/tasks/[id]/status", () => {
  beforeEach(() => {
    vi.mocked(getActor).mockReset();
  });

  it("lets the assigned employee move their own task (Phases.md Phase 10)", async () => {
    const { companyId } = await createTestCompany();
    const employeeId = await createEmployee(companyId);
    const clientId = await createClient(companyId);
    const projectId = await createProject(companyId, clientId);
    const taskId = await createTask(companyId, projectId, {
      assigneeId: employeeId,
    });
    vi.mocked(getActor).mockResolvedValue(employeeActor(companyId, employeeId));

    const response = await PATCH(
      jsonRequest(`http://localhost/api/tasks/${taskId}/status`, "PATCH", {
        status: "InProgress",
      }),
      { params: Promise.resolve({ id: taskId }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.task.status).toBe("InProgress");
  });

  it("refuses a different employee moving someone else's task", async () => {
    const { companyId } = await createTestCompany();
    const employeeId = await createEmployee(companyId);
    const otherEmployeeId = await createEmployee(companyId);
    const clientId = await createClient(companyId);
    const projectId = await createProject(companyId, clientId);
    const taskId = await createTask(companyId, projectId, {
      assigneeId: employeeId,
    });
    vi.mocked(getActor).mockResolvedValue(
      employeeActor(companyId, otherEmployeeId)
    );

    const response = await PATCH(
      jsonRequest(`http://localhost/api/tasks/${taskId}/status`, "PATCH", {
        status: "Done",
      }),
      { params: Promise.resolve({ id: taskId }) }
    );

    expect(response.status).toBe(403);
  });

  it("lets a Manager who leads the project move it too", async () => {
    const { companyId } = await createTestCompany();
    const managerId = await createCompanyAccount(companyId, "Manager");
    const clientId = await createClient(companyId);
    const projectId = await createProject(companyId, clientId, {
      leadAccountId: managerId,
    });
    const taskId = await createTask(companyId, projectId);
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, managerId, "Manager")
    );

    const response = await PATCH(
      jsonRequest(`http://localhost/api/tasks/${taskId}/status`, "PATCH", {
        status: "Done",
      }),
      { params: Promise.resolve({ id: taskId }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.task.completedAt).not.toBeNull();
  });

  it("stores an optional completion note on Done and clears it on reopen", async () => {
    const { companyId } = await createTestCompany();
    const employeeId = await createEmployee(companyId);
    const taskId = await createTask(companyId, null, { assigneeId: employeeId });
    vi.mocked(getActor).mockResolvedValue(employeeActor(companyId, employeeId));

    const done = await PATCH(
      jsonRequest(`http://localhost/api/tasks/${taskId}/status`, "PATCH", {
        status: "Done",
        completionNote: "  Deployed; see PR 12  ",
      }),
      { params: Promise.resolve({ id: taskId }) }
    );
    expect(done.status).toBe(200);
    expect((await done.json()).task.completionNote).toBe("Deployed; see PR 12");

    const reopened = await PATCH(
      jsonRequest(`http://localhost/api/tasks/${taskId}/status`, "PATCH", {
        status: "InProgress",
      }),
      { params: Promise.resolve({ id: taskId }) }
    );
    expect(reopened.status).toBe(200);
    const row = await db.task.findUniqueOrThrow({
      where: { id: taskId },
      select: { completionNote: true, completedAt: true },
    });
    expect(row).toEqual({ completionNote: null, completedAt: null });
  });

  it("finishes a task without a note, since the note is optional", async () => {
    const { companyId } = await createTestCompany();
    const employeeId = await createEmployee(companyId);
    const taskId = await createTask(companyId, null, { assigneeId: employeeId });
    vi.mocked(getActor).mockResolvedValue(employeeActor(companyId, employeeId));

    const response = await PATCH(
      jsonRequest(`http://localhost/api/tasks/${taskId}/status`, "PATCH", {
        status: "Done",
      }),
      { params: Promise.resolve({ id: taskId }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.task.status).toBe("Done");
    expect(body.task.completionNote).toBeNull();
  });

  it("lets the HR login a task was allotted to move it", async () => {
    const { companyId, ownerId } = await createTestCompany();
    const hrId = await createCompanyAccount(companyId, "HRHead");
    const taskId = await createTask(companyId, null, { createdById: ownerId });
    await db.task.update({
      where: { id: taskId },
      data: { assigneeAccountId: hrId },
    });
    vi.mocked(getActor).mockResolvedValue(companyActor(companyId, hrId, "HRHead"));

    const response = await PATCH(
      jsonRequest(`http://localhost/api/tasks/${taskId}/status`, "PATCH", {
        status: "Done",
      }),
      { params: Promise.resolve({ id: taskId }) }
    );

    expect(response.status).toBe(200);
  });
});

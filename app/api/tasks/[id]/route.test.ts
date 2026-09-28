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
  jsonRequest,
} from "@/lib/test-helpers";
import { PATCH, DELETE } from "./route";

vi.mock("@/lib/auth", () => ({ getActor: vi.fn() }));

describe("PATCH /api/tasks/[id]", () => {
  beforeEach(() => {
    vi.mocked(getActor).mockReset();
  });

  it("lets a Manager edit a task on a project they lead", async () => {
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
      jsonRequest(`http://localhost/api/tasks/${taskId}`, "PATCH", {
        title: "Renamed",
        projectId,
      }),
      { params: Promise.resolve({ id: taskId }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.task.title).toBe("Renamed");
  });

  it("refuses a Manager editing a task on a project they do not lead", async () => {
    const { companyId } = await createTestCompany();
    const managerId = await createCompanyAccount(companyId, "Manager");
    const otherManagerId = await createCompanyAccount(companyId, "Manager");
    const clientId = await createClient(companyId);
    const projectId = await createProject(companyId, clientId, {
      leadAccountId: otherManagerId,
    });
    const taskId = await createTask(companyId, projectId);
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, managerId, "Manager")
    );

    const response = await PATCH(
      jsonRequest(`http://localhost/api/tasks/${taskId}`, "PATCH", {
        title: "Should not work",
        projectId,
      }),
      { params: Promise.resolve({ id: taskId }) }
    );

    expect(response.status).toBe(403);
  });

  it("lets a standalone task's creator edit it", async () => {
    const { companyId } = await createTestCompany();
    const managerId = await createCompanyAccount(companyId, "Manager");
    const taskId = await createTask(companyId, null, {
      createdById: managerId,
    });
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, managerId, "Manager")
    );

    const response = await PATCH(
      jsonRequest(`http://localhost/api/tasks/${taskId}`, "PATCH", {
        title: "Renamed personal task",
        projectId: "",
      }),
      { params: Promise.resolve({ id: taskId }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.task.title).toBe("Renamed personal task");
  });

  it("refuses another company account editing someone else's standalone task", async () => {
    const { companyId } = await createTestCompany();
    const managerId = await createCompanyAccount(companyId, "Manager");
    const otherManagerId = await createCompanyAccount(companyId, "Manager");
    const taskId = await createTask(companyId, null, {
      createdById: managerId,
    });
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, otherManagerId, "Manager")
    );

    const response = await PATCH(
      jsonRequest(`http://localhost/api/tasks/${taskId}`, "PATCH", {
        title: "Should not work",
        projectId: "",
      }),
      { params: Promise.resolve({ id: taskId }) }
    );

    expect(response.status).toBe(403);
  });

  it("404s for a task id from another company", async () => {
    const { companyId, ownerId } = await createTestCompany();
    const { companyId: otherCompanyId } = await createTestCompany();
    const clientId = await createClient(otherCompanyId);
    const projectId = await createProject(otherCompanyId, clientId);
    const taskId = await createTask(otherCompanyId, projectId);
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, ownerId, "Owner")
    );

    const response = await PATCH(
      jsonRequest(`http://localhost/api/tasks/${taskId}`, "PATCH", {
        title: "Cross-tenant",
        projectId,
      }),
      { params: Promise.resolve({ id: taskId }) }
    );

    expect(response.status).toBe(404);
  });
});

/** Plan: allot tasks to a Manager or HR, and Plan: completion note. */
describe("PATCH /api/tasks/[id] — assignee kinds and completion note", () => {
  beforeEach(() => {
    vi.mocked(getActor).mockReset();
  });

  it("hands a task from an employee to an HR login, clearing the employee", async () => {
    const { companyId, ownerId } = await createTestCompany();
    const employeeId = await createEmployee(companyId);
    const hrId = await createCompanyAccount(companyId, "HRHead");
    const taskId = await createTask(companyId, null, {
      assigneeId: employeeId,
      createdById: ownerId,
    });
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, ownerId, "Owner")
    );

    const response = await PATCH(
      jsonRequest(`http://localhost/api/tasks/${taskId}`, "PATCH", {
        title: "Handed to HR",
        projectId: "",
        clientId: "",
        assigneeId: "",
        assigneeAccountId: hrId,
      }),
      { params: Promise.resolve({ id: taskId }) }
    );

    expect(response.status).toBe(200);
    const stored = await db.task.findUniqueOrThrow({
      where: { id: taskId },
      select: { assigneeId: true, assigneeAccountId: true },
    });
    expect(stored).toEqual({ assigneeId: null, assigneeAccountId: hrId });
    const notified = await db.notification.count({
      where: { companyId, recipientAccountId: hrId, type: "TaskAssigned" },
    });
    expect(notified).toBe(1);
  });

  it("keeps a finished task's note through an unrelated save", async () => {
    const { companyId, ownerId } = await createTestCompany();
    const taskId = await createTask(companyId, null, { createdById: ownerId });
    await db.task.update({
      where: { id: taskId },
      data: {
        status: "Done",
        completedAt: new Date(),
        completionNote: "Shipped",
      },
    });
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, ownerId, "Owner")
    );

    const response = await PATCH(
      jsonRequest(`http://localhost/api/tasks/${taskId}`, "PATCH", {
        title: "Renamed after it was done",
        projectId: "",
        clientId: "",
      }),
      { params: Promise.resolve({ id: taskId }) }
    );

    expect(response.status).toBe(200);
    const stored = await db.task.findUniqueOrThrow({
      where: { id: taskId },
      select: { status: true, completionNote: true },
    });
    expect(stored).toEqual({ status: "Done", completionNote: "Shipped" });
  });
});

describe("DELETE /api/tasks/[id]", () => {
  beforeEach(() => {
    vi.mocked(getActor).mockReset();
  });

  it("soft-deletes a task an Owner may manage", async () => {
    const { companyId, ownerId } = await createTestCompany();
    const clientId = await createClient(companyId);
    const projectId = await createProject(companyId, clientId);
    const taskId = await createTask(companyId, projectId);
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, ownerId, "Owner")
    );

    const response = await DELETE(
      jsonRequest(`http://localhost/api/tasks/${taskId}`, "DELETE"),
      { params: Promise.resolve({ id: taskId }) }
    );

    expect(response.status).toBe(200);
    const stored = await db.task.findUnique({ where: { id: taskId } });
    expect(stored?.deletedAt).not.toBeNull();
  });
});

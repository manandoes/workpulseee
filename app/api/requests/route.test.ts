import { beforeEach, describe, expect, it, vi } from "vitest";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  companyActor,
  createCompanyAccount,
  createEmployee,
  createTestCompany,
  employeeActor,
  jsonRequest,
} from "@/lib/test-helpers";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({ getActor: vi.fn() }));

describe("POST /api/requests", () => {
  beforeEach(() => {
    vi.mocked(getActor).mockReset();
  });

  it("lets an employee submit a leave request", async () => {
    const { companyId, ownerId } = await createTestCompany();
    const employeeId = await createEmployee(companyId);
    vi.mocked(getActor).mockResolvedValue(employeeActor(companyId, employeeId));

    const response = await POST(
      jsonRequest("http://localhost/api/requests", "POST", {
        type: "Leave",
        subject: "Annual leave",
        description: "A week off",
        startDate: "2026-10-01",
        endDate: "2026-10-05",
        requestedApproverAccountId: ownerId,
      })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.request.status).toBe("Pending");

    const stored = await db.request.findUnique({
      where: { id: body.request.id },
    });
    expect(stored?.employeeId).toBe(employeeId);
  });

  it("400s a Leave request missing its date range", async () => {
    const { companyId } = await createTestCompany();
    const employeeId = await createEmployee(companyId);
    vi.mocked(getActor).mockResolvedValue(employeeActor(companyId, employeeId));

    const response = await POST(
      jsonRequest("http://localhost/api/requests", "POST", {
        type: "Leave",
        subject: "Annual leave",
        description: "A week off",
      })
    );

    expect(response.status).toBe(400);
  });

  /**
   * Plan: access levels — the chosen approver must be someone in the same
   * company who may decide it right now; otherwise the submission
   * notification (name and subject) would reach another tenant, or the
   * request would sit with someone who can never act on it.
   */
  describe("the chosen approver", () => {
    const leave = {
      type: "Leave",
      subject: "Annual leave",
      description: "A week off",
      startDate: "2026-10-01",
      endDate: "2026-10-05",
    };

    it("refuses a login from another company", async () => {
      const { companyId } = await createTestCompany();
      const other = await createTestCompany();
      const employeeId = await createEmployee(companyId);
      vi.mocked(getActor).mockResolvedValue(
        employeeActor(companyId, employeeId)
      );

      const response = await POST(
        jsonRequest("http://localhost/api/requests", "POST", {
          ...leave,
          requestedApproverAccountId: other.ownerId,
        })
      );

      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe("invalid_reference");
      expect(await db.request.count({ where: { employeeId } })).toBe(0);
    });

    it("refuses someone the Owner switched approvals off for", async () => {
      const { companyId, ownerId } = await createTestCompany();
      const managerId = await createCompanyAccount(companyId, "Manager");
      await db.permissionGrant.create({
        data: {
          companyId,
          accountId: managerId,
          permission: "DecideRequests",
          effect: "Revoke",
          grantedById: ownerId,
        },
      });
      const employeeId = await createEmployee(companyId);
      vi.mocked(getActor).mockResolvedValue(
        employeeActor(companyId, employeeId)
      );

      const response = await POST(
        jsonRequest("http://localhost/api/requests", "POST", {
          ...leave,
          requestedApproverAccountId: managerId,
        })
      );

      expect(response.status).toBe(400);
    });

    it("refuses an employee who holds no approval power", async () => {
      const { companyId } = await createTestCompany();
      const employeeId = await createEmployee(companyId);
      const colleagueId = await createEmployee(companyId);
      vi.mocked(getActor).mockResolvedValue(
        employeeActor(companyId, employeeId)
      );

      const response = await POST(
        jsonRequest("http://localhost/api/requests", "POST", {
          ...leave,
          requestedApproverEmployeeId: colleagueId,
        })
      );

      expect(response.status).toBe(400);
    });

    it("accepts an employee the Owner switched approvals on for", async () => {
      const { companyId, ownerId } = await createTestCompany();
      const employeeId = await createEmployee(companyId);
      const approverId = await createEmployee(companyId);
      await db.permissionGrant.create({
        data: {
          companyId,
          employeeId: approverId,
          permission: "DecideRequests",
          grantedById: ownerId,
        },
      });
      vi.mocked(getActor).mockResolvedValue(
        employeeActor(companyId, employeeId)
      );

      const response = await POST(
        jsonRequest("http://localhost/api/requests", "POST", {
          ...leave,
          requestedApproverEmployeeId: approverId,
        })
      );

      expect(response.status).toBe(201);
    });
  });

  it("refuses a company account submitting a request", async () => {
    const { companyId, ownerId } = await createTestCompany();
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, ownerId, "Owner")
    );

    const response = await POST(
      jsonRequest("http://localhost/api/requests", "POST", {
        type: "HR",
        subject: "Question",
        description: "Just a question",
      })
    );

    expect(response.status).toBe(403);
  });
});

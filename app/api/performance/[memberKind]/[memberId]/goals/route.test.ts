import { beforeEach, describe, expect, it, vi } from "vitest";
import { getActor } from "@/lib/auth";
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

describe("POST /api/performance/[memberKind]/[memberId]/goals", () => {
  beforeEach(() => {
    vi.mocked(getActor).mockReset();
  });

  it("lets a Manager set a goal for their direct report", async () => {
    const { companyId } = await createTestCompany();
    const managerId = await createCompanyAccount(companyId, "Manager");
    const employeeId = await createEmployee(companyId, {
      managerAccountId: managerId,
    });
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, managerId, "Manager")
    );

    const response = await POST(
      jsonRequest(
        `http://localhost/api/performance/employee/${employeeId}/goals`,
        "POST",
        { title: "Ship the redesign" }
      ),
      { params: Promise.resolve({ memberKind: "employee", memberId: employeeId }) }
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.goal).toMatchObject({
      title: "Ship the redesign",
      status: "Active",
    });
  });

  it("refuses an employee setting their own goal", async () => {
    const { companyId } = await createTestCompany();
    const employeeId = await createEmployee(companyId);
    vi.mocked(getActor).mockResolvedValue(employeeActor(companyId, employeeId));

    const response = await POST(
      jsonRequest(
        `http://localhost/api/performance/employee/${employeeId}/goals`,
        "POST",
        { title: "Self-assigned goal" }
      ),
      { params: Promise.resolve({ memberKind: "employee", memberId: employeeId }) }
    );

    expect(response.status).toBe(403);
  });

  it("refuses a Manager who is not this employee's manager", async () => {
    const { companyId } = await createTestCompany();
    const managerId = await createCompanyAccount(companyId, "Manager");
    const employeeId = await createEmployee(companyId);
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, managerId, "Manager")
    );

    const response = await POST(
      jsonRequest(
        `http://localhost/api/performance/employee/${employeeId}/goals`,
        "POST",
        { title: "Not your report" }
      ),
      { params: Promise.resolve({ memberKind: "employee", memberId: employeeId }) }
    );

    expect(response.status).toBe(403);
  });

  /**
   * Plan: performance for all company accounts — an Owner may set a goal for
   * another company account (e.g. a Manager or HR), written with `accountId`
   * not `employeeId`.
   */
  it("lets an Owner set a goal for a company account", async () => {
    const { companyId, ownerId } = await createTestCompany();
    const managerId = await createCompanyAccount(companyId, "Manager");
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, ownerId, "Owner")
    );

    const response = await POST(
      jsonRequest(
        `http://localhost/api/performance/account/${managerId}/goals`,
        "POST",
        { title: "Hit the hiring target" }
      ),
      { params: Promise.resolve({ memberKind: "account", memberId: managerId }) }
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.goal).toMatchObject({
      title: "Hit the hiring target",
      status: "Active",
    });
  });

  it("refuses a Manager setting a goal for another company account", async () => {
    const { companyId } = await createTestCompany();
    const managerId = await createCompanyAccount(companyId, "Manager");
    const hrId = await createCompanyAccount(companyId, "HR");
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, managerId, "Manager")
    );

    const response = await POST(
      jsonRequest(
        `http://localhost/api/performance/account/${hrId}/goals`,
        "POST",
        { title: "Not yours to set" }
      ),
      { params: Promise.resolve({ memberKind: "account", memberId: hrId }) }
    );

    expect(response.status).toBe(403);
  });
});

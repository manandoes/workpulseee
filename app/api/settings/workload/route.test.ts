import { beforeEach, describe, expect, it, vi } from "vitest";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  companyActor,
  createCompanyAccount,
  createTestCompany,
  jsonRequest,
} from "@/lib/test-helpers";
import { PATCH } from "./route";

vi.mock("@/lib/auth", () => ({ getActor: vi.fn() }));

describe("PATCH /api/settings/workload", () => {
  beforeEach(() => {
    vi.mocked(getActor).mockReset();
  });

  it("lets a Manager change the weekly capacity", async () => {
    const { companyId } = await createTestCompany();
    const managerId = await createCompanyAccount(companyId, "Manager");
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, managerId, "Manager")
    );

    const response = await PATCH(
      jsonRequest("http://localhost/api/settings/workload", "PATCH", {
        weeklyCapacityHours: "35",
      })
    );

    expect(response.status).toBe(200);
    const stored = await db.company.findUnique({ where: { id: companyId } });
    expect(stored?.weeklyCapacityHours).toBe(35);
  });

  it("refuses an HR account", async () => {
    const { companyId } = await createTestCompany();
    const hrId = await createCompanyAccount(companyId, "HRHead");
    vi.mocked(getActor).mockResolvedValue(companyActor(companyId, hrId, "HRHead"));

    const response = await PATCH(
      jsonRequest("http://localhost/api/settings/workload", "PATCH", {
        weeklyCapacityHours: "35",
      })
    );

    expect(response.status).toBe(403);
  });

  it("400s an out-of-range value", async () => {
    const { companyId, ownerId } = await createTestCompany();
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, ownerId, "Owner")
    );

    const response = await PATCH(
      jsonRequest("http://localhost/api/settings/workload", "PATCH", {
        weeklyCapacityHours: "999",
      })
    );

    expect(response.status).toBe(400);
  });
});

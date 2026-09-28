import { beforeEach, describe, expect, it, vi } from "vitest";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  companyActor,
  createCompanyAccount,
  createEmployee,
  createTestCompany,
  jsonRequest,
} from "@/lib/test-helpers";
import { GET, POST } from "./route";
import { POST as RESET } from "./reset/route";
import { GET as HISTORY } from "./history/route";
import { PATCH as CHANGE_LEVEL } from "../company-accounts/[id]/route";

vi.mock("@/lib/auth", () => ({ getActor: vi.fn() }));

/**
 * The Owner's Authority page (Plan: access levels): per-person switches over
 * level defaults, level changes, and the change history — all against a real
 * database, like every other route test here.
 */

function setPower(body: unknown) {
  return POST(
    jsonRequest("http://localhost/api/permission-grants", "POST", body)
  );
}

async function historyKinds(kind: "employee" | "account", id: string) {
  const response = await HISTORY(
    jsonRequest(
      `http://localhost/api/permission-grants/history?kind=${kind}&id=${id}`,
      "GET"
    )
  );
  const body = await response.json();
  return (body.history as { kind: string }[]).map((entry) => entry.kind).sort();
}

function changeLevel(id: string, role: string) {
  return CHANGE_LEVEL(
    jsonRequest(`http://localhost/api/company-accounts/${id}`, "PATCH", {
      role,
    }),
    { params: Promise.resolve({ id }) }
  );
}

describe("the Authority API", () => {
  beforeEach(() => {
    vi.mocked(getActor).mockReset();
  });

  it("lists everyone with their level and overrides, for the Owner only", async () => {
    const { companyId, ownerId } = await createTestCompany();
    const hrId = await createCompanyAccount(companyId, "HRTeam");
    const employeeId = await createEmployee(companyId);
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, ownerId, "Owner")
    );

    const response = await GET();
    expect(response.status).toBe(200);
    const { people } = await response.json();
    expect(people).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "account",
          id: hrId,
          level: "HRTeam",
          grants: [],
          revokes: [],
        }),
        expect.objectContaining({
          kind: "employee",
          id: employeeId,
          level: "Employee",
        }),
      ])
    );

    // Not even an Admin: handing out powers is the Owner's alone.
    const adminId = await createCompanyAccount(companyId, "Admin");
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, adminId, "Admin")
    );
    expect((await GET()).status).toBe(403);
    expect(
      (
        await setPower({
          subject: { kind: "account", id: hrId },
          permission: "ManagePayroll",
          enabled: true,
        })
      ).status
    ).toBe(403);
  });

  it("switches a level default off and back on, storing only the difference", async () => {
    const { companyId, ownerId } = await createTestCompany();
    const hrId = await createCompanyAccount(companyId, "HRHead");
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, ownerId, "Owner")
    );
    const subject = { kind: "account", id: hrId };

    const off = await setPower({
      subject,
      permission: "ManagePayroll",
      enabled: false,
    });
    expect(off.status).toBe(200);
    expect(
      await db.permissionGrant.findMany({
        where: { accountId: hrId },
        select: { permission: true, effect: true, grantedById: true },
      })
    ).toEqual([
      { permission: "ManagePayroll", effect: "Revoke", grantedById: ownerId },
    ]);

    // Back to the level default: the override disappears rather than
    // becoming a redundant Grant.
    const on = await setPower({
      subject,
      permission: "ManagePayroll",
      enabled: true,
    });
    expect(on.status).toBe(200);
    expect(await db.permissionGrant.count({ where: { accountId: hrId } })).toBe(
      0
    );

    // Asking for the state they already have changes nothing, logs nothing.
    await setPower({ subject, permission: "ManagePayroll", enabled: true });
    expect(await historyKinds("account", hrId)).toEqual([
      "PowerOff",
      "PowerOn",
    ]);
  });

  it("grants an employee a power their level lacks, but never one an employee login can't hold", async () => {
    const { companyId, ownerId } = await createTestCompany();
    const employeeId = await createEmployee(companyId);
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, ownerId, "Owner")
    );
    const subject = { kind: "employee", id: employeeId };

    const granted = await setPower({
      subject,
      permission: "ViewAttendance",
      enabled: true,
    });
    expect(granted.status).toBe(200);
    expect(
      await db.permissionGrant.findFirst({
        where: { employeeId, permission: "ViewAttendance" },
        select: { effect: true },
      })
    ).toEqual({ effect: "Grant" });

    const refused = await setPower({
      subject,
      permission: "ManagePayroll",
      enabled: true,
    });
    expect(refused.status).toBe(400);
    expect((await refused.json()).code).toBe("needs_company_login");
  });

  it("never lets the Owner's own access change", async () => {
    const { companyId, ownerId } = await createTestCompany();
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, ownerId, "Owner")
    );

    const response = await setPower({
      subject: { kind: "account", id: ownerId },
      permission: "ManagePayroll",
      enabled: false,
    });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("owner_locked");
  });

  it("reads a person from another company as not found", async () => {
    const { companyId, ownerId } = await createTestCompany();
    const other = await createTestCompany();
    const strangerId = await createEmployee(other.companyId);
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, ownerId, "Owner")
    );

    const response = await setPower({
      subject: { kind: "employee", id: strangerId },
      permission: "ViewAttendance",
      enabled: true,
    });
    expect(response.status).toBe(404);
    expect(
      await db.permissionGrant.count({ where: { employeeId: strangerId } })
    ).toBe(0);
  });

  it("resets every override in one go", async () => {
    const { companyId, ownerId } = await createTestCompany();
    const managerId = await createCompanyAccount(companyId, "Manager");
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, ownerId, "Owner")
    );
    const subject = { kind: "account", id: managerId };

    await setPower({ subject, permission: "ViewAttendance", enabled: true });
    await setPower({
      subject,
      permission: "ManageClientVault",
      enabled: false,
    });
    expect(
      await db.permissionGrant.count({ where: { accountId: managerId } })
    ).toBe(2);

    const response = await RESET(
      jsonRequest("http://localhost/api/permission-grants/reset", "POST", {
        subject,
      })
    );
    expect(response.status).toBe(200);
    expect(
      await db.permissionGrant.count({ where: { accountId: managerId } })
    ).toBe(0);
    expect(await historyKinds("account", managerId)).toEqual([
      "PowerOff",
      "PowerOn",
      "Reset",
    ]);
  });
});

describe("PATCH /api/company-accounts/[id] (level change)", () => {
  beforeEach(() => {
    vi.mocked(getActor).mockReset();
  });

  it("moves a login to another level and clears the old level's overrides", async () => {
    const { companyId, ownerId } = await createTestCompany();
    const hrId = await createCompanyAccount(companyId, "HRTeam");
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, ownerId, "Owner")
    );
    await setPower({
      subject: { kind: "account", id: hrId },
      permission: "ViewFinancials",
      enabled: true,
    });

    const response = await changeLevel(hrId, "HRHead");
    expect(response.status).toBe(200);

    const account = await db.companyAccount.findUnique({
      where: { id: hrId },
      select: { role: true },
    });
    expect(account?.role).toBe("HRHead");
    expect(await db.permissionGrant.count({ where: { accountId: hrId } })).toBe(
      0
    );

    const change = await db.permissionChange.findFirst({
      where: { accountId: hrId, kind: "LevelChanged" },
      select: { fromRole: true, toRole: true, changedById: true },
    });
    expect(change).toEqual({
      fromRole: "HRTeam",
      toRole: "HRHead",
      changedById: ownerId,
    });
  });

  it("never moves the Owner, and never makes anyone Owner", async () => {
    const { companyId, ownerId } = await createTestCompany();
    const managerId = await createCompanyAccount(companyId, "Manager");
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, ownerId, "Owner")
    );

    const moveOwner = await changeLevel(ownerId, "Admin");
    expect(moveOwner.status).toBe(400);

    const makeOwner = await changeLevel(managerId, "Owner");
    expect(makeOwner.status).toBe(400);
    const account = await db.companyAccount.findUnique({
      where: { id: managerId },
      select: { role: true },
    });
    expect(account?.role).toBe("Manager");
  });

  it("is Owner-only — an Admin cannot change levels", async () => {
    const { companyId } = await createTestCompany();
    const adminId = await createCompanyAccount(companyId, "Admin");
    const managerId = await createCompanyAccount(companyId, "Manager");
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, adminId, "Admin")
    );

    expect((await changeLevel(managerId, "Admin")).status).toBe(403);
  });
});

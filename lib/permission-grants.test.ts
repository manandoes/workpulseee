import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_LEVELS,
  canHoldPower,
  LEVEL_DEFAULTS,
  POWERS,
  splitOverrides,
} from "@/lib/permission-grants";

/**
 * The level matrix the user confirmed for Plan: access levels, pinned so a
 * later edit to `LEVEL_DEFAULTS` cannot quietly change who sees what.
 */
describe("LEVEL_DEFAULTS", () => {
  it("makes HR Team exactly HR Head minus salary/payroll and HR policies", () => {
    const onlyHead = LEVEL_DEFAULTS.HRHead.filter(
      (power) => !LEVEL_DEFAULTS.HRTeam.includes(power)
    );
    expect(onlyHead.sort()).toEqual(["ManageHrPolicies", "ManagePayroll"]);
    expect(
      LEVEL_DEFAULTS.HRTeam.every((power) =>
        LEVEL_DEFAULTS.HRHead.includes(power)
      )
    ).toBe(true);
  });

  it("gives Managers work data and none of the private data", () => {
    for (const privatePower of [
      "ViewPersonalDetails",
      "ViewAttendance",
      "ManagePayroll",
    ] as const) {
      expect(LEVEL_DEFAULTS.Manager).not.toContain(privatePower);
    }
    // The user chose company-wide performance for Managers.
    expect(LEVEL_DEFAULTS.Manager).toContain("ViewPerformance");
    expect(LEVEL_DEFAULTS.Manager).not.toContain("ManageEmployees");
  });

  it("gives an Employee nothing by default, and Admin everything", () => {
    expect(LEVEL_DEFAULTS.Employee).toEqual([]);
    expect([...LEVEL_DEFAULTS.Admin].sort()).toEqual(
      POWERS.map((power) => power.value).sort()
    );
  });

  it("only ever offers powers that exist in the catalog", () => {
    const catalog = new Set(POWERS.map((power) => power.value));
    for (const powers of Object.values(LEVEL_DEFAULTS)) {
      for (const power of powers) expect(catalog.has(power)).toBe(true);
    }
  });

  it("never lets the Owner level be handed out", () => {
    expect(ASSIGNABLE_LEVELS).not.toContain("Owner");
  });
});

describe("canHoldPower", () => {
  it("lets a company login hold anything", () => {
    for (const power of POWERS) {
      expect(canHoldPower("company", power.value)).toBe(true);
    }
  });

  it("keeps authored and vault powers away from employee logins", () => {
    expect(canHoldPower("employee", "ViewAttendance")).toBe(true);
    expect(canHoldPower("employee", "DecideRequests")).toBe(true);
    expect(canHoldPower("employee", "ManagePayroll")).toBe(false);
    expect(canHoldPower("employee", "ManagePerformance")).toBe(false);
    expect(canHoldPower("employee", "ManageClientVault")).toBe(false);
  });
});

describe("splitOverrides", () => {
  it("splits stored rows into grants and revokes", () => {
    expect(
      splitOverrides([
        { permission: "ViewAttendance", effect: "Grant" },
        { permission: "ManagePayroll", effect: "Revoke" },
        { permission: "ManageRecruitment", effect: "Grant" },
      ])
    ).toEqual({
      grants: ["ViewAttendance", "ManageRecruitment"],
      revokes: ["ManagePayroll"],
    });
  });
});

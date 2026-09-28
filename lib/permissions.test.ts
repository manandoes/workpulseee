import { describe, expect, it } from "vitest";
import {
  canAssignTaskToAccount,
  canApproveRequests,
  canCreateProjects,
  canDecideOnRequest,
  canManageClients,
  canManageProject,
  canManageTask,
  canUpdateTaskStatus,
  canViewFinancials,
  canViewProjects,
  canViewTasks,
  canManageCompanyAccounts,
  canManageEmployees,
  canViewPersonalDetails,
  canViewAttendance,
  canViewAccountDetails,
  isDirectReport,
  canManageCompanySettings,
  canManageWorkloadSettings,
  canViewAllEmployees,
  canViewPerformance,
  canViewAllPerformance,
  canViewAccountPerformance,
  canManagePerformance,
  canManageAccountPerformance,
  canManagePermissionGrants,
  canManageClientVault,
  has,
  INVITABLE_ROLES,
  isCompanyAdmin,
  landingPathFor,
  navigationFor,
  canSendBulkEmail,
  canManageBreakAllowance,
  canManagePayroll,
  canManageRecruitment,
  canViewSalarySlip,
  type AppRole,
  type SessionActor,
} from "@/lib/permissions";

const companyActor = (role: AppRole): SessionActor => ({
  id: "acct_1",
  companyId: "company_a",
  role,
  accountType: "company",
  grants: [],
  revokes: [],
});

const employeeActor: SessionActor = {
  id: "emp_1",
  companyId: "company_a",
  role: "Employee",
  accountType: "employee",
  grants: [],
  revokes: [],
};

/** Both HR levels — most HR rules hold for either. */
const HR_LEVELS: AppRole[] = ["HRHead", "HRTeam"];
/** Owner, Admin and both HR levels — the people-data group. */
const ADMIN_AND_HR: AppRole[] = ["Owner", "Admin", ...HR_LEVELS];
/** Every company-login level. */
const EVERY_COMPANY_LEVEL: AppRole[] = [
  "Owner",
  "Admin",
  "Manager",
  ...HR_LEVELS,
];

describe("canManageBreakAllowance", () => {
  it.each<AppRole>(["Owner", "Admin", "HRHead"])("allows %s", (role) => {
    expect(canManageBreakAllowance(companyActor(role))).toBe(true);
  });

  /** HR policies are one of the two powers HR Team does not get. */
  it("does not allow HR Team, a Manager or an employee", () => {
    expect(canManageBreakAllowance(companyActor("HRTeam"))).toBe(false);
    expect(canManageBreakAllowance(companyActor("Manager"))).toBe(false);
    expect(canManageBreakAllowance(employeeActor)).toBe(false);
  });
});

describe("canSendBulkEmail", () => {
  it.each<AppRole>(["Owner", "Admin", ...HR_LEVELS])("allows %s", (role) => {
    expect(canSendBulkEmail(companyActor(role))).toBe(true);
  });

  /**
   * Narrower than `canManageAnnouncements`, which every company account holds:
   * a mass email leaves the app, so a Manager scoped to one delivery team is
   * not the right audience for it.
   */
  it("does not allow a Manager", () => {
    expect(canSendBulkEmail(companyActor("Manager"))).toBe(false);
  });

  it("does not allow an employee", () => {
    expect(canSendBulkEmail(employeeActor)).toBe(false);
  });
});

describe("canManagePayroll", () => {
  it.each<AppRole>(["Owner", "Admin", "HRHead"])("allows %s", (role) => {
    expect(canManagePayroll(companyActor(role))).toBe(true);
  });

  /** Salary is the power that separates HR Head from HR Team. */
  it("does not allow HR Team, a Manager or an employee", () => {
    expect(canManagePayroll(companyActor("HRTeam"))).toBe(false);
    expect(canManagePayroll(companyActor("Manager"))).toBe(false);
    expect(canManagePayroll(employeeActor)).toBe(false);
  });
});

describe("canViewSalarySlip", () => {
  const ownSlip = { employeeId: "emp_1", published: true };
  const othersSlip = { employeeId: "emp_2", published: true };
  const ownDraft = { employeeId: "emp_1", published: false };

  it("lets an employee read their own published slip", () => {
    expect(canViewSalarySlip(employeeActor, ownSlip)).toBe(true);
  });

  it("never lets an employee read someone else's", () => {
    expect(canViewSalarySlip(employeeActor, othersSlip)).toBe(false);
  });

  /** A draft is HR's working copy — the employee should not see a number yet. */
  it("hides an unpublished slip from its own employee", () => {
    expect(canViewSalarySlip(employeeActor, ownDraft)).toBe(false);
  });

  it("lets payroll roles read any slip, published or not", () => {
    expect(canViewSalarySlip(companyActor("HRHead"), ownDraft)).toBe(true);
    expect(canViewSalarySlip(companyActor("Owner"), othersSlip)).toBe(true);
  });

  it("does not let a Manager or HR Team read one", () => {
    expect(canViewSalarySlip(companyActor("Manager"), ownSlip)).toBe(false);
    expect(canViewSalarySlip(companyActor("HRTeam"), ownSlip)).toBe(false);
  });
});

describe("canManageEmployees", () => {
  it.each<AppRole>(["Owner", "Admin", ...HR_LEVELS])("allows %s", (role) => {
    expect(canManageEmployees(companyActor(role))).toBe(true);
  });

  it("does not allow a Manager", () => {
    expect(canManageEmployees(companyActor("Manager"))).toBe(false);
  });

  /**
   * Architecture.md section 8 — an Employee row may only ever be created by a
   * CompanyAccount, so employees must never pass this check.
   */
  it("never allows an employee, whatever role string they carry", () => {
    expect(canManageEmployees(employeeActor)).toBe(false);
    expect(
      canManageEmployees({ ...employeeActor, role: "Owner" as AppRole })
    ).toBe(false);
  });
});

describe("isCompanyAdmin", () => {
  it("is true for Owner and Admin only", () => {
    expect(isCompanyAdmin(companyActor("Owner"))).toBe(true);
    expect(isCompanyAdmin(companyActor("Admin"))).toBe(true);
    expect(isCompanyAdmin(companyActor("Manager"))).toBe(false);
    expect(isCompanyAdmin(companyActor("HRHead"))).toBe(false);
  });

  it("is false for an employee claiming an admin role", () => {
    expect(isCompanyAdmin({ ...employeeActor, role: "Admin" as AppRole })).toBe(
      false
    );
  });
});

describe("company-only capabilities", () => {
  it("keeps employees out of company-wide views and settings", () => {
    expect(canViewAllEmployees(employeeActor)).toBe(false);
    expect(canApproveRequests(employeeActor)).toBe(false);
    expect(canManageCompanySettings(employeeActor)).toBe(false);
  });

  it("lets every company level approve requests", () => {
    for (const role of EVERY_COMPANY_LEVEL) {
      expect(canApproveRequests(companyActor(role))).toBe(true);
    }
  });
});

/**
 * Phase 6 — the weekly capacity hours workload is measured against, wider than
 * `canManageCompanySettings` on purpose (Managers included, since it is the
 * number they use to judge their own team's load).
 */
describe("canManageWorkloadSettings", () => {
  it.each<AppRole>(["Owner", "Admin", "Manager"])("allows %s", (role) => {
    expect(canManageWorkloadSettings(companyActor(role))).toBe(true);
  });

  it("does not allow HR or an employee", () => {
    expect(canManageWorkloadSettings(companyActor("HRHead"))).toBe(false);
    expect(canManageWorkloadSettings(employeeActor)).toBe(false);
  });
});

/**
 * Phase 11 — the agency-wide financial rollup, deliberately narrower than
 * `canViewProjects` (which lets a Manager see every project's own margin
 * individually, company-wide, without leading it).
 */
describe("canViewFinancials", () => {
  it.each<AppRole>(["Owner", "Admin"])("allows %s", (role) => {
    expect(canViewFinancials(companyActor(role))).toBe(true);
  });

  it("does not allow a Manager, HR or an employee", () => {
    expect(canViewFinancials(companyActor("Manager"))).toBe(false);
    expect(canViewFinancials(companyActor("HRHead"))).toBe(false);
    expect(canViewFinancials(employeeActor)).toBe(false);
  });
});

describe("landingPathFor", () => {
  it("sends employees to their own space and company users to the dashboard", () => {
    expect(landingPathFor(employeeActor)).toBe("/my-space");
    expect(landingPathFor(companyActor("Owner"))).toBe("/dashboard");
  });
});

describe("navigationFor", () => {
  it("gives employees their personal sections, plus Squad, Chat, Calendar, Announcements and Settings (all shared, reachable by any account type)", () => {
    const hrefs = navigationFor(employeeActor).map((item) => item.href);
    const sharedHrefs = [
      "/squad",
      "/chat",
      "/calendar",
      "/announcements",
      "/settings",
    ];
    expect(
      hrefs.every(
        (href) => href.startsWith("/my-space") || sharedHrefs.includes(href)
      )
    ).toBe(true);
    expect(hrefs).toEqual(expect.arrayContaining(sharedHrefs));
  });

  it("gives HR people, performance, requests and Tasks in HRMS mode, but not Projects in either mode or Squad/Chat/Calendar outside PMS", () => {
    const hrmsHrefs = navigationFor(companyActor("HRHead"), "hrms").map(
      (item) => item.href
    );
    expect(hrmsHrefs).toContain("/employees");
    // Phase 8 — HR gives feedback and sets goals (`ManagePerformance`), so
    // the page belongs in their navigation.
    expect(hrmsHrefs).toContain("/performance");
    expect(hrmsHrefs).toContain("/requests");
    expect(hrmsHrefs).not.toContain("/projects");
    expect(hrmsHrefs).toContain("/tasks");
    expect(hrmsHrefs).not.toContain("/squad");
    expect(hrmsHrefs).not.toContain("/chat");
    expect(hrmsHrefs).not.toContain("/calendar");

    const pmsHrefs = navigationFor(companyActor("HRHead"), "pms").map(
      (item) => item.href
    );
    expect(pmsHrefs).not.toContain("/projects");
    expect(pmsHrefs).toContain("/tasks");
    // Squad/Chat/Calendar are mode-gated, not role-gated — HR sees them in
    // PMS mode same as anyone else, just not in HRMS mode.
    expect(pmsHrefs).toContain("/squad");
    expect(pmsHrefs).toContain("/chat");
    expect(pmsHrefs).toContain("/calendar");
  });

  it("defaults to HRMS mode when none is given", () => {
    const hrefs = navigationFor(companyActor("Owner")).map((item) => item.href);
    expect(hrefs).toEqual([
      "/dashboard",
      "/employees",
      "/performance",
      "/requests",
      "/hiring",
      "/payroll",
      "/communications",
      "/tasks",
      "/announcements",
      "/settings",
    ]);
  });

  it("gives owners the full company navigation across both modes, with Tasks in both and Squad/Chat/Calendar in PMS only", () => {
    const hrmsHrefs = navigationFor(companyActor("Owner"), "hrms").map(
      (item) => item.href
    );
    expect(hrmsHrefs).toEqual([
      "/dashboard",
      "/employees",
      "/performance",
      "/requests",
      "/hiring",
      "/payroll",
      "/communications",
      "/tasks",
      "/announcements",
      "/settings",
    ]);

    const pmsHrefs = navigationFor(companyActor("Owner"), "pms").map(
      (item) => item.href
    );
    expect(pmsHrefs).toEqual([
      "/dashboard",
      "/projects",
      "/tasks",
      "/squad",
      "/chat",
      "/calendar",
      "/announcements",
      "/settings",
    ]);
  });

  /**
   * Every company login has at least its own Appearance card there (and the
   * Owner's Authority page hangs off it), so Settings is no longer gated.
   */
  it("gives every company login Settings in both modes", () => {
    for (const mode of ["hrms", "pms"] as const) {
      for (const role of EVERY_COMPANY_LEVEL) {
        expect(
          navigationFor(companyActor(role), mode).map((item) => item.href)
        ).toContain("/settings");
      }
    }
  });

  /** The sidebar never offers the approvals queue the server would refuse. */
  it("drops Requests for someone the Owner switched approvals off for", () => {
    const manager = {
      ...companyActor("Manager"),
      revokes: ["DecideRequests" as const],
    };
    expect(
      navigationFor(manager, "hrms").map((item) => item.href)
    ).not.toContain("/requests");
  });

  it("never shows a company user the employee self-service space", () => {
    const hrefs = navigationFor(companyActor("Manager")).map(
      (item) => item.href
    );
    expect(hrefs.some((href) => href.startsWith("/my-space"))).toBe(false);
  });
});

/**
 * Phase 3 role-based visibility (Phases.md — "add, view, edit and list
 * employees with correct role-based visibility").
 */
describe("editing an employee record", () => {
  const manager = companyActor("Manager");
  manager.id = "mgr_1";

  const ownReport = {
    id: "emp_1",
    managerId: null,
    managerAccountId: "mgr_1",
  };
  const someoneElse = {
    id: "emp_2",
    managerId: null,
    managerAccountId: "mgr_2",
  };
  const reportsToAnEmployee = {
    id: "emp_3",
    managerId: "emp_1",
    managerAccountId: null,
  };

  it.each<AppRole>(["Owner", "Admin", ...HR_LEVELS])(
    "lets %s edit anyone in the company",
    (role) => {
      expect(canManageEmployees(companyActor(role))).toBe(true);
    }
  );

  /**
   * Plan: access levels — people records are HR's, not a Manager's, even for
   * their own direct reports; the reporting line still counts for goals and
   * feedback (`canManagePerformance`).
   */
  it("does not let a Manager edit records, even their own direct report's", () => {
    expect(isDirectReport(manager, ownReport)).toBe(true);
    expect(canManageEmployees(manager)).toBe(false);
    expect(canManagePerformance(manager, ownReport)).toBe(true);
    expect(canManagePerformance(manager, someoneElse)).toBe(false);
  });

  /**
   * A reporting line pointing at another Employee is not a line to a company
   * account, so it must never make a signed-in Manager their manager — even if
   * the ids happened to collide across the two tables.
   */
  it("does not treat an employee-to-employee line as a manager's report", () => {
    const impostor = { ...manager, id: "emp_1" };
    expect(isDirectReport(impostor, reportsToAnEmployee)).toBe(false);
    expect(canManagePerformance(impostor, reportsToAnEmployee)).toBe(false);
  });

  it("never lets an employee edit a record, whatever role string they carry", () => {
    expect(canManageEmployees(employeeActor)).toBe(false);
    expect(
      canManageEmployees({ ...employeeActor, role: "HRHead" as AppRole })
    ).toBe(false);
  });
});

describe("canViewPersonalDetails", () => {
  const manager = { ...companyActor("Manager"), id: "mgr_1" };
  const ownReport = { id: "e1", managerId: null, managerAccountId: "mgr_1" };
  const otherPerson = { id: "e2", managerId: null, managerAccountId: null };

  /**
   * Rules.md section 3 — an employee's personal data must not be exposed to a
   * role that should not see it. Every company account can browse the
   * directory, but only these can see home address, date of birth and
   * emergency contacts.
   */
  it("allows Owner, Admin and both HR levels for anyone", () => {
    for (const role of ADMIN_AND_HR) {
      expect(canViewPersonalDetails(companyActor(role), otherPerson)).toBe(
        true
      );
    }
  });

  /** Plan: access levels — no private data for Managers, own team included. */
  it("does not allow a Manager, even for their own reports", () => {
    expect(canViewPersonalDetails(manager, ownReport)).toBe(false);
    expect(canViewPersonalDetails(manager, otherPerson)).toBe(false);
  });

  it("allows an employee their own details only", () => {
    expect(canViewPersonalDetails(employeeActor, { id: "emp_1" })).toBe(true);
    expect(canViewPersonalDetails(employeeActor, ownReport)).toBe(false);
  });
});

describe("canViewAttendance", () => {
  const managerReport = { kind: "employee" as const, id: "e1" };

  it("allows Owner, Admin and both HR levels for anyone, company logins included", () => {
    for (const role of ADMIN_AND_HR) {
      expect(canViewAttendance(companyActor(role), managerReport)).toBe(true);
      expect(
        canViewAttendance(companyActor(role), { kind: "account", id: "acct_9" })
      ).toBe(true);
    }
  });

  /** It used to ride along with personal details; now it is its own power. */
  it("does not allow a Manager, even for their own reports", () => {
    expect(canViewAttendance(companyActor("Manager"), managerReport)).toBe(
      false
    );
  });

  it("always lets someone see their own", () => {
    expect(
      canViewAttendance(employeeActor, { kind: "employee", id: "emp_1" })
    ).toBe(true);
    expect(
      canViewAttendance(companyActor("Manager"), {
        kind: "account",
        id: "acct_1",
      })
    ).toBe(true);
  });

  /** Ids live in two tables — an employee id never matches an account. */
  it("never mixes up an employee id with an account id", () => {
    expect(
      canViewAttendance(employeeActor, { kind: "account", id: "emp_1" })
    ).toBe(false);
  });
});

describe("canViewAccountDetails", () => {
  it("allows HR and above, and the login itself — not a Manager", () => {
    expect(
      canViewAccountDetails(companyActor("HRTeam"), { id: "acct_9" })
    ).toBe(true);
    expect(
      canViewAccountDetails(companyActor("Manager"), { id: "acct_9" })
    ).toBe(false);
    expect(
      canViewAccountDetails(companyActor("Manager"), { id: "acct_1" })
    ).toBe(true);
  });
});

/**
 * Phase 7 — deciding on a request follows the same split as editing an
 * employee record: Owner/Admin/HR for anyone, a Manager for their own direct
 * reports only.
 *
 * Phase 21 — a request is addressed to a specific person. Only that person
 * (or the founder/owner) can decide. Legacy requests (no targeted approver)
 * fall back to the role rule.
 */
describe("canDecideOnRequest", () => {
  const manager = companyActor("Manager");
  manager.id = "mgr_1";

  const owner = companyActor("Owner");
  owner.id = "owner_1";

  const admin = companyActor("Admin");
  admin.id = "admin_1";

  const employeeWithGrant: SessionActor = {
    ...employeeActor,
    id: "emp_grant",
    grants: ["DecideRequests"],
  };

  const ownReportLegacy = {
    employee: { id: "e1", managerId: null, managerAccountId: "mgr_1" },
    requestedApproverAccountId: null,
    requestedApproverEmployeeId: null,
  };
  const someoneElsesReportLegacy = {
    employee: { id: "e2", managerId: null, managerAccountId: "mgr_2" },
    requestedApproverAccountId: null,
    requestedApproverEmployeeId: null,
  };

  const ownReportTargeted = {
    employee: { id: "e1", managerId: null, managerAccountId: "mgr_1" },
    requestedApproverAccountId: "mgr_1",
    requestedApproverEmployeeId: null,
  };
  const someoneElsesReportTargeted = {
    employee: { id: "e2", managerId: null, managerAccountId: "mgr_2" },
    requestedApproverAccountId: "mgr_2",
    requestedApproverEmployeeId: null,
  };

  const ownReportTargetedEmployee = {
    employee: { id: "e1", managerId: null, managerAccountId: "mgr_1" },
    requestedApproverAccountId: null,
    requestedApproverEmployeeId: "emp_grant",
  };
  const someoneElsesReportTargetedEmployee = {
    employee: { id: "e2", managerId: null, managerAccountId: "mgr_2" },
    requestedApproverAccountId: null,
    requestedApproverEmployeeId: "emp_other",
  };

  it.each<AppRole>(["Owner", "Admin", ...HR_LEVELS])(
    "lets %s decide on anyone's legacy request",
    (role) => {
      expect(
        canDecideOnRequest(companyActor(role), someoneElsesReportLegacy)
      ).toBe(true);
    }
  );

  it("lets an Owner decide on anyone's targeted request", () => {
    expect(canDecideOnRequest(owner, someoneElsesReportTargeted)).toBe(true);
    expect(canDecideOnRequest(owner, someoneElsesReportTargetedEmployee)).toBe(
      true
    );
  });

  it("lets a Manager decide on their own report's legacy request", () => {
    expect(canDecideOnRequest(manager, ownReportLegacy)).toBe(true);
  });

  it("does not let a Manager decide on somebody else's legacy request", () => {
    expect(canDecideOnRequest(manager, someoneElsesReportLegacy)).toBe(false);
  });

  it("lets a Manager decide when they are the targeted approver", () => {
    expect(canDecideOnRequest(manager, ownReportTargeted)).toBe(true);
  });

  it("does not let a Manager decide when someone else is the targeted approver", () => {
    expect(canDecideOnRequest(manager, someoneElsesReportTargeted)).toBe(false);
  });

  it("lets an employee with DecideRequests grant decide when targeted", () => {
    expect(
      canDecideOnRequest(employeeWithGrant, ownReportTargetedEmployee)
    ).toBe(true);
  });

  it("does not let an employee with DecideRequests grant decide when not targeted", () => {
    expect(
      canDecideOnRequest(employeeWithGrant, someoneElsesReportTargetedEmployee)
    ).toBe(false);
  });

  it("never lets an employee without grants decide, whatever role string they carry", () => {
    expect(canDecideOnRequest(employeeActor, ownReportLegacy)).toBe(false);
    expect(
      canDecideOnRequest(
        { ...employeeActor, role: "Owner" as AppRole },
        ownReportLegacy
      )
    ).toBe(false);
  });

  /** The Owner's switch beats the level: a revoked approver decides nothing. */
  it("stops someone the Owner switched approvals off for, even when targeted", () => {
    const revoked: SessionActor = {
      ...manager,
      revokes: ["DecideRequests"],
    };
    expect(canDecideOnRequest(revoked, ownReportTargeted)).toBe(false);
    expect(canDecideOnRequest(revoked, ownReportLegacy)).toBe(false);
    expect(canDecideOnRequest(admin, someoneElsesReportLegacy)).toBe(true);
  });
});

describe("canViewPerformance", () => {
  const manager = companyActor("Manager");
  manager.id = "mgr_1";

  const ownReport = { id: "e1", managerId: null, managerAccountId: "mgr_1" };
  const someoneElsesReport = {
    id: "e2",
    managerId: null,
    managerAccountId: "mgr_2",
  };

  it.each<AppRole>(["Owner", "Admin", ...HR_LEVELS])(
    "lets %s view anyone's performance",
    (role) => {
      expect(canViewPerformance(companyActor(role), someoneElsesReport)).toBe(
        true
      );
    }
  );

  /** Plan: access levels — the user chose company-wide for Managers. */
  it("lets a Manager view anyone's performance by default", () => {
    expect(canViewPerformance(manager, ownReport)).toBe(true);
    expect(canViewPerformance(manager, someoneElsesReport)).toBe(true);
    expect(canViewAllPerformance(manager)).toBe(true);
  });

  it("narrows a Manager to their own reports when the Owner switches it off", () => {
    const narrowed: SessionActor = { ...manager, revokes: ["ViewPerformance"] };
    expect(canViewAllPerformance(narrowed)).toBe(false);
    expect(canViewPerformance(narrowed, ownReport)).toBe(true);
    expect(canViewPerformance(narrowed, someoneElsesReport)).toBe(false);
  });

  it("lets an employee with the View performance switch see everyone's", () => {
    const granted: SessionActor = {
      ...employeeActor,
      grants: ["ViewPerformance"],
    };
    expect(canViewPerformance(granted, someoneElsesReport)).toBe(true);
    // Viewing is not deciding: an employee login can never set goals.
    expect(canManagePerformance(granted, someoneElsesReport)).toBe(false);
  });

  /**
   * PRD.md's FAQ answers this directly: "can employees see each other's
   * performance?" — only their own.
   */
  it("lets an employee view their own performance", () => {
    const self = {
      id: employeeActor.id,
      managerId: null,
      managerAccountId: null,
    };
    expect(canViewPerformance(employeeActor, self)).toBe(true);
  });

  it("does not let an employee view someone else's performance", () => {
    expect(canViewPerformance(employeeActor, ownReport)).toBe(false);
  });
});

/**
 * A company login's own growth: stricter than an employee's — reading or
 * deciding another login's goals is HR-and-above (`ManagePerformance`).
 */
describe("company-login performance", () => {
  it("lets HR, Admin and the Owner read and decide it, and the login itself read it", () => {
    for (const role of ADMIN_AND_HR) {
      expect(
        canViewAccountPerformance(companyActor(role), { id: "acct_9" })
      ).toBe(true);
      expect(canManageAccountPerformance(companyActor(role))).toBe(true);
    }
    expect(
      canViewAccountPerformance(companyActor("Manager"), { id: "acct_1" })
    ).toBe(true);
  });

  it("does not let a Manager read or decide another login's", () => {
    expect(
      canViewAccountPerformance(companyActor("Manager"), { id: "acct_9" })
    ).toBe(false);
    expect(canManageAccountPerformance(companyActor("Manager"))).toBe(false);
  });
});

describe("canManageCompanyAccounts", () => {
  it("is Owner and Admin only — HR manages employees, not the tenant", () => {
    expect(canManageCompanyAccounts(companyActor("Owner"))).toBe(true);
    expect(canManageCompanyAccounts(companyActor("Admin"))).toBe(true);
    expect(canManageCompanyAccounts(companyActor("HRHead"))).toBe(false);
    expect(canManageCompanyAccounts(companyActor("Manager"))).toBe(false);
    expect(canManageCompanyAccounts(employeeActor)).toBe(false);
  });

  /** Owner is established once, at registration, and can never be handed out. */
  it("does not offer Owner as an invitable role", () => {
    expect(INVITABLE_ROLES).toEqual(["Admin", "Manager", "HRHead", "HRTeam"]);
  });

  /** The Authority page is the Owner's alone — not even an Admin's. */
  it("keeps the Authority page Owner-only", () => {
    expect(canManagePermissionGrants(companyActor("Owner"))).toBe(true);
    expect(canManagePermissionGrants(companyActor("Admin"))).toBe(false);
    expect(canManagePermissionGrants(companyActor("HRHead"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Projects and clients (Phases.md Phase 4)
// ---------------------------------------------------------------------------

describe("canViewProjects", () => {
  it.each<AppRole>(["Owner", "Admin", "Manager"])("allows %s", (role) => {
    expect(canViewProjects(companyActor(role))).toBe(true);
  });

  /**
   * PRD.md section 9 gives HR employee records, leave and HR requests — not
   * client delivery. The sidebar has never offered them Projects either.
   */
  it("does not allow HR", () => {
    expect(canViewProjects(companyActor("HRHead"))).toBe(false);
    expect(canViewProjects(companyActor("HRTeam"))).toBe(false);
  });

  it("never allows an employee, whatever role string they carry", () => {
    expect(canViewProjects(employeeActor)).toBe(false);
    expect(
      canViewProjects({ ...employeeActor, role: "Owner" as AppRole })
    ).toBe(false);
  });
});

describe("canManageClients and canCreateProjects", () => {
  /**
   * Phases.md Phase 4 is explicit: "a manager can create a client, create a
   * project under that client, and assign a team".
   */
  it.each<AppRole>(["Owner", "Admin", "Manager"])("allows %s", (role) => {
    expect(canManageClients(companyActor(role))).toBe(true);
    expect(canCreateProjects(companyActor(role))).toBe(true);
  });

  it("does not allow HR or an employee", () => {
    expect(canManageClients(companyActor("HRHead"))).toBe(false);
    expect(canCreateProjects(companyActor("HRHead"))).toBe(false);
    expect(canManageClients(employeeActor)).toBe(false);
    expect(canCreateProjects(employeeActor)).toBe(false);
  });
});

describe("canManageProject", () => {
  const ledByThem = { leadAccountId: "acct_1" };
  const ledBySomeoneElse = { leadAccountId: "acct_999" };
  const unled = { leadAccountId: null };

  it("lets an Owner or Admin edit any project in their company", () => {
    for (const role of ["Owner", "Admin"] as const) {
      expect(canManageProject(companyActor(role), ledBySomeoneElse)).toBe(true);
      expect(canManageProject(companyActor(role), unled)).toBe(true);
    }
  });

  /** PRD.md section 9 — a Manager's remit is their own team's projects. */
  it("lets a Manager edit only the projects they lead", () => {
    expect(canManageProject(companyActor("Manager"), ledByThem)).toBe(true);
    expect(canManageProject(companyActor("Manager"), ledBySomeoneElse)).toBe(
      false
    );
    expect(canManageProject(companyActor("Manager"), unled)).toBe(false);
  });

  it("does not let HR edit a project even if they somehow lead one", () => {
    expect(canManageProject(companyActor("HRHead"), ledByThem)).toBe(false);
  });

  /** Switching the power off must also stop edits, not just browsing. */
  it("stops a Manager editing a project they lead once Projects is switched off", () => {
    const revoked: SessionActor = {
      ...companyActor("Manager"),
      revokes: ["ManageProjects"],
    };
    expect(canViewProjects(revoked)).toBe(false);
    expect(canManageProject(revoked, ledByThem)).toBe(false);
  });

  /**
   * An employee id could collide with the lead id only if the two tables shared
   * a keyspace, but the account type is checked regardless — an employee login
   * must never gain a company account's rights.
   */
  it("never allows an employee, even when the ids match", () => {
    expect(
      canManageProject(
        { ...employeeActor, id: "acct_1", role: "Manager" as AppRole },
        ledByThem
      )
    ).toBe(false);
  });
});

describe("canViewTasks", () => {
  /** Task allotment is open to every account above an Employee. */
  it.each<AppRole>(["Owner", "Admin", "Manager", ...HR_LEVELS])(
    "allows %s",
    (role) => {
      expect(canViewTasks(companyActor(role))).toBe(true);
    }
  );

  it("does not allow an employee", () => {
    expect(canViewTasks(employeeActor)).toBe(false);
  });
});

describe("canManageTask", () => {
  const onTheirProject = { project: { leadAccountId: "acct_1" } };
  const onSomeoneElses = { project: { leadAccountId: "acct_999" } };

  it("lets an Owner or Admin change any task in their company", () => {
    for (const role of ["Owner", "Admin"] as const) {
      expect(canManageTask(companyActor(role), onSomeoneElses)).toBe(true);
    }
  });

  /**
   * A task is governed by its project, so a Manager reaches exactly the tasks
   * on the projects they lead — and browsing another team's board does not let
   * them move a card on it.
   */
  it("lets a Manager change only tasks on the projects they lead", () => {
    expect(canManageTask(companyActor("Manager"), onTheirProject)).toBe(true);
    expect(canManageTask(companyActor("Manager"), onSomeoneElses)).toBe(false);
  });

  it("never allows an employee, even when the ids match", () => {
    expect(
      canManageTask(
        { ...employeeActor, id: "acct_1", role: "Manager" as AppRole },
        onTheirProject
      )
    ).toBe(false);
  });

  /**
   * A standalone task has no project to be governed by, so it's personal to
   * whoever raised it — deliberately with no Owner/Admin override, unlike a
   * project task.
   */
  describe("a standalone task (no project)", () => {
    it("lets its creator manage it, regardless of role", () => {
      for (const role of EVERY_COMPANY_LEVEL) {
        expect(
          canManageTask(companyActor(role), {
            project: null,
            createdById: "acct_1",
          })
        ).toBe(true);
      }
    });

    it("does not let another company account manage it, even an Owner or Admin", () => {
      for (const role of ["Owner", "Admin", "Manager"] as const) {
        expect(
          canManageTask(companyActor(role), {
            project: null,
            createdById: "acct_999",
          })
        ).toBe(false);
      }
    });

    it("never allows an employee", () => {
      expect(
        canManageTask(employeeActor, { project: null, createdById: "emp_1" })
      ).toBe(false);
    });
  });

  /**
   * A task filed directly under a client (no project) sits between the two:
   * Owner/Admin get the same oversight every other "no natural lead" case in
   * this file gets, plus whoever raised it — but not a Manager/HR who didn't
   * raise it, since there is no lead the way a project has one.
   */
  describe("a client-direct task (no project, filed under a client)", () => {
    const raisedBySomeoneElse = {
      project: null,
      clientId: "cli_1",
      createdById: "acct_999",
    };

    it("lets an Owner or Admin manage it even when someone else raised it", () => {
      for (const role of ["Owner", "Admin"] as const) {
        expect(canManageTask(companyActor(role), raisedBySomeoneElse)).toBe(
          true
        );
      }
    });

    it("does not let a Manager or HR who did not raise it manage it", () => {
      for (const role of ["Manager", ...HR_LEVELS] as AppRole[]) {
        expect(canManageTask(companyActor(role), raisedBySomeoneElse)).toBe(
          false
        );
      }
    });

    it("lets its creator manage it, regardless of role", () => {
      expect(
        canManageTask(companyActor("Manager"), {
          project: null,
          clientId: "cli_1",
          createdById: "acct_1",
        })
      ).toBe(true);
    });

    it("never allows an employee", () => {
      expect(
        canManageTask(employeeActor, {
          project: null,
          clientId: "cli_1",
          createdById: "emp_1",
        })
      ).toBe(false);
    });
  });
});

describe("canUpdateTaskStatus", () => {
  const onTheirProject = { project: { leadAccountId: "acct_1" } };
  const onSomeoneElses = { project: { leadAccountId: "acct_999" } };

  it("still allows everything canManageTask allows", () => {
    expect(
      canUpdateTaskStatus(companyActor("Owner"), {
        ...onSomeoneElses,
        assigneeId: null,
      })
    ).toBe(true);
    expect(
      canUpdateTaskStatus(companyActor("Manager"), {
        ...onTheirProject,
        assigneeId: null,
      })
    ).toBe(true);
    expect(
      canUpdateTaskStatus(companyActor("Manager"), {
        ...onSomeoneElses,
        assigneeId: null,
      })
    ).toBe(false);
  });

  /**
   * Phases.md Phase 10 — an employee works their own board from `/my-space`
   * without needing delivery-role access to `/tasks` itself.
   */
  it("additionally allows the employee this task is assigned to", () => {
    expect(
      canUpdateTaskStatus(employeeActor, {
        ...onSomeoneElses,
        assigneeId: employeeActor.id,
      })
    ).toBe(true);
  });

  it("does not allow a different employee, even on the same task", () => {
    expect(
      canUpdateTaskStatus(employeeActor, {
        ...onSomeoneElses,
        assigneeId: "emp_999",
      })
    ).toBe(false);
  });

  /** Plan: allot tasks to a Manager or HR — the login can finish its task. */
  it("allows the Manager/HR login the task is allotted to", () => {
    expect(
      canUpdateTaskStatus(companyActor("HRTeam"), {
        ...onSomeoneElses,
        assigneeId: null,
        assigneeAccountId: "acct_1",
      })
    ).toBe(true);
    expect(
      canUpdateTaskStatus(companyActor("HRTeam"), {
        ...onSomeoneElses,
        assigneeId: null,
        assigneeAccountId: "acct_999",
      })
    ).toBe(false);
  });

  it("never mixes up an employee id with an account id", () => {
    expect(
      canUpdateTaskStatus(employeeActor, {
        ...onSomeoneElses,
        assigneeId: null,
        assigneeAccountId: employeeActor.id,
      })
    ).toBe(false);
  });
});

/** Plan: allot tasks to a Manager or HR — "same level or higher". */
describe("canAssignTaskToAccount", () => {
  it("lets every company role allot to a Manager or either HR level", () => {
    for (const role of EVERY_COMPANY_LEVEL) {
      expect(
        canAssignTaskToAccount(companyActor(role), { role: "Manager" })
      ).toBe(true);
      expect(
        canAssignTaskToAccount(companyActor(role), { role: "HRHead" })
      ).toBe(true);
      expect(
        canAssignTaskToAccount(companyActor(role), { role: "HRTeam" })
      ).toBe(true);
    }
  });

  it("treats Manager and both HR levels as one level, so they can allot to each other", () => {
    expect(
      canAssignTaskToAccount(companyActor("HRTeam"), { role: "Manager" })
    ).toBe(true);
    expect(
      canAssignTaskToAccount(companyActor("Manager"), { role: "HRHead" })
    ).toBe(true);
    expect(
      canAssignTaskToAccount(companyActor("HRTeam"), { role: "HRHead" })
    ).toBe(true);
  });

  it("never lets an employee allot to a Manager or HR", () => {
    expect(canAssignTaskToAccount(employeeActor, { role: "Manager" })).toBe(
      false
    );
    expect(canAssignTaskToAccount(employeeActor, { role: "HRHead" })).toBe(
      false
    );
  });

  it("does not make an Owner or Admin login assignable", () => {
    expect(
      canAssignTaskToAccount(companyActor("Owner"), { role: "Admin" })
    ).toBe(false);
    expect(
      canAssignTaskToAccount(companyActor("Owner"), { role: "Owner" })
    ).toBe(false);
  });
});

describe("navigationFor", () => {
  it("offers Projects to the roles that can open it, in PMS mode", () => {
    for (const role of ["Owner", "Admin", "Manager"] as const) {
      const hrefs = navigationFor(companyActor(role), "pms").map(
        (item) => item.href
      );
      expect(hrefs).toContain("/projects");
    }
  });

  /** The sidebar must never offer a section the server would refuse. */
  it("does not offer Projects to HR or to an employee, in either mode", () => {
    for (const mode of ["hrms", "pms"] as const) {
      expect(
        navigationFor(companyActor("HRHead"), mode).map((item) => item.href)
      ).not.toContain("/projects");
    }
    expect(navigationFor(employeeActor).map((item) => item.href)).not.toContain(
      "/projects"
    );
  });

  it("offers Tasks to exactly the roles that can open the section, in both modes", () => {
    for (const mode of ["hrms", "pms"] as const) {
      for (const role of EVERY_COMPANY_LEVEL) {
        expect(
          navigationFor(companyActor(role), mode).map((item) => item.href)
        ).toContain("/tasks");
      }
    }
  });

  it("never offers Projects in HRMS mode, even to a delivery role", () => {
    const hrefs = navigationFor(companyActor("Owner"), "hrms").map(
      (item) => item.href
    );
    expect(hrefs).not.toContain("/projects");
  });
});

/**
 * Plan: access levels — `has` is the one place a level default and an
 * Owner's per-person override meet: a revoke beats the level, a grant adds to
 * it, the Owner is above every switch, and an employee login can never hold
 * a power it cannot exercise.
 */
describe("has (level defaults + overrides)", () => {
  it("follows the level defaults with no overrides", () => {
    const manager = companyActor("Manager");
    expect(has(manager, "ViewPerformance")).toBe(true);
    expect(has(manager, "ManageClientVault")).toBe(true);
    expect(has(manager, "ViewPersonalDetails")).toBe(false);
    expect(has(manager, "ViewAttendance")).toBe(false);
    expect(has(manager, "ManagePayroll")).toBe(false);

    expect(has(companyActor("HRTeam"), "ViewAttendance")).toBe(true);
    expect(has(companyActor("HRTeam"), "ManagePayroll")).toBe(false);
    expect(has(companyActor("HRTeam"), "ManageHrPolicies")).toBe(false);
    expect(has(companyActor("HRHead"), "ManagePayroll")).toBe(true);
    expect(has(companyActor("HRHead"), "ManageHrPolicies")).toBe(true);
    expect(has(companyActor("HRHead"), "ManageClientVault")).toBe(false);
  });

  it("lets a revoke take a level default away from one person", () => {
    const hr: SessionActor = {
      ...companyActor("HRHead"),
      revokes: ["ManagePayroll"],
    };
    expect(has(hr, "ManagePayroll")).toBe(false);
    expect(canManagePayroll(hr)).toBe(false);
    expect(has(hr, "ViewAttendance")).toBe(true);
  });

  it("lets a grant add a power the level lacks", () => {
    const manager: SessionActor = {
      ...companyActor("Manager"),
      grants: ["ViewAttendance"],
    };
    expect(canViewAttendance(manager, { kind: "employee", id: "e1" })).toBe(
      true
    );
  });

  it("keeps the Owner above every switch", () => {
    const owner: SessionActor = {
      ...companyActor("Owner"),
      revokes: ["ManagePayroll", "ViewPersonalDetails"],
    };
    expect(has(owner, "ManagePayroll")).toBe(true);
    expect(has(owner, "ViewPersonalDetails")).toBe(true);
  });

  /**
   * Payroll, org-wide email, setting goals and the vault record a company
   * login as their author (or were judged too sensitive), so an employee
   * login never holds them — even with a stale grant row.
   */
  it("never gives an employee login a power it cannot hold", () => {
    const granted: SessionActor = {
      ...employeeActor,
      grants: [
        "ManagePayroll",
        "SendBulkEmail",
        "ManagePerformance",
        "ManageClientVault",
      ],
    };
    expect(canManagePayroll(granted)).toBe(false);
    expect(canSendBulkEmail(granted)).toBe(false);
    expect(has(granted, "ManagePerformance")).toBe(false);
    expect(canManageClientVault(granted)).toBe(false);
  });

  it("gives a plain employee nothing beyond their own record", () => {
    expect(has(employeeActor, "ViewPerformance")).toBe(false);
    expect(has(employeeActor, "DecideRequests")).toBe(false);
  });
});

/**
 * Phase 11 grants, now overrides: an Employee holding one gets the matching
 * power on top of the Employee level's (empty) defaults.
 */
describe("employee grants", () => {
  const subject = { id: "emp_2", managerId: null, managerAccountId: null };

  it("ViewPersonalDetails grant lets an employee see personal details, but not edit the record", () => {
    const granted: SessionActor = {
      ...employeeActor,
      grants: ["ViewPersonalDetails"],
    };
    expect(canViewPersonalDetails(granted, subject)).toBe(true);
    expect(canManageEmployees(granted)).toBe(false);
    expect(canViewPersonalDetails(employeeActor, subject)).toBe(false);
  });

  /**
   * Since Plan: access levels, records and personal details are separate
   * switches (the migration gave existing holders both, so nobody lost
   * access) — records alone no longer imply personal data.
   */
  it("ManageEmployees grant lets an employee edit records, but not see personal details on its own", () => {
    const granted: SessionActor = {
      ...employeeActor,
      grants: ["ManageEmployees"],
    };
    expect(canManageEmployees(granted)).toBe(true);
    expect(canViewPersonalDetails(granted, subject)).toBe(false);
  });

  it("ManageProjects grant lets an employee open Projects/Tasks", () => {
    const granted: SessionActor = {
      ...employeeActor,
      grants: ["ManageProjects"],
    };
    expect(canViewProjects(granted)).toBe(true);
    expect(canViewTasks(granted)).toBe(true);
    expect(canViewProjects(employeeActor)).toBe(false);
  });

  it("DecideRequests grant lets an employee decide on any request, company-wide", () => {
    const granted: SessionActor = {
      ...employeeActor,
      grants: ["DecideRequests"],
    };
    expect(canApproveRequests(granted)).toBe(true);
    expect(
      canDecideOnRequest(granted, {
        employee: subject,
        requestedApproverAccountId: null,
        requestedApproverEmployeeId: null,
      })
    ).toBe(true);
    expect(canApproveRequests(employeeActor)).toBe(false);
  });

  it("ViewPerformance grant puts Performance in an employee's nav", () => {
    const granted: SessionActor = {
      ...employeeActor,
      grants: ["ViewPerformance"],
    };
    expect(
      navigationFor(granted).some((item) => item.href === "/performance")
    ).toBe(true);
    expect(
      navigationFor(employeeActor).some((item) => item.href === "/performance")
    ).toBe(false);
  });

  it("ManageRecruitment grant opens hiring to an employee, and puts it in their nav", () => {
    const granted: SessionActor = {
      ...employeeActor,
      grants: ["ManageRecruitment"],
    };

    expect(canManageRecruitment(granted)).toBe(true);
    expect(canManageRecruitment(employeeActor)).toBe(false);

    // The one grant that opens a whole section, so unlike the others it has to
    // reach the sidebar or the page is unreachable without typing the URL.
    expect(navigationFor(granted).some((item) => item.href === "/hiring")).toBe(
      true
    );
    expect(
      navigationFor(employeeActor).some((item) => item.href === "/hiring")
    ).toBe(false);
  });
});

describe("canManageRecruitment", () => {
  it("is held by Owner, Admin and both HR levels by default", () => {
    expect(canManageRecruitment(companyActor("Owner"))).toBe(true);
    expect(canManageRecruitment(companyActor("Admin"))).toBe(true);
    for (const role of HR_LEVELS) {
      expect(canManageRecruitment(companyActor(role))).toBe(true);
    }
    // Applications carry a stranger's CV and contact details — not a
    // delivery Manager's business unless the Owner switches it on.
    expect(canManageRecruitment(companyActor("Manager"))).toBe(false);
  });

  it("puts Hiring in the HRMS slice only, and only for who holds it", () => {
    const owner = companyActor("Owner");
    expect(
      navigationFor(owner, "hrms").some((item) => item.href === "/hiring")
    ).toBe(true);
    expect(
      navigationFor(owner, "pms").some((item) => item.href === "/hiring")
    ).toBe(false);
    expect(
      navigationFor(companyActor("Manager"), "hrms").some(
        (item) => item.href === "/hiring"
      )
    ).toBe(false);
  });
});

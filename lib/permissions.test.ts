import { describe, expect, it } from "vitest";
import {
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
  canEditEmployee,
  canManageCompanyAccounts,
  canManageEmployees,
  canViewPersonalDetails,
  isDirectReport,
  canManageCompanySettings,
  canManageWorkloadSettings,
  canViewAllEmployees,
  canViewPerformance,
  INVITABLE_ROLES,
  isCompanyAdmin,
  landingPathFor,
  navigationFor,
  type AppRole,
  type SessionActor,
} from "@/lib/permissions";

const companyActor = (role: AppRole): SessionActor => ({
  id: "acct_1",
  companyId: "company_a",
  role,
  accountType: "company",
  grants: [],
});

const employeeActor: SessionActor = {
  id: "emp_1",
  companyId: "company_a",
  role: "Employee",
  accountType: "employee",
  grants: [],
};

describe("canManageEmployees", () => {
  it.each<AppRole>(["Owner", "Admin", "HR"])("allows %s", (role) => {
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
    expect(isCompanyAdmin(companyActor("HR"))).toBe(false);
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

  it("lets every company role approve requests", () => {
    for (const role of ["Owner", "Admin", "Manager", "HR"] as AppRole[]) {
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
    expect(canManageWorkloadSettings(companyActor("HR"))).toBe(false);
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
    expect(canViewFinancials(companyActor("HR"))).toBe(false);
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

  it("gives HR people, performance and requests in HRMS mode, but not delivery work or Squad/Chat/Calendar in either mode", () => {
    const hrmsHrefs = navigationFor(companyActor("HR"), "hrms").map(
      (item) => item.href
    );
    expect(hrmsHrefs).toContain("/employees");
    // Phase 8 — HR gives feedback and sets goals, both inside
    // `canEditEmployee`'s scope, so the page belongs in their navigation.
    expect(hrmsHrefs).toContain("/performance");
    expect(hrmsHrefs).toContain("/requests");
    expect(hrmsHrefs).not.toContain("/projects");
    expect(hrmsHrefs).not.toContain("/tasks");
    expect(hrmsHrefs).not.toContain("/squad");
    expect(hrmsHrefs).not.toContain("/chat");
    expect(hrmsHrefs).not.toContain("/calendar");

    const pmsHrefs = navigationFor(companyActor("HR"), "pms").map(
      (item) => item.href
    );
    expect(pmsHrefs).not.toContain("/projects");
    expect(pmsHrefs).not.toContain("/tasks");
    // Squad/Chat/Calendar are mode-gated, not role-gated — HR sees them in
    // PMS mode same as anyone else, just not in HRMS mode.
    expect(pmsHrefs).toContain("/squad");
    expect(pmsHrefs).toContain("/chat");
    expect(pmsHrefs).toContain("/calendar");
  });

  it("defaults to HRMS mode when none is given", () => {
    const hrefs = navigationFor(companyActor("Owner")).map(
      (item) => item.href
    );
    expect(hrefs).toEqual([
      "/dashboard",
      "/employees",
      "/performance",
      "/requests",
      "/announcements",
      "/settings",
    ]);
  });

  it("gives owners the full company navigation across both modes, with Squad/Chat/Calendar in PMS only", () => {
    const hrmsHrefs = navigationFor(companyActor("Owner"), "hrms").map(
      (item) => item.href
    );
    expect(hrmsHrefs).toEqual([
      "/dashboard",
      "/employees",
      "/performance",
      "/requests",
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

  it("gives owners and managers Settings in both modes, but not HR", () => {
    for (const mode of ["hrms", "pms"] as const) {
      expect(
        navigationFor(companyActor("Owner"), mode).map((item) => item.href)
      ).toContain("/settings");
      expect(
        navigationFor(companyActor("Manager"), mode).map((item) => item.href)
      ).toContain("/settings");
      expect(
        navigationFor(companyActor("HR"), mode).map((item) => item.href)
      ).not.toContain("/settings");
    }
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

  it.each<AppRole>(["Owner", "Admin", "HR"])(
    "lets %s edit anyone in the company",
    (role) => {
      expect(canEditEmployee(companyActor(role), someoneElse)).toBe(true);
    }
  );

  it("lets a Manager edit their own direct report", () => {
    expect(isDirectReport(manager, ownReport)).toBe(true);
    expect(canEditEmployee(manager, ownReport)).toBe(true);
  });

  it("does not let a Manager edit somebody else's report", () => {
    expect(canEditEmployee(manager, someoneElse)).toBe(false);
  });

  /**
   * A reporting line pointing at another Employee is not a line to a company
   * account, so it must never make a signed-in Manager their editor — even if
   * the ids happened to collide across the two tables.
   */
  it("does not treat an employee-to-employee line as a manager's report", () => {
    const impostor = { ...manager, id: "emp_1" };
    expect(isDirectReport(impostor, reportsToAnEmployee)).toBe(false);
    expect(canEditEmployee(impostor, reportsToAnEmployee)).toBe(false);
  });

  it("never lets an employee edit a record", () => {
    expect(canEditEmployee(employeeActor, ownReport)).toBe(false);
    expect(
      canEditEmployee({ ...employeeActor, role: "HR" as AppRole }, ownReport)
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
  it("allows Owner, Admin and HR for anyone", () => {
    for (const role of ["Owner", "Admin", "HR"] as AppRole[]) {
      expect(canViewPersonalDetails(companyActor(role), otherPerson)).toBe(
        true
      );
    }
  });

  it("allows a Manager only for their own reports", () => {
    expect(canViewPersonalDetails(manager, ownReport)).toBe(true);
    expect(canViewPersonalDetails(manager, otherPerson)).toBe(false);
  });

  it("never allows an employee", () => {
    expect(canViewPersonalDetails(employeeActor, ownReport)).toBe(false);
  });
});

/**
 * Phase 7 — deciding on a request follows the same split as editing an
 * employee record: Owner/Admin/HR for anyone, a Manager for their own direct
 * reports only.
 */
describe("canDecideOnRequest", () => {
  const manager = companyActor("Manager");
  manager.id = "mgr_1";

  const ownReport = {
    employee: { id: "e1", managerId: null, managerAccountId: "mgr_1" },
  };
  const someoneElsesReport = {
    employee: { id: "e2", managerId: null, managerAccountId: "mgr_2" },
  };

  it.each<AppRole>(["Owner", "Admin", "HR"])(
    "lets %s decide on anyone's request",
    (role) => {
      expect(canDecideOnRequest(companyActor(role), someoneElsesReport)).toBe(
        true
      );
    }
  );

  it("lets a Manager decide on their own report's request", () => {
    expect(canDecideOnRequest(manager, ownReport)).toBe(true);
  });

  it("does not let a Manager decide on somebody else's report", () => {
    expect(canDecideOnRequest(manager, someoneElsesReport)).toBe(false);
  });

  it("never lets an employee decide, whatever role string they carry", () => {
    expect(canDecideOnRequest(employeeActor, ownReport)).toBe(false);
    expect(
      canDecideOnRequest(
        { ...employeeActor, role: "Owner" as AppRole },
        ownReport
      )
    ).toBe(false);
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

  it.each<AppRole>(["Owner", "Admin", "HR"])(
    "lets %s view anyone's performance",
    (role) => {
      expect(canViewPerformance(companyActor(role), someoneElsesReport)).toBe(
        true
      );
    }
  );

  it("lets a Manager view their own report's performance", () => {
    expect(canViewPerformance(manager, ownReport)).toBe(true);
  });

  it("does not let a Manager view somebody else's report", () => {
    expect(canViewPerformance(manager, someoneElsesReport)).toBe(false);
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

describe("canManageCompanyAccounts", () => {
  it("is Owner and Admin only — HR manages employees, not the tenant", () => {
    expect(canManageCompanyAccounts(companyActor("Owner"))).toBe(true);
    expect(canManageCompanyAccounts(companyActor("Admin"))).toBe(true);
    expect(canManageCompanyAccounts(companyActor("HR"))).toBe(false);
    expect(canManageCompanyAccounts(companyActor("Manager"))).toBe(false);
    expect(canManageCompanyAccounts(employeeActor)).toBe(false);
  });

  /** Owner is established once, at registration, and can never be handed out. */
  it("does not offer Owner as an invitable role", () => {
    expect(INVITABLE_ROLES).toEqual(["Admin", "Manager", "HR"]);
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
    expect(canViewProjects(companyActor("HR"))).toBe(false);
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
    expect(canManageClients(companyActor("HR"))).toBe(false);
    expect(canCreateProjects(companyActor("HR"))).toBe(false);
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
    expect(canManageProject(companyActor("HR"), ledByThem)).toBe(false);
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
  it.each<AppRole>(["Owner", "Admin", "Manager"])("allows %s", (role) => {
    expect(canViewTasks(companyActor(role))).toBe(true);
  });

  /** Tasks are client delivery, which is not HR's remit — same as projects. */
  it("does not allow HR or an employee", () => {
    expect(canViewTasks(companyActor("HR"))).toBe(false);
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
      for (const role of ["Owner", "Admin", "Manager", "HR"] as const) {
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
      for (const role of ["Manager", "HR"] as const) {
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
        navigationFor(companyActor("HR"), mode).map((item) => item.href)
      ).not.toContain("/projects");
    }
    expect(navigationFor(employeeActor).map((item) => item.href)).not.toContain(
      "/projects"
    );
  });

  it("offers Tasks to exactly the roles that can open the section, in PMS mode", () => {
    for (const role of ["Owner", "Admin", "Manager"] as const) {
      expect(
        navigationFor(companyActor(role), "pms").map((item) => item.href)
      ).toContain("/tasks");
    }
    expect(
      navigationFor(companyActor("HR"), "pms").map((item) => item.href)
    ).not.toContain("/tasks");
  });

  it("never offers Projects or Tasks in HRMS mode, even to a delivery role", () => {
    const hrefs = navigationFor(companyActor("Owner"), "hrms").map(
      (item) => item.href
    );
    expect(hrefs).not.toContain("/projects");
    expect(hrefs).not.toContain("/tasks");
  });
});

/**
 * Phase 11 — an Employee holding a `PermissionGrant` gets the matching power
 * on top of their role, additive-OR with the existing role logic. A plain
 * Employee (no grants) or a CompanyAccount (grants always `[]`) is
 * unaffected either way.
 */
describe("grant-aware permissions", () => {
  const subject = { id: "emp_2", managerId: null, managerAccountId: null };

  it("ViewPersonalDetails grant lets an employee see personal details, but not edit the record", () => {
    const granted: SessionActor = {
      ...employeeActor,
      grants: ["ViewPersonalDetails"],
    };
    expect(canViewPersonalDetails(granted, subject)).toBe(true);
    expect(canEditEmployee(granted, subject)).toBe(false);
    expect(canViewPersonalDetails(employeeActor, subject)).toBe(false);
  });

  it("ManageEmployees grant lets an employee edit the record and see personal details", () => {
    const granted: SessionActor = {
      ...employeeActor,
      grants: ["ManageEmployees"],
    };
    expect(canManageEmployees(granted)).toBe(true);
    expect(canEditEmployee(granted, subject)).toBe(true);
    expect(canViewPersonalDetails(granted, subject)).toBe(true);
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
    expect(canDecideOnRequest(granted, { employee: subject })).toBe(true);
    expect(canApproveRequests(employeeActor)).toBe(false);
  });

  it("a CompanyAccount is never affected by grants (accountType gate)", () => {
    const owner = companyActor("Owner");
    expect(owner.grants).toEqual([]);
  });
});

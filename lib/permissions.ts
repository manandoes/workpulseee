import type {
  CompanyRole,
  GrantedPermission,
} from "@/lib/generated/prisma/enums";

export type { GrantedPermission };

/**
 * Role-based access rules (PRD.md section 9).
 *
 * Rules.md section 3: these checks are the server-side source of truth. The
 * navigation built from them is a convenience for the user, never the security
 * boundary — every API route must call these itself.
 */

/** What a session belongs to. The two never overlap. */
export type AccountType = "company" | "employee";

/**
 * Every role in the product. `Employee` is not a `CompanyRole`: employees live
 * in a separate table, so their role is modelled separately here.
 */
export type AppRole = CompanyRole | "Employee";

export type SessionActor = {
  id: string;
  companyId: string;
  role: AppRole;
  accountType: AccountType;
  /**
   * Powers the Owner has temporarily handed this actor on top of their role
   * (Phase 11 — `lib/permission-grants-data.ts`). Always empty for a company
   * account: `CompanyRole` already gives Admin/Manager/HR their powers, so
   * only an Employee actor ever carries grants. Loaded once, in `getActor()`
   * (`lib/auth.ts`), so every check below can read it with no extra
   * plumbing at the call site.
   */
  grants: GrantedPermission[];
};

/**
 * Does this actor hold a specific granted permission? Employee-only by
 * construction — see `SessionActor.grants`.
 *
 * Every check below that consults this is additive-OR with the existing
 * role logic, never a replacement for it — a grant only ever adds a power an
 * Employee didn't already have.
 */
function hasGrant(actor: SessionActor, permission: GrantedPermission): boolean {
  return actor.accountType === "employee" && actor.grants.includes(permission);
}

const COMPANY_ROLES: readonly AppRole[] = ["Owner", "Admin", "Manager", "HR"];

export function isCompanyRole(role: AppRole): boolean {
  return COMPANY_ROLES.includes(role);
}

/** Owners and Admins have unrestricted access within their own company. */
export function isCompanyAdmin(actor: SessionActor): boolean {
  return (
    actor.accountType === "company" &&
    (actor.role === "Owner" || actor.role === "Admin")
  );
}

/**
 * Who owns employee records: creating them, sending invites, editing any
 * profile, and changing status.
 *
 * Architecture.md section 8 restricts creating an Employee to Admin/HR, and
 * PRD.md section 9 gives HR "manage employee records". Managers are deliberately
 * excluded — their remit is their own team's work, not the people records. They
 * get a narrower right over their direct reports via `canEditEmployee`.
 */
export function canManageEmployees(actor: SessionActor): boolean {
  return (
    isCompanyAdmin(actor) ||
    (actor.accountType === "company" && actor.role === "HR") ||
    hasGrant(actor, "ManageEmployees")
  );
}

/** Who may see the company-wide employee directory. */
export function canViewAllEmployees(actor: SessionActor): boolean {
  return actor.accountType === "company";
}

/**
 * The parts of an employee record the permission rules need. Kept to this
 * minimum so callers can pass a `select`ed row rather than a full entity.
 */
export type EmployeeSubject = {
  id: string;
  managerId: string | null;
  managerAccountId: string | null;
};

/**
 * Is this employee a direct report of the caller?
 *
 * Only meaningful for company accounts: an employee's reporting line points at
 * either another Employee or a CompanyAccount, and a Manager signs in as the
 * latter.
 */
export function isDirectReport(
  actor: SessionActor,
  employee: EmployeeSubject
): boolean {
  return (
    actor.accountType === "company" && employee.managerAccountId === actor.id
  );
}

/**
 * Who may edit a given employee's record (Phases.md Phase 3 — "correct
 * role-based visibility").
 *
 * Owner/Admin/HR may edit anyone in their company. A Manager may edit only
 * their own direct reports, which matches PRD.md section 9 ("manage own team").
 */
export function canEditEmployee(
  actor: SessionActor,
  employee: EmployeeSubject
): boolean {
  if (canManageEmployees(actor)) return true;
  return actor.role === "Manager" && isDirectReport(actor, employee);
}

/**
 * Who may see an employee's personal details — home address, date of birth,
 * personal email, phone, emergency contact.
 *
 * Rules.md section 3: an employee's sensitive data must not be exposed to a
 * role that should not see it. Every company account can browse the directory
 * and see professional information, but personal information is limited to the
 * people who administer records (Owner/Admin/HR) and the employee's own
 * manager.
 */
export function canViewPersonalDetails(
  actor: SessionActor,
  employee: EmployeeSubject
): boolean {
  if (canEditEmployee(actor, employee)) return true;
  return hasGrant(actor, "ViewPersonalDetails");
}

/**
 * Delivery roles — the people who run client work.
 *
 * PRD.md section 9 gives Owner/Admin every project and a Manager "own team's
 * ... projects". HR is deliberately outside this: their remit is employee
 * records, leave and HR requests, not client delivery, which is why the sidebar
 * has never shown them a Projects entry either.
 */
function isDeliveryRole(actor: SessionActor): boolean {
  return (
    isCompanyAdmin(actor) ||
    (actor.accountType === "company" && actor.role === "Manager") ||
    hasGrant(actor, "ManageProjects")
  );
}

/** Who may open the Projects section and read clients and projects. */
export function canViewProjects(actor: SessionActor): boolean {
  return isDeliveryRole(actor);
}

/** Who may add a client and edit or archive one (Phases.md Phase 4). */
export function canManageClients(actor: SessionActor): boolean {
  return isDeliveryRole(actor);
}

/**
 * Who may start a new project.
 *
 * Phases.md Phase 4 is explicit that "a manager can create a client, create a
 * project under that client, and assign a team", so Managers are included here
 * even though `canManageEmployees` excludes them.
 */
export function canCreateProjects(actor: SessionActor): boolean {
  return isDeliveryRole(actor);
}

/** The part of a project the permission rules need. */
export type ProjectSubject = {
  leadAccountId: string | null;
};

/**
 * Who may edit *this* project — its details, its financials and its team.
 *
 * Owner and Admin may edit any project in their company. A Manager may edit the
 * projects they lead, which is what PRD.md section 9's "own team's projects"
 * means in the data. It mirrors `canEditEmployee`, where a Manager may browse
 * everyone but change only their own reports.
 */
export function canManageProject(
  actor: SessionActor,
  project: ProjectSubject
): boolean {
  if (isCompanyAdmin(actor)) return true;
  return (
    actor.accountType === "company" &&
    actor.role === "Manager" &&
    project.leadAccountId === actor.id
  );
}

/**
 * Who may open the Tasks section (Phases.md Phase 5).
 *
 * The same delivery roles that own projects: a task belongs to a project, so
 * anyone who can see the work can see the tasks under it. HR stays outside,
 * exactly as it does for projects.
 *
 * Employees reach their own tasks through their self-service space in Phase 10,
 * not through this section — the middleware keeps them out of it entirely.
 */
export function canViewTasks(actor: SessionActor): boolean {
  return isDeliveryRole(actor);
}

/**
 * The part of a task the permission rules need: the project it belongs to, or
 * `null` for a standalone task, plus who raised it (only meaningful in the
 * `null` case).
 */
export type TaskSubject = {
  project: ProjectSubject | null;
  createdById?: string | null;
};

/**
 * Who may create, edit, move or remove *this* task.
 *
 * A task on a project is governed by that project, so this is deliberately
 * the same rule as `canManageProject` rather than a second one that could
 * drift from it: Owner and Admin may change any task in their company, and a
 * Manager may change the tasks on the projects they lead (PRD.md section 9 —
 * "manage own team's tasks, projects").
 *
 * A standalone task has no project to be governed by, so it is personal to
 * whoever raised it instead — deliberately with no Owner/Admin override,
 * since the whole point of a project-less task is that it is a personal
 * to-do, not scoped delivery work.
 */
export function canManageTask(actor: SessionActor, task: TaskSubject): boolean {
  if (task.project) return canManageProject(actor, task.project);
  return actor.accountType === "company" && task.createdById === actor.id;
}

/** The part of a task `canUpdateTaskStatus` needs beyond `canManageTask`'s. */
export type AssignableTask = TaskSubject & { assigneeId: string | null };

/**
 * Who may move *this* task's status (Phases.md Phase 10 — "My Work").
 *
 * The same people as `canManageTask`, plus the employee it is assigned to:
 * an employee works their own board from `/my-space` without needing
 * delivery-role access to `/tasks` itself, the same "own it" carve-out
 * `canDecideOnRequest` draws for a request over its own approver rule.
 */
export function canUpdateTaskStatus(
  actor: SessionActor,
  task: AssignableTask
): boolean {
  if (canManageTask(actor, task)) return true;
  return actor.accountType === "employee" && actor.id === task.assigneeId;
}

/**
 * Who may run *this* task's timer (Phase 12 — task time tracking).
 *
 * Deliberately narrower than `canUpdateTaskStatus`: a time entry is a claim
 * about who sat and did the work, so only the assignee can make one. A manager
 * with authority over the task can still move its status and read the log, but
 * cannot start a clock in somebody else's name — the same reasoning attendance
 * uses for "only an employee can clock themselves in".
 */
export function canTrackTaskTime(
  actor: SessionActor,
  task: AssignableTask
): boolean {
  return actor.accountType === "employee" && actor.id === task.assigneeId;
}

/**
 * Who may invite and list the Owner/Admin/Manager/HR logins themselves.
 *
 * Architecture.md section 4: those accounts are "invited by an Owner/Admin".
 * HR manages *employee* records, not who administers the tenant, so HR is
 * excluded here.
 */
export function canManageCompanyAccounts(actor: SessionActor): boolean {
  return isCompanyAdmin(actor);
}

/**
 * Roles an existing account is allowed to hand out. Nobody can create a second
 * Owner: that identity is established once, by registration.
 */
export const INVITABLE_ROLES = ["Admin", "Manager", "HR"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

/** Who may approve leave, reimbursements and other employee requests. */
export function canApproveRequests(actor: SessionActor): boolean {
  return (
    (actor.accountType === "company" &&
      (actor.role === "Owner" ||
        actor.role === "Admin" ||
        actor.role === "Manager" ||
        actor.role === "HR")) ||
    hasGrant(actor, "DecideRequests")
  );
}

/**
 * Who may approve or reject a *particular* request (Phases.md Phase 7).
 *
 * `canApproveRequests` only says a role may open the queue at all. Owner/Admin/
 * HR may decide on anyone's request; a Manager may decide only on their own
 * direct reports' — the same split `canEditEmployee` draws for editing a
 * profile, since PRD.md section 9 gives a Manager "own team's ... requests".
 */
export function canDecideOnRequest(
  actor: SessionActor,
  request: { employee: EmployeeSubject }
): boolean {
  if (!canApproveRequests(actor)) return false;
  if (isCompanyAdmin(actor) || actor.role === "HR") return true;
  // A `DecideRequests` grant is company-wide, the same tier as Owner/Admin/HR
  // above — an Employee grantee has no "own direct reports" the way a
  // Manager does, so there is nothing narrower to scope it to.
  if (hasGrant(actor, "DecideRequests")) return true;
  return actor.role === "Manager" && isDirectReport(actor, request.employee);
}

/**
 * Who may open a given employee's performance page (Phases.md Phase 8).
 *
 * An employee may always view their own — the PRD.md FAQ this answers is
 * "can employees see each other's performance?", and the answer is only
 * their own. Everyone else follows `canEditEmployee`'s existing scope
 * (Owner/Admin/HR any employee, a Manager only their own direct reports) —
 * the same people who set goals and give feedback are the people who may
 * read the result.
 */
export function canViewPerformance(
  actor: SessionActor,
  employee: EmployeeSubject
): boolean {
  if (actor.accountType === "employee") return actor.id === employee.id;
  return canEditEmployee(actor, employee);
}

/** Only company accounts may change company-wide settings. */
export function canManageCompanySettings(actor: SessionActor): boolean {
  return isCompanyAdmin(actor);
}

/**
 * Who may grant or revoke an employee's `PermissionGrant`s (Phase 11).
 *
 * Owner only, not Admin — "founder/owner-controlled" is the literal ask this
 * answers, narrower than `isCompanyAdmin`'s Owner-or-Admin group used
 * everywhere else in this file.
 */
export function canManagePermissionGrants(actor: SessionActor): boolean {
  return actor.accountType === "company" && actor.role === "Owner";
}

/**
 * Who may see the aggregated, company-wide financial rollup (Phases.md
 * Phase 11 — per-client and agency-wide revenue/cost/margin).
 *
 * Deliberately narrower than `canViewProjects`, which already lets any
 * delivery role (including a Manager who leads none of them) browse every
 * project in the company and see that project's own margin. Totalling those
 * same numbers across the whole agency in one view was judged more sensitive
 * than any single project's figures, so it follows `canManageCompanySettings`
 * instead.
 */
export function canViewFinancials(actor: SessionActor): boolean {
  return isCompanyAdmin(actor);
}

/**
 * Who may change the weekly capacity hours a workload of 100% represents
 * (Phases.md Phase 6).
 *
 * Deliberately the delivery-role group rather than `canManageCompanySettings`:
 * this is the number Managers use to judge their own team's load, not a
 * company-identity setting like name or currency, so it follows the same
 * roles as `canViewProjects`/`canViewTasks` rather than the narrower
 * Owner/Admin-only group.
 */
export function canManageWorkloadSettings(actor: SessionActor): boolean {
  return isDeliveryRole(actor);
}

/**
 * Where a user lands after signing in (Architecture.md section 3).
 * Employees get their own self-service space; everyone else gets the dashboard.
 */
export function landingPathFor(actor: Pick<SessionActor, "accountType">) {
  return actor.accountType === "employee" ? "/my-space" : "/dashboard";
}

export type NavItem = {
  href: string;
  label: string;
  /** Lucide icon name, resolved in the sidebar component. */
  icon: string;
};

/**
 * Sidebar navigation per role. Employees never see company-wide sections, and
 * HR sees the people-and-requests slice rather than delivery work.
 */
export function navigationFor(actor: SessionActor): NavItem[] {
  if (actor.accountType === "employee") {
    return [
      { href: "/my-space", label: "My Work", icon: "LayoutDashboard" },
      { href: "/my-space/growth", label: "My Growth", icon: "TrendingUp" },
      {
        href: "/my-space/requests",
        label: "My Requests",
        icon: "ClipboardCheck",
      },
      { href: "/squad", label: "Squad", icon: "Contact" },
      { href: "/chat", label: "Chat", icon: "MessageCircle" },
    ];
  }

  const dashboard: NavItem = {
    href: "/dashboard",
    label: "Dashboard",
    icon: "LayoutDashboard",
  };
  const employees: NavItem = {
    href: "/employees",
    label: "Employees",
    icon: "Users",
  };
  const requests: NavItem = {
    href: "/requests",
    label: "Requests",
    icon: "ClipboardCheck",
  };
  const projects: NavItem = {
    href: "/projects",
    label: "Projects",
    icon: "FolderKanban",
  };
  const tasks: NavItem = { href: "/tasks", label: "Tasks", icon: "ListChecks" };
  const performance: NavItem = {
    href: "/performance",
    label: "Performance",
    icon: "TrendingUp",
  };
  const squad: NavItem = { href: "/squad", label: "Squad", icon: "Contact" };
  const chat: NavItem = { href: "/chat", label: "Chat", icon: "MessageCircle" };
  const settings: NavItem = {
    href: "/settings",
    label: "Settings",
    icon: "Settings",
  };

  if (actor.role === "HR") {
    // Phase 8 gives HR real work on this page (setting goals, giving
    // feedback — both inside `canEditEmployee`'s scope), so it joins the
    // people-and-requests slice HR already had.
    return [dashboard, employees, performance, requests, squad, chat];
  }

  return [
    dashboard,
    employees,
    // Built from the same predicates the pages and routes check, so the sidebar
    // can never offer a section the server would refuse.
    ...(canViewProjects(actor) ? [projects] : []),
    ...(canViewTasks(actor) ? [tasks] : []),
    performance,
    requests,
    squad,
    chat,
    ...(canManageWorkloadSettings(actor) ? [settings] : []),
  ];
}

/**
 * Sub-navigation inside the Employees section.
 *
 * Like `navigationFor`, this is a convenience for the user and never the
 * security boundary — each page re-checks the same predicate server-side
 * (Rules.md section 3).
 */
export function employeeSectionsFor(actor: SessionActor): NavItem[] {
  const sections: NavItem[] = [
    { href: "/employees", label: "Directory", icon: "Users" },
    { href: "/employees/org", label: "Org chart", icon: "Network" },
  ];

  if (canManageCompanyAccounts(actor)) {
    sections.push({
      href: "/employees/accounts",
      label: "Company accounts",
      icon: "ShieldCheck",
    });
  }

  return sections;
}

/**
 * Sub-navigation inside the Projects section (Architecture.md section 5 keeps
 * projects and clients in one area).
 *
 * Projects and Clients need no per-role filtering — both are already behind
 * `canViewProjects`, and everyone who gets in sees both tabs. Financials
 * (Phases.md Phase 11) is narrower (`canViewFinancials`, Owner/Admin only),
 * so unlike the other two tabs it is conditional, the same way
 * `employeeSectionsFor` adds "Company accounts" only for the roles that may
 * open it.
 */
export function projectSectionsFor(actor: SessionActor): NavItem[] {
  const sections: NavItem[] = [
    { href: "/projects", label: "Projects", icon: "FolderKanban" },
    { href: "/projects/clients", label: "Clients", icon: "Building2" },
  ];

  if (canViewFinancials(actor)) {
    sections.push({
      href: "/projects/financials",
      label: "Financials",
      icon: "DollarSign",
    });
  }

  return sections;
}

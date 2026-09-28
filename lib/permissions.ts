import type {
  CompanyRole,
  GrantedPermission,
} from "@/lib/generated/prisma/enums";
import {
  canHoldPower,
  LEVEL_DEFAULTS,
  type Level,
} from "@/lib/permission-grants";

export type { GrantedPermission };

/**
 * Access rules (PRD.md section 9, Plan: access levels).
 *
 * Rules.md section 3: these checks are the server-side source of truth. The
 * navigation built from them is a convenience for the user, never the security
 * boundary — every API route must call these itself.
 *
 * Most checks below reduce to `has(actor, power)`: the person's level default
 * (`LEVEL_DEFAULTS` in lib/permission-grants.ts) adjusted by the Owner's
 * per-person overrides. What stays outside `has` are relationships, which no
 * switch can express: everyone sees their own record, a manager acts for their
 * own direct reports and the projects they lead, and the Owner-only powers
 * (billing, branding, email delivery, the Authority page) are never grantable.
 */

/** What a session belongs to. The two never overlap. */
export type AccountType = "company" | "employee";

/**
 * Every level in the product. `Employee` is not a `CompanyRole`: employees
 * live in a separate table, so their level is modelled separately here.
 */
export type AppRole = Level;

export type SessionActor = {
  id: string;
  companyId: string;
  role: AppRole;
  accountType: AccountType;
  /**
   * The Owner's per-person overrides of this actor's level (Plan: access
   * levels — `PermissionGrant`): `grants` switch on powers the level lacks,
   * `revokes` switch off powers it would give. Loaded fresh on every request
   * in `getRawActor()` (`lib/auth.ts`) together with `role` itself, so a
   * change applies on the person's next click, and read only by `has` below.
   */
  grants: GrantedPermission[];
  revokes: GrantedPermission[];
};

/**
 * What `has` reads: the signed-in `SessionActor`, or anyone else loaded with
 * their overrides — e.g. every company login when a notification should go to
 * "whoever may act on this" (`loadAccountHolders` in
 * lib/permission-grants-data.ts).
 */
export type PowerHolder = Pick<
  SessionActor,
  "accountType" | "role" | "grants" | "revokes"
>;

/** A company login as a `PowerHolder`, with its id to address it by. */
export type AccountHolder = PowerHolder & {
  id: string;
  role: CompanyRole;
  accountType: "company";
};

/** The founder — the one login above every switch. */
export function isOwner(holder: Pick<PowerHolder, "accountType" | "role">) {
  return holder.accountType === "company" && holder.role === "Owner";
}

/**
 * Does this person hold `power`? The single place a level default and an
 * Owner's override are combined — every check in this file that is about a
 * power (rather than a relationship) goes through here.
 *
 * The Owner always does. An Employee login never holds a power it cannot
 * exercise (`canHoldPower` — e.g. payroll, whose slips record a company login
 * as their maker), even if a stale override row says otherwise. Beyond that,
 * a revoke beats the level, a grant adds to it, and no override means "follow
 * the level".
 */
export function has(holder: PowerHolder, power: GrantedPermission): boolean {
  if (isOwner(holder)) return true;
  if (!canHoldPower(holder.accountType, power)) return false;
  if (holder.revokes.includes(power)) return false;
  if (holder.grants.includes(power)) return true;
  const level: Level =
    holder.accountType === "employee" ? "Employee" : holder.role;
  return LEVEL_DEFAULTS[level].includes(power);
}

const COMPANY_ROLES: readonly AppRole[] = [
  "Owner",
  "Admin",
  "Manager",
  "HRHead",
  "HRTeam",
];

export function isCompanyRole(role: AppRole): boolean {
  return COMPANY_ROLES.includes(role);
}

/** Either HR level — for the few views scoped to "HR's slice", not a power. */
export function isHrLevel(actor: SessionActor): boolean {
  return (
    actor.accountType === "company" &&
    (actor.role === "HRHead" || actor.role === "HRTeam")
  );
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
 * PRD.md section 9 gives HR "manage employee records". Managers are
 * deliberately excluded — since Plan: access levels, not even for their own
 * direct reports: their remit is their team's work (tasks, goals, feedback —
 * `canManagePerformance`), not the people records.
 */
export function canManageEmployees(actor: SessionActor): boolean {
  return has(actor, "ManageEmployees");
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

/** Is the actor this employee themselves? */
function isSelfEmployee(actor: SessionActor, employee: { id: string }) {
  return actor.accountType === "employee" && actor.id === employee.id;
}

/**
 * Who may see an employee's personal details — home address, date of birth,
 * personal email, phone, emergency contact (and, when stored, ID documents).
 *
 * Rules.md section 3: an employee's sensitive data must not be exposed to a
 * role that should not see it. Every company account can browse the directory
 * and see professional information, but personal information is limited to
 * the employee themselves and whoever holds `ViewPersonalDetails` — by
 * default Owner, Admin and both HR levels. Managers deliberately do not,
 * even for their own direct reports (Plan: access levels).
 */
export function canViewPersonalDetails(
  actor: SessionActor,
  employee: { id: string }
): boolean {
  return isSelfEmployee(actor, employee) || has(actor, "ViewPersonalDetails");
}

/**
 * Whose attendance — clock-ins, breaks, working hours — the actor may see.
 * Its own power since Plan: access levels (it used to ride along with
 * personal details), so a Manager can be kept off it while still seeing
 * their team's work. `person` is an Employee or a CompanyAccount, since every
 * company login clocks in too.
 */
export function canViewAttendance(
  actor: SessionActor,
  person: { kind: "employee" | "account"; id: string }
): boolean {
  const isSelf =
    actor.id === person.id &&
    actor.accountType === (person.kind === "employee" ? "employee" : "company");
  return isSelf || has(actor, "ViewAttendance");
}

/**
 * Who may see a company login's own contact details (Squad's account card).
 * Same power as an employee's personal details — HR's slice of the company,
 * not a Manager's.
 */
export function canViewAccountDetails(
  actor: SessionActor,
  account: { id: string }
): boolean {
  const isSelf = actor.accountType === "company" && actor.id === account.id;
  return isSelf || has(actor, "ViewPersonalDetails");
}

/**
 * Delivery — the people who run client work: the `ManageProjects` power.
 *
 * PRD.md section 9 gives Owner/Admin every project and a Manager "own team's
 * ... projects". HR is outside this by default: their remit is employee
 * records, leave and HR requests, not client delivery.
 */
function isDeliveryRole(actor: SessionActor): boolean {
  return has(actor, "ManageProjects");
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
 * Needs the delivery power (`ManageProjects`) at all; with it, Owner and Admin
 * may edit any project in their company and anyone else the projects they
 * lead, which is what PRD.md section 9's "own team's projects" means in the
 * data. Switching the power off for a Manager therefore also stops them
 * editing the projects they lead, not just browsing the section.
 */
export function canManageProject(
  actor: SessionActor,
  project: ProjectSubject
): boolean {
  if (!isDeliveryRole(actor)) return false;
  if (isCompanyAdmin(actor)) return true;
  return actor.accountType === "company" && project.leadAccountId === actor.id;
}

/**
 * Who may open the Tasks section and raise/allot tasks (Phases.md Phase 5).
 *
 * Every company account — Owner, Admin, Manager and HR alike: allotting work
 * is the core of the product, open to anyone above an Employee. This is only
 * the section gate; what a caller may change on a given task is still
 * `canManageTask` (a project task stays with that project's lead or an
 * Owner/Admin, so HR allots standalone and client tasks, not project work).
 *
 * Employees reach their own tasks through their self-service space ("My
 * Tasks"), not through this section — the middleware keeps them out of it.
 */
export function canViewTasks(actor: SessionActor): boolean {
  return actor.accountType === "company" || isDeliveryRole(actor);
}

/**
 * The part of a task the permission rules need: the project it belongs to, or
 * `null` for a standalone task, the client it is filed directly under (with
 * no project in between) when it has one, plus who raised it (only
 * meaningful in the no-project cases).
 */
export type TaskSubject = {
  project: ProjectSubject | null;
  clientId?: string | null;
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
 * A task filed directly under a client (no project) gets the same
 * Owner/Admin oversight every other "no natural lead" case in this file
 * gets, plus whoever raised it — but not a Manager/HR who didn't raise it,
 * since a client-direct task has no lead the way a project does.
 *
 * A fully standalone task (no project, no client) is personal to whoever
 * raised it instead — deliberately with no Owner/Admin override, since the
 * whole point of a project-less, client-less task is that it is a personal
 * to-do, not scoped delivery work.
 */
export function canManageTask(actor: SessionActor, task: TaskSubject): boolean {
  if (task.project) return canManageProject(actor, task.project);
  if (task.clientId) {
    return (
      isCompanyAdmin(actor) ||
      (actor.accountType === "company" && task.createdById === actor.id)
    );
  }
  return actor.accountType === "company" && task.createdById === actor.id;
}

/** The part of a task `canUpdateTaskStatus` needs beyond `canManageTask`'s. */
export type AssignableTask = TaskSubject & {
  assigneeId: string | null;
  /** Set instead of `assigneeId` when a Manager/HR login holds the task. */
  assigneeAccountId?: string | null;
};

/**
 * Who may move *this* task's status (Phases.md Phase 10 — "My Work").
 *
 * The same people as `canManageTask`, plus whoever it is assigned to: an
 * employee works their own board from `/my-space` without needing
 * delivery-role access to `/tasks` itself, and a Manager/HR login allotted a
 * task (`canAssignTaskToAccount`) can finish it without leading its project —
 * the same "own it" carve-out `canDecideOnRequest` draws for a request over
 * its own approver rule.
 */
export function canUpdateTaskStatus(
  actor: SessionActor,
  task: AssignableTask
): boolean {
  if (canManageTask(actor, task)) return true;
  return actor.accountType === "employee"
    ? actor.id === task.assigneeId
    : actor.id === task.assigneeAccountId;
}

/**
 * Seniority for allotting work (Plan: allot tasks to a Manager or HR), read
 * from PRD.md section 9: the Owner, then Admin, then Manager and both HR
 * levels side by side — different remits, none above the others — then
 * Employee.
 */
const ROLE_LEVEL: Record<AppRole, number> = {
  Owner: 3,
  Admin: 2,
  Manager: 1,
  HRHead: 1,
  HRTeam: 1,
  Employee: 0,
};

/** The company roles a task can be allotted to, besides any employee. */
export const TASK_ASSIGNABLE_ACCOUNT_ROLES = [
  "Manager",
  "HRHead",
  "HRTeam",
] as const satisfies readonly CompanyRole[];

/**
 * Who may allot a task to a given company login (Plan: allot tasks to a
 * Manager or HR).
 *
 * Only a Manager or HR can be given one, and only by someone at the same level
 * or higher (`ROLE_LEVEL`): another Manager or HR, an Admin or the Owner — so
 * an Employee, below every company role, never can. This is only about the
 * assignee; whether the caller may write the task at all is still
 * `canManageTask`.
 */
export function canAssignTaskToAccount(
  actor: SessionActor,
  assignee: { role: CompanyRole }
): boolean {
  const assignable: readonly CompanyRole[] = TASK_ASSIGNABLE_ACCOUNT_ROLES;
  if (!assignable.includes(assignee.role)) return false;
  return ROLE_LEVEL[actor.role] >= ROLE_LEVEL[assignee.role];
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
 * Levels an existing account is allowed to hand out. Nobody can create a
 * second Owner: that identity is established once, by registration.
 */
export const INVITABLE_ROLES = [
  "Admin",
  "Manager",
  "HRHead",
  "HRTeam",
] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

/**
 * Who may approve leave, reimbursements and other employee requests at all —
 * open the approvals queue and be chosen as an approver. Every company level
 * holds it by default; the Owner can switch it off for one person, or on for
 * an employee.
 */
export function canApproveRequests(actor: SessionActor): boolean {
  return has(actor, "DecideRequests");
}

/**
 * Who may approve or reject a *particular* request (Phases.md Phase 7, Phase 21).
 *
 * Before Phase 21: `canApproveRequests` only says someone may open the queue
 * at all. Admin, both HR levels and an employee holding the power may decide
 * on anyone's request; a Manager may decide only on their own direct
 * reports', since PRD.md section 9 gives a Manager "own team's ... requests".
 *
 * Phase 21 adds: a request is addressed to a specific person. Only that person
 * (or the founder/owner) can decide. The request stores:
 * - `requestedApproverAccountId`: the CompanyAccount (Owner/Admin/Manager/HR) it was asked of
 * - `requestedApproverEmployeeId`: the Employee (with DecideRequests grant) it was asked of
 *
 * Legacy requests (submitted before Phase 21) have both null and fall back to
 * the old role rule.
 */
export function canDecideOnRequest(
  actor: SessionActor,
  request: {
    employee: EmployeeSubject;
    requestedApproverAccountId: string | null;
    requestedApproverEmployeeId: string | null;
  }
): boolean {
  if (!canApproveRequests(actor)) return false;

  // Owner (founder) can always decide any request in their company
  if (isOwner(actor)) return true;

  // If the request was addressed to a specific person, only that person can decide
  const hasTargetedApprover =
    request.requestedApproverAccountId || request.requestedApproverEmployeeId;

  if (hasTargetedApprover) {
    if (
      actor.accountType === "company" &&
      actor.id === request.requestedApproverAccountId
    ) {
      return true;
    }
    if (
      actor.accountType === "employee" &&
      actor.id === request.requestedApproverEmployeeId
    ) {
      return true;
    }
    // Not the person it was addressed to
    return false;
  }

  // Legacy request (no targeted approver): anyone holding the power decides
  // company-wide, except that a Manager's reach is their own team.
  if (actor.accountType === "company" && actor.role === "Manager") {
    return isDirectReport(actor, request.employee);
  }
  return true;
}

/**
 * Who may set goals for and give feedback to a given employee (Phases.md
 * Phase 8 — goals and feedback are manager-owned).
 *
 * Whoever holds `ManagePerformance` (Owner, Admin, both HR levels by
 * default), plus the employee's own reporting manager — a relationship, not
 * a switch, so a Manager always keeps their own team. Split out of the old
 * `canEditEmployee` by Plan: access levels, which took profile editing away
 * from managers but left their team's goals and feedback with them.
 */
export function canManagePerformance(
  actor: SessionActor,
  employee: EmployeeSubject
): boolean {
  return has(actor, "ManagePerformance") || isDirectReport(actor, employee);
}

/**
 * Whether the actor may see *everyone's* performance rather than only the
 * people they manage — what widens the Performance queue beyond a manager's
 * own direct reports. Setting goals for anyone implies reading everyone's.
 */
export function canViewAllPerformance(actor: SessionActor): boolean {
  return has(actor, "ViewPerformance") || has(actor, "ManagePerformance");
}

/**
 * Who may open a given employee's performance page (Phases.md Phase 8).
 *
 * The employee themselves always may — the PRD.md FAQ this answers is "can
 * employees see each other's performance?", and by default the answer is only
 * their own. Beyond that: anyone with company-wide performance access
 * (Managers included by default, Plan: access levels) and anyone who manages
 * this employee's goals.
 */
export function canViewPerformance(
  actor: SessionActor,
  employee: EmployeeSubject
): boolean {
  if (isSelfEmployee(actor, employee)) return true;
  return canViewAllPerformance(actor) || canManagePerformance(actor, employee);
}

/**
 * A company login's own performance (Plan: attendance/performance for all
 * company accounts). Stricter than an employee's: `ViewPerformance` is about
 * the workforce, so reading another login's scores — a fellow manager's, HR's,
 * the Owner's — takes `ManagePerformance`, the HR-and-above power.
 */
export function canViewAccountPerformance(
  actor: SessionActor,
  account: { id: string }
): boolean {
  const isSelf = actor.accountType === "company" && actor.id === account.id;
  return isSelf || has(actor, "ManagePerformance");
}

/** Who may set a company login's goals and give it feedback. */
export function canManageAccountPerformance(actor: SessionActor): boolean {
  return actor.accountType === "company" && has(actor, "ManagePerformance");
}

/** Only company accounts may change company-wide settings. */
export function canManageCompanySettings(actor: SessionActor): boolean {
  return isCompanyAdmin(actor);
}

/**
 * Who may set the daily break allowance (`Company.dailyBreakMinutes`) — the
 * `ManageHrPolicies` power: Owner, Admin and HR Head by default, wider than
 * `canManageCompanySettings` because break policy is an HR matter.
 */
export function canManageBreakAllowance(actor: SessionActor): boolean {
  return has(actor, "ManageHrPolicies");
}

/**
 * Who may run the Authority page: change anyone's powers (`PermissionGrant`
 * overrides) and move company logins between levels.
 *
 * Owner only, not Admin — "founder/owner-controlled" is the literal ask this
 * answers, and it is itself never a switch: whoever holds it could hand
 * themselves everything else.
 */
export function canManagePermissionGrants(actor: SessionActor): boolean {
  return isOwner(actor);
}

/**
 * Who may see the aggregated, company-wide financial rollup (Phases.md
 * Phase 11 — per-client and agency-wide revenue/cost/margin).
 *
 * Deliberately separate from `canViewProjects`, which already lets any
 * delivery role browse every project and see that project's own margin.
 * Totalling those numbers across the whole agency was judged more sensitive,
 * so by default only Owner and Admin hold `ViewFinancials`.
 */
export function canViewFinancials(actor: SessionActor): boolean {
  return has(actor, "ViewFinancials");
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
 * Who may cancel a `Meeting` (Plan.md Phase 17). Organizer-only — a meeting
 * has no lead/admin escape hatch the way a project does, since cancelling
 * someone else's meeting for them is not a power any role has been given.
 */
export type MeetingSubject = {
  organizerEmployeeId: string | null;
  organizerAccountId: string | null;
};

export function canCancelMeeting(
  actor: SessionActor,
  meeting: MeetingSubject
): boolean {
  return actor.accountType === "employee"
    ? meeting.organizerEmployeeId === actor.id
    : meeting.organizerAccountId === actor.id;
}

/**
 * Who may post a company announcement (optionally with a poll). Any company
 * account role — Owner, Admin, Manager, HR — not employees, who can read and
 * vote but not post.
 */
export function canManageAnnouncements(actor: SessionActor): boolean {
  return actor.accountType === "company";
}

/**
 * Who may email the whole organisation (Plan: bulk email) — `SendBulkEmail`.
 *
 * Narrower than `canManageAnnouncements`, which any company account holds: a
 * mass email leaves the app and lands in inboxes, so a Manager scoped to one
 * delivery team is not the right sender by default. Owner, Admin and both HR
 * levels — company-wide people communication.
 */
export function canSendBulkEmail(actor: SessionActor): boolean {
  return has(actor, "SendBulkEmail");
}

/**
 * Who may see salaries, define the salary structure, generate slips and
 * upload them (Plan: salary slips) — `ManagePayroll`: Owner, Admin and HR
 * Head by default; the one power that separates HR Head from HR Team besides
 * HR policies. An employee reads their own slips instead, via
 * `canViewSalarySlip`.
 */
export function canManagePayroll(actor: SessionActor): boolean {
  return has(actor, "ManagePayroll");
}

/**
 * Who may build hiring forms and work the applicant pipeline (Plan: hiring) —
 * `ManageRecruitment`: Owner, Admin and both HR levels by default, and
 * delegable to an employee (an HR lead without a company login).
 *
 * Deliberately *not* given to Managers by default: an application carries a
 * stranger's phone number, salary expectations and CV, and a manager scoped
 * to one delivery team has no reason to read the whole company's candidates.
 */
export function canManageRecruitment(actor: SessionActor): boolean {
  return has(actor, "ManageRecruitment");
}

/**
 * Who runs the client vault (Plan: client vault): stores, edits and deletes
 * client credentials, sees every one of them, and approves, rejects or
 * revokes other people's access — `ManageClientVault`.
 *
 * Owner, Admin and Manager by default — the delivery levels that hold client
 * relationships. Never holdable by an Employee (`canHoldPower`): it would hand
 * over every client's passwords at once, which is exactly what the approval
 * flow exists to avoid.
 */
export function canManageClientVault(actor: SessionActor): boolean {
  return has(actor, "ManageClientVault");
}

/**
 * Who asks for vault access instead: everyone who does not manage it — every
 * Employee, and HR. A manager never requests; they already see everything.
 */
export function canRequestVaultAccess(actor: SessionActor): boolean {
  return !canManageClientVault(actor);
}

/**
 * Who may read one slip: the employee it belongs to, or anyone who runs
 * payroll. An unpublished slip is payroll-only — that draft state is what lets
 * HR prepare a month before releasing it.
 */
export function canViewSalarySlip(
  actor: SessionActor,
  slip: { employeeId: string; published: boolean }
): boolean {
  if (canManagePayroll(actor)) return true;
  return (
    actor.accountType === "employee" &&
    actor.id === slip.employeeId &&
    slip.published
  );
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
 * The sidebar mode toggle (Plan: HRMS/PMS toggle) — a company account's own
 * display preference for which slice of the sidebar it wants, stored as a
 * cookie (`app/api/settings/dashboard-mode/route.ts`). Never applies to an
 * Employee actor, whose nav is a fixed self-service set regardless of mode.
 */
export const DASHBOARD_MODES = ["hrms", "pms"] as const;
export type DashboardMode = (typeof DASHBOARD_MODES)[number];

/**
 * The cookie name itself lives here rather than in
 * `app/api/settings/dashboard-mode/route.ts` — a `route.ts` file may only
 * export HTTP method handlers (Next.js rejects any other named export from
 * one), so the constant both that route and every reader of the cookie
 * (`app/(dashboard)/layout.tsx`, `app/(dashboard)/dashboard/page.tsx`) share
 * has to sit somewhere else.
 */
export const DASHBOARD_MODE_COOKIE = "dashboardMode";

/**
 * Dark/light theme (Plan: theme toggle) — a personal, per-browser display
 * preference like `DashboardMode` above, but available to every actor
 * (employee or company), stored the same way: a cookie
 * (`app/api/settings/theme/route.ts`) read server-side in
 * `app/(dashboard)/layout.tsx` and applied as `data-theme` on the
 * `.dashboard-theme` root so it never reaches the marketing site.
 */
export const THEME_MODES = ["light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export const THEME_COOKIE = "themeMode";

/**
 * Owner-only company branding (Plan: brand color) — unlike theme mode, this
 * is company-wide, not personal, so it is persisted on `Company` rather than
 * a cookie (`app/api/settings/branding/route.ts`, same shape as
 * `canManagePermissionGrants`'s Owner-only gate).
 */
export function canManageBranding(actor: SessionActor): boolean {
  return isOwner(actor);
}

/**
 * Owner-only email delivery settings (Settings -> Email delivery) — the
 * company's own Resend/Brevo API key, so it is gated even more narrowly than
 * `canManageCompanySettings`, same Owner-only shape as `canManageBranding`
 * and `canManagePermissionGrants`.
 */
export function canManageEmailSettings(actor: SessionActor): boolean {
  return isOwner(actor);
}

/**
 * Owner-only billing (Settings -> Billing, and `/billing` itself — Plan:
 * Razorpay billing). Financial and hard-to-reverse, the same Owner-only shape
 * as `canManageBranding` and `canManageEmailSettings` — an Admin can run the
 * company day-to-day but does not hold its payment method.
 */
export function canManageBilling(actor: SessionActor): boolean {
  return isOwner(actor);
}

/**
 * Sidebar navigation per role, filtered by `mode` for a company actor.
 * Employees never see company-wide sections and ignore `mode` entirely — see
 * `DashboardMode`.
 *
 * HRMS gets the people-and-requests slice (Employees, Performance, Requests);
 * PMS gets the delivery slice (Projects, Squad, Chat, Calendar); Tasks shows
 * in both. Each is still gated by the same predicates the pages and routes
 * check (`canViewProjects`/`canApproveRequests`/...), so the sidebar can never
 * offer a section the server would refuse — and because those predicates read
 * the Owner's switches, neither can a switched-off power linger in the nav.
 * Dashboard, Announcements and Settings are not delivery-vs-people work and
 * stay visible in both modes.
 */
export function navigationFor(
  actor: SessionActor,
  mode: DashboardMode = "hrms"
): NavItem[] {
  if (actor.accountType === "employee") {
    return [
      { href: "/my-space", label: "My Work", icon: "LayoutDashboard" },
      { href: "/my-space/tasks", label: "My Tasks", icon: "ListChecks" },
      { href: "/my-space/growth", label: "My Growth", icon: "TrendingUp" },
      {
        href: "/my-space/requests",
        label: "My Requests",
        icon: "ClipboardCheck",
      },
      { href: "/squad", label: "Squad", icon: "Contact" },
      { href: "/chat", label: "Chat", icon: "MessageCircle" },
      { href: "/calendar", label: "Calendar", icon: "CalendarDays" },
      {
        href: "/announcements",
        label: "Announcements",
        icon: "Megaphone",
      },
      // The powers that open a company-wide *section* rather than widening a
      // page an Employee already had. Without these the Owner could switch
      // one on and the employee would have no way to reach it but to type
      // the URL.
      ...(canViewAllPerformance(actor)
        ? [{ href: "/performance", label: "Performance", icon: "TrendingUp" }]
        : []),
      ...(canManageRecruitment(actor)
        ? [{ href: "/hiring", label: "Hiring", icon: "UserRoundSearch" }]
        : []),
      // Plan: theme toggle — every Employee has the personal Appearance card;
      // every other card there checks its own power and renders nothing
      // without it.
      { href: "/settings", label: "Settings", icon: "Settings" },
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
  const calendar: NavItem = {
    href: "/calendar",
    label: "Calendar",
    icon: "CalendarDays",
  };
  const announcements: NavItem = {
    href: "/announcements",
    label: "Announcements",
    icon: "Megaphone",
  };
  const settings: NavItem = {
    href: "/settings",
    label: "Settings",
    icon: "Settings",
  };
  // Plan: bulk email and salary slips — both are people-administration, so
  // they sit in the HRMS slice beside Employees rather than in PMS, and each
  // is gated by its own predicate the way Projects/Tasks already are.
  const payroll: NavItem = {
    href: "/payroll",
    label: "Payroll",
    icon: "ReceiptText",
  };
  const communications: NavItem = {
    href: "/communications",
    label: "Email",
    icon: "Mail",
  };
  const hiring: NavItem = {
    href: "/hiring",
    label: "Hiring",
    icon: "UserRoundSearch",
  };

  return [
    dashboard,
    ...(mode === "hrms" ? [employees, performance] : []),
    ...(mode === "hrms" && canApproveRequests(actor) ? [requests] : []),
    ...(mode === "hrms" && canManageRecruitment(actor) ? [hiring] : []),
    ...(mode === "hrms" && canManagePayroll(actor) ? [payroll] : []),
    ...(mode === "hrms" && canSendBulkEmail(actor) ? [communications] : []),
    ...(mode === "pms" && canViewProjects(actor) ? [projects] : []),
    // Task allotment is the core of the product, so unlike Projects it is not
    // hidden behind the PMS toggle — anyone who may assign work reaches it
    // from either mode.
    ...(canViewTasks(actor) ? [tasks] : []),
    ...(mode === "pms" ? [squad, chat, calendar] : []),
    announcements,
    // Every company login has at least its own Appearance card there, and
    // the Owner's Authority page hangs off it.
    settings,
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

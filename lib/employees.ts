import type { EmployeeStatus } from "@/lib/generated/prisma/enums";

/**
 * Employee-management business logic (Rules.md section 5 — rules live in `lib/`,
 * not inside route handlers or components).
 *
 * Everything here is pure so it can be unit-tested directly: the reporting
 * line, the org tree, the status transitions and the directory filter.
 */

// ---------------------------------------------------------------------------
// Reporting line
// ---------------------------------------------------------------------------

/**
 * Who an employee reports to. Architecture.md section 4 allows this to be
 * another Employee or a CompanyAccount, so the schema carries two nullable
 * foreign keys and the UI carries one picker. This type is the bridge.
 */
export type ManagerRef =
  { kind: "employee"; id: string } | { kind: "account"; id: string } | null;

/** Encode a manager for a single select value. */
export function formatManagerRef(ref: ManagerRef): string {
  return ref ? `${ref.kind}:${ref.id}` : "";
}

/**
 * Decode a picker value. Anything unrecognised becomes "no manager" rather
 * than throwing, because this parses untrusted form input — the caller then
 * validates that the id actually exists inside their own company.
 */
export function parseManagerRef(value: string | null | undefined): ManagerRef {
  if (!value) return null;

  const separator = value.indexOf(":");
  if (separator < 1) return null;

  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (!id) return null;

  if (kind === "employee") return { kind: "employee", id };
  if (kind === "account") return { kind: "account", id };
  return null;
}

/** The two database columns for a reporting line. Exactly one is ever set. */
export function managerFields(ref: ManagerRef): {
  managerId: string | null;
  managerAccountId: string | null;
} {
  return {
    managerId: ref?.kind === "employee" ? ref.id : null,
    managerAccountId: ref?.kind === "account" ? ref.id : null,
  };
}

export function managerRefFrom(record: {
  managerId: string | null;
  managerAccountId: string | null;
}): ManagerRef {
  if (record.managerId) return { kind: "employee", id: record.managerId };
  if (record.managerAccountId)
    return { kind: "account", id: record.managerAccountId };
  return null;
}

/**
 * Would pointing `employeeId` at `managerId` create a loop?
 *
 * Without this, "A reports to B, B reports to A" is accepted and the org chart
 * can never render either of them. Only employee-to-employee lines can loop —
 * a CompanyAccount is always a leaf upwards.
 */
export function wouldCreateCycle(
  employees: readonly { id: string; managerId: string | null }[],
  employeeId: string,
  managerId: string | null
): boolean {
  if (!managerId) return false;
  if (managerId === employeeId) return true;

  const managerOf = new Map(employees.map((e) => [e.id, e.managerId]));

  const seen = new Set<string>([employeeId]);
  let current: string | null | undefined = managerId;

  while (current) {
    if (seen.has(current)) return true;
    seen.add(current);
    current = managerOf.get(current) ?? null;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Org tree (Phases.md Phase 3 — org structure, manager to reports)
// ---------------------------------------------------------------------------

export type OrgAccountInput = {
  id: string;
  fullName: string;
  role: string;
};

export type OrgEmployeeInput = {
  id: string;
  fullName: string;
  jobRole: string | null;
  departmentName: string | null;
  status: EmployeeStatus;
  managerId: string | null;
  managerAccountId: string | null;
};

export type OrgNode = {
  /** Unique across both kinds, so it is safe as a React key. */
  key: string;
  kind: "account" | "employee";
  id: string;
  name: string;
  subtitle: string;
  status: EmployeeStatus | null;
  children: OrgNode[];
};

/** Leadership first, in the order an org chart reads. */
const ROLE_ORDER = ["Owner", "Admin", "Manager", "HRHead", "HRTeam"];

/**
 * Build the reporting tree.
 *
 * Company accounts are the roots — they are the people who administer the
 * tenant — and employees hang beneath whichever manager they point at.
 *
 * Two properties matter and are tested: every employee appears exactly once,
 * even if their data contains a reporting loop or points at a manager that no
 * longer exists, and the walk can never recurse forever.
 */
export function buildOrgTree(
  accounts: readonly OrgAccountInput[],
  employees: readonly OrgEmployeeInput[]
): OrgNode[] {
  const byManagerEmployee = new Map<string, OrgEmployeeInput[]>();
  const byManagerAccount = new Map<string, OrgEmployeeInput[]>();

  const employeeIds = new Set(employees.map((e) => e.id));
  const accountIds = new Set(accounts.map((a) => a.id));

  const orphans: OrgEmployeeInput[] = [];

  for (const employee of employees) {
    if (employee.managerId && employeeIds.has(employee.managerId)) {
      push(byManagerEmployee, employee.managerId, employee);
    } else if (
      employee.managerAccountId &&
      accountIds.has(employee.managerAccountId)
    ) {
      push(byManagerAccount, employee.managerAccountId, employee);
    } else {
      // No manager, or a manager who has since been removed — either way this
      // person still belongs on the chart.
      orphans.push(employee);
    }
  }

  const visited = new Set<string>();

  function toNode(employee: OrgEmployeeInput): OrgNode {
    visited.add(employee.id);

    // `nodesFor` skips anyone already placed, which is what stops a loop in the
    // data recursing until the stack gives out.
    const children = nodesFor(byManagerEmployee.get(employee.id) ?? []);

    return {
      key: `employee:${employee.id}`,
      kind: "employee",
      id: employee.id,
      name: employee.fullName,
      subtitle:
        [employee.jobRole, employee.departmentName]
          .filter(Boolean)
          .join(" · ") || "No role set",
      status: employee.status,
      children,
    };
  }

  /**
   * Build nodes one at a time, re-checking `visited` as we go.
   *
   * Filtering the whole list up front would not work: `toNode` marks people
   * visited as it descends, so a person reached inside an earlier sibling's
   * subtree must be skipped by the time we get to them.
   */
  function nodesFor(candidates: readonly OrgEmployeeInput[]): OrgNode[] {
    const nodes: OrgNode[] = [];
    for (const candidate of candidates) {
      if (visited.has(candidate.id)) continue;
      nodes.push(toNode(candidate));
    }
    return nodes;
  }

  const roots: OrgNode[] = [...accounts]
    .sort(
      (a, b) =>
        ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
        a.fullName.localeCompare(b.fullName)
    )
    .map((account) => ({
      key: `account:${account.id}`,
      kind: "account" as const,
      id: account.id,
      name: account.fullName,
      subtitle: account.role,
      status: null,
      children: nodesFor(byManagerAccount.get(account.id) ?? []),
    }));

  const unreported = nodesFor(orphans);

  // Anyone still unvisited is caught in a reporting loop. Surface them as roots
  // rather than dropping them off the chart entirely.
  const looped = nodesFor(employees);

  return [...roots, ...unreported, ...looped];
}

function push<T>(map: Map<string, T[]>, key: string, value: T) {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

/**
 * Resolve what an employee's status should actually become.
 *
 * Reactivating someone who never accepted their invite cannot make them
 * `Active` — they still have no password — so they return to `Invited` and the
 * caller tells the admin to resend the link.
 */
export function nextStatusFor(
  target: "Active" | "Suspended",
  hasPassword: boolean
): EmployeeStatus {
  if (target === "Suspended") return "Suspended";
  return hasPassword ? "Active" : "Invited";
}

// ---------------------------------------------------------------------------
// Directory search
// ---------------------------------------------------------------------------

export type DirectoryFilters = {
  q?: string;
  departmentId?: string;
  status?: EmployeeStatus;
};

/**
 * Build the `where` fragment for the directory search.
 *
 * Returns only the filter half — the caller wraps it in `scopedWhere()` so the
 * tenant filter is applied last and can never be overridden
 * (Rules.md section 2).
 */
export function directoryFilter(filters: DirectoryFilters) {
  const where: Record<string, unknown> = {};

  const q = filters.q?.trim();
  if (q) {
    where.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { companyEmail: { contains: q, mode: "insensitive" } },
      { employeeCode: { contains: q, mode: "insensitive" } },
      { jobRole: { contains: q, mode: "insensitive" } },
    ];
  }

  if (filters.departmentId) {
    where.departmentId =
      filters.departmentId === "none" ? null : filters.departmentId;
  }

  if (filters.status) where.status = filters.status;

  return where;
}

import { describe, expect, it } from "vitest";
import {
  buildOrgTree,
  directoryFilter,
  formatManagerRef,
  managerFields,
  managerRefFrom,
  nextStatusFor,
  parseManagerRef,
  wouldCreateCycle,
  type OrgEmployeeInput,
  type OrgNode,
} from "@/lib/employees";

const employee = (
  id: string,
  overrides: Partial<OrgEmployeeInput> = {}
): OrgEmployeeInput => ({
  id,
  fullName: id.toUpperCase(),
  jobRole: null,
  departmentName: null,
  status: "Active",
  managerId: null,
  managerAccountId: null,
  ...overrides,
});

/** Every employee id reachable in the rendered tree, in visit order. */
function idsIn(nodes: OrgNode[]): string[] {
  return nodes.flatMap((node) => [
    ...(node.kind === "employee" ? [node.id] : []),
    ...idsIn(node.children),
  ]);
}

describe("manager references", () => {
  it("round-trips both kinds through the picker value", () => {
    expect(
      parseManagerRef(formatManagerRef({ kind: "employee", id: "e1" }))
    ).toEqual({ kind: "employee", id: "e1" });
    expect(
      parseManagerRef(formatManagerRef({ kind: "account", id: "a1" }))
    ).toEqual({ kind: "account", id: "a1" });
  });

  it("treats empty and malformed values as no manager", () => {
    for (const value of ["", undefined, null, "employee:", ":e1", "nope:e1"]) {
      expect(parseManagerRef(value)).toBeNull();
    }
  });

  it("keeps ids containing a colon intact", () => {
    expect(parseManagerRef("employee:a:b")).toEqual({
      kind: "employee",
      id: "a:b",
    });
  });

  /**
   * The schema has two nullable foreign keys and only one may ever be set —
   * this is what guarantees it at the point the columns are built.
   */
  it("sets exactly one foreign key, and clears the other", () => {
    expect(managerFields({ kind: "employee", id: "e1" })).toEqual({
      managerId: "e1",
      managerAccountId: null,
    });
    expect(managerFields({ kind: "account", id: "a1" })).toEqual({
      managerId: null,
      managerAccountId: "a1",
    });
    expect(managerFields(null)).toEqual({
      managerId: null,
      managerAccountId: null,
    });
  });

  it("reads a reporting line back off a record", () => {
    expect(managerRefFrom({ managerId: "e1", managerAccountId: null })).toEqual(
      { kind: "employee", id: "e1" }
    );
    expect(managerRefFrom({ managerId: null, managerAccountId: "a1" })).toEqual(
      { kind: "account", id: "a1" }
    );
    expect(
      managerRefFrom({ managerId: null, managerAccountId: null })
    ).toBeNull();
  });
});

describe("wouldCreateCycle", () => {
  //  a -> b -> c  (c is the top of the chain)
  const chain = [
    { id: "a", managerId: "b" },
    { id: "b", managerId: "c" },
    { id: "c", managerId: null },
  ];

  it("rejects reporting to yourself", () => {
    expect(wouldCreateCycle(chain, "a", "a")).toBe(true);
  });

  it("rejects reporting to your own direct report", () => {
    expect(wouldCreateCycle(chain, "b", "a")).toBe(true);
  });

  it("rejects reporting to someone further down your own chain", () => {
    expect(wouldCreateCycle(chain, "c", "a")).toBe(true);
  });

  it("allows reporting upwards or sideways", () => {
    expect(wouldCreateCycle(chain, "a", "c")).toBe(false);
    expect(wouldCreateCycle(chain, "c", null)).toBe(false);
  });

  it("terminates on data that is already looped", () => {
    const looped = [
      { id: "x", managerId: "y" },
      { id: "y", managerId: "x" },
    ];
    expect(wouldCreateCycle(looped, "z", "x")).toBe(true);
  });
});

describe("buildOrgTree", () => {
  const accounts = [
    { id: "a_hr", fullName: "Hana", role: "HRHead" },
    { id: "a_owner", fullName: "Owen", role: "Owner" },
  ];

  it("puts company accounts at the top, in role order", () => {
    const tree = buildOrgTree(accounts, []);
    expect(tree.map((node) => node.name)).toEqual(["Owen", "Hana"]);
    expect(tree.every((node) => node.kind === "account")).toBe(true);
  });

  it("nests employees under the account or employee they report to", () => {
    const tree = buildOrgTree(accounts, [
      employee("e1", { managerAccountId: "a_owner" }),
      employee("e2", { managerId: "e1" }),
      employee("e3", { managerId: "e2" }),
    ]);

    const owner = tree.find((node) => node.id === "a_owner")!;
    expect(owner.children.map((child) => child.id)).toEqual(["e1"]);
    expect(owner.children[0].children.map((child) => child.id)).toEqual(["e2"]);
    expect(owner.children[0].children[0].children.map((c) => c.id)).toEqual([
      "e3",
    ]);
  });

  it("shows employees with no manager as their own root", () => {
    const tree = buildOrgTree([], [employee("e1")]);
    expect(tree.map((node) => node.id)).toEqual(["e1"]);
  });

  /**
   * A manager who has been removed leaves a dangling id. The employee still
   * works here, so they must not vanish from the chart.
   */
  it("still shows an employee whose manager no longer exists", () => {
    const tree = buildOrgTree([], [employee("e1", { managerId: "gone" })]);
    expect(idsIn(tree)).toEqual(["e1"]);
  });

  it("renders every employee exactly once, even with a reporting loop", () => {
    const tree = buildOrgTree(accounts, [
      employee("x", { managerId: "y" }),
      employee("y", { managerId: "x" }),
      employee("z", { managerAccountId: "a_hr" }),
    ]);

    const ids = idsIn(tree);
    expect(ids).toHaveLength(3);
    expect([...ids].sort()).toEqual(["x", "y", "z"]);
  });

  it("describes an employee by role and department", () => {
    const [node] = buildOrgTree(
      [],
      [employee("e1", { jobRole: "Designer", departmentName: "Design" })]
    );
    expect(node.subtitle).toBe("Designer · Design");
  });
});

describe("nextStatusFor", () => {
  it("suspends regardless of whether they ever signed in", () => {
    expect(nextStatusFor("Suspended", true)).toBe("Suspended");
    expect(nextStatusFor("Suspended", false)).toBe("Suspended");
  });

  /**
   * Someone who never accepted their invite has no password, so reactivating
   * them cannot make them Active — they go back to Invited.
   */
  it("returns an unaccepted invite to Invited rather than Active", () => {
    expect(nextStatusFor("Active", false)).toBe("Invited");
    expect(nextStatusFor("Active", true)).toBe("Active");
  });
});

describe("directoryFilter", () => {
  it("is empty when nothing is filtered, so the directory shows everyone", () => {
    expect(directoryFilter({})).toEqual({});
  });

  it("searches name, email, employee code and job title", () => {
    const where = directoryFilter({ q: "  rahul " }) as {
      OR: Record<string, unknown>[];
    };
    expect(where.OR).toHaveLength(4);
    expect(Object.keys(where.OR[0])).toEqual(["fullName"]);
    expect(where.OR[0].fullName).toEqual({
      contains: "rahul",
      mode: "insensitive",
    });
  });

  it("ignores whitespace-only searches", () => {
    expect(directoryFilter({ q: "   " })).toEqual({});
  });

  it("treats the 'none' department as an explicit null", () => {
    expect(directoryFilter({ departmentId: "none" })).toEqual({
      departmentId: null,
    });
    expect(directoryFilter({ departmentId: "dep_1" })).toEqual({
      departmentId: "dep_1",
    });
  });

  /**
   * Rules.md section 2 — the filter must never carry a tenant key of its own;
   * `scopedWhere` is what adds `companyId`, and it is applied last.
   */
  it("never sets companyId or deletedAt itself", () => {
    const where = directoryFilter({
      q: "a",
      departmentId: "d",
      status: "Active",
    });
    expect(where).not.toHaveProperty("companyId");
    expect(where).not.toHaveProperty("deletedAt");
  });
});

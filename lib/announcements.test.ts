import { describe, expect, it } from "vitest";
import { pollResults, voterKeyFor } from "@/lib/announcements";
import type { SessionActor } from "@/lib/permissions";

const employeeActor: SessionActor = {
  id: "emp_1",
  companyId: "co_1",
  role: "Employee",
  accountType: "employee",
  grants: [],
};

const companyActor: SessionActor = {
  id: "acct_1",
  companyId: "co_1",
  role: "Manager",
  accountType: "company",
  grants: [],
};

describe("voterKeyFor", () => {
  it("keys an employee by voterEmployeeId", () => {
    expect(voterKeyFor(employeeActor)).toEqual({ voterEmployeeId: "emp_1" });
  });

  it("keys a company account by voterAccountId", () => {
    expect(voterKeyFor(companyActor)).toEqual({ voterAccountId: "acct_1" });
  });
});

describe("pollResults", () => {
  const options = [
    { id: "opt_a", label: "A", order: 0 },
    { id: "opt_b", label: "B", order: 1 },
  ];

  it("reports every option at 0% when nobody has voted yet", () => {
    expect(pollResults(options, [])).toEqual([
      { id: "opt_a", label: "A", order: 0, count: 0, percentage: 0 },
      { id: "opt_b", label: "B", order: 1, count: 0, percentage: 0 },
    ]);
  });

  it("counts votes per option and computes each one's share of the total", () => {
    const votes = [
      { pollOptionId: "opt_a" },
      { pollOptionId: "opt_a" },
      { pollOptionId: "opt_a" },
      { pollOptionId: "opt_b" },
    ];

    expect(pollResults(options, votes)).toEqual([
      { id: "opt_a", label: "A", order: 0, count: 3, percentage: 75 },
      { id: "opt_b", label: "B", order: 1, count: 1, percentage: 25 },
    ]);
  });

  it("orders options by their stored order regardless of input order", () => {
    const reversed = [options[1], options[0]];
    expect(pollResults(reversed, []).map((o) => o.id)).toEqual([
      "opt_a",
      "opt_b",
    ]);
  });
});

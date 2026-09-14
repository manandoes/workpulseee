import { describe, expect, it } from "vitest";
import { assertSameCompany, scopedWhere } from "@/lib/tenant";
import type { SessionActor } from "@/lib/permissions";

const actor: SessionActor = {
  id: "acct_1",
  companyId: "company_a",
  role: "Admin",
  accountType: "company",
  grants: [],
};

describe("scopedWhere", () => {
  it("always applies the actor's companyId", () => {
    expect(scopedWhere(actor)).toEqual({
      companyId: "company_a",
      deletedAt: null,
    });
  });

  it("keeps the caller's own filters alongside the tenant filter", () => {
    expect(scopedWhere(actor, { status: "Active" })).toEqual({
      status: "Active",
      companyId: "company_a",
      deletedAt: null,
    });
  });

  it("excludes soft-deleted rows by default", () => {
    expect(scopedWhere(actor).deletedAt).toBeNull();
  });

  /**
   * The critical case: a caller must never be able to widen their own scope by
   * passing a companyId, whether by mistake or from unsanitised user input.
   */
  it("cannot be overridden by a caller-supplied companyId", () => {
    const where = scopedWhere(actor, { companyId: "company_b" });
    expect(where.companyId).toBe("company_a");
  });
});

describe("assertSameCompany", () => {
  it("accepts a record from the actor's own company", () => {
    expect(() =>
      assertSameCompany(actor, { companyId: "company_a" })
    ).not.toThrow();
  });

  it("blocks a record belonging to another company", () => {
    expect(() => assertSameCompany(actor, { companyId: "company_b" })).toThrow(
      /Cross-tenant/
    );
  });

  it("blocks a missing record rather than treating it as permitted", () => {
    expect(() => assertSameCompany(actor, null)).toThrow(/Cross-tenant/);
    expect(() => assertSameCompany(actor, undefined)).toThrow(/Cross-tenant/);
  });
});

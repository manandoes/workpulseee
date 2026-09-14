import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import type { AppRole, SessionActor } from "@/lib/permissions";
import type { CompanyRole } from "@/lib/generated/prisma/enums";

/**
 * Fixtures for route-handler tests (Phases.md Phase 12 — automated tests for
 * critical business-logic routes).
 *
 * Not itself a `*.test.ts` file, so vitest never runs it as a suite.
 *
 * Every route test in this codebase hits a real, migrated Postgres — there is
 * no mocking convention for the database anywhere in `lib/*.test.ts`, and
 * route tests keep that. Only `@/lib/auth`'s `getActor` is mocked per test,
 * to fix "who is signed in" without a real NextAuth session. Every fixture
 * below is built with a random suffix so concurrent runs never collide and
 * nothing needs cleaning up afterward — the same thing every manual
 * session's verification script already did against this same database.
 */

export function uniqueSuffix(): string {
  return randomUUID().slice(0, 8);
}

export async function createTestCompany() {
  const suffix = uniqueSuffix();

  const company = await db.company.create({
    data: {
      name: `Test Co ${suffix}`,
      slug: `test-co-${suffix}`,
      accounts: {
        create: {
          fullName: "Owner Test",
          workEmail: `owner-${suffix}@example.com`,
          passwordHash: null,
          role: "Owner",
        },
      },
    },
    select: { id: true, accounts: { select: { id: true } } },
  });

  return { companyId: company.id, ownerId: company.accounts[0].id, suffix };
}

export async function createCompanyAccount(
  companyId: string,
  role: CompanyRole
) {
  const suffix = uniqueSuffix();
  const account = await db.companyAccount.create({
    data: {
      companyId,
      fullName: `${role} Test`,
      workEmail: `${role.toLowerCase()}-${suffix}@example.com`,
      role,
    },
    select: { id: true },
  });
  return account.id;
}

export async function createEmployee(
  companyId: string,
  options: { managerAccountId?: string } = {}
) {
  const suffix = uniqueSuffix();
  const employee = await db.employee.create({
    data: {
      companyId,
      employeeCode: `EMP-${suffix}`,
      fullName: `Employee ${suffix}`,
      companyEmail: `employee-${suffix}@example.com`,
      managerAccountId: options.managerAccountId ?? null,
    },
    select: { id: true },
  });
  return employee.id;
}

export async function createClient(companyId: string) {
  const suffix = uniqueSuffix();
  const client = await db.client.create({
    data: { companyId, name: `Client ${suffix}` },
    select: { id: true },
  });
  return client.id;
}

export async function createProject(
  companyId: string,
  clientId: string,
  options: { leadAccountId?: string } = {}
) {
  const suffix = uniqueSuffix();
  const project = await db.project.create({
    data: {
      companyId,
      clientId,
      name: `Project ${suffix}`,
      leadAccountId: options.leadAccountId ?? null,
    },
    select: { id: true },
  });
  return project.id;
}

export async function addProjectMember(
  companyId: string,
  projectId: string,
  employeeId: string
) {
  await db.projectMember.create({
    data: { companyId, projectId, employeeId },
  });
}

export async function createTask(
  companyId: string,
  projectId: string | null,
  options: { assigneeId?: string; createdById?: string } = {}
) {
  const suffix = uniqueSuffix();
  const task = await db.task.create({
    data: {
      companyId,
      projectId,
      title: `Task ${suffix}`,
      assigneeId: options.assigneeId ?? null,
      createdById: options.createdById ?? null,
    },
    select: { id: true },
  });
  return task.id;
}

export function companyActor(
  companyId: string,
  id: string,
  role: CompanyRole
): SessionActor {
  return {
    id,
    companyId,
    role: role as AppRole,
    accountType: "company",
    grants: [],
  };
}

export function employeeActor(
  companyId: string,
  id: string,
  grants: SessionActor["grants"] = []
): SessionActor {
  return { id, companyId, role: "Employee", accountType: "employee", grants };
}

/** Builds a `NextRequest` for a route handler, JSON body only. */
export function jsonRequest(
  url: string,
  method: string,
  body?: unknown
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

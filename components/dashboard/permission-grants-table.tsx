"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { GRANTABLE_PERMISSIONS } from "@/lib/permission-grants";
import type { GrantedPermission } from "@/lib/generated/prisma/enums";

type EmployeeRow = {
  id: string;
  fullName: string;
  employeeCode: string;
  jobRole: string | null;
  grants: GrantedPermission[];
};

/**
 * Owner-only table: one row per employee, one checkbox column per curated
 * `GRANTABLE_PERMISSIONS` entry (Phase 11). Each toggle saves immediately —
 * this is a small admin control, not a form with a save step.
 */
export function PermissionGrantsTable() {
  const [employees, setEmployees] = useState<EmployeeRow[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/permission-grants")
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => body && setEmployees(body.employees));
  }, []);

  async function toggle(
    employeeId: string,
    permission: GrantedPermission,
    granted: boolean
  ) {
    const key = `${employeeId}:${permission}`;
    setPending(key);

    setEmployees(
      (rows) =>
        rows?.map((row) =>
          row.id === employeeId
            ? {
                ...row,
                grants: granted
                  ? [...row.grants, permission]
                  : row.grants.filter((g) => g !== permission),
              }
            : row
        ) ?? null
    );

    const response = await fetch("/api/permission-grants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, permission, granted }),
    });

    setPending(null);

    if (!response.ok) {
      toast.error("Could not save that. Please try again.");
      setEmployees(
        (rows) =>
          rows?.map((row) =>
            row.id === employeeId
              ? {
                  ...row,
                  grants: granted
                    ? row.grants.filter((g) => g !== permission)
                    : [...row.grants, permission],
                }
              : row
          ) ?? null
      );
    }
  }

  if (employees === null) {
    return <p className="text-text-secondary">Loading…</p>;
  }

  if (employees.length === 0) {
    return <p className="text-text-secondary">No employees yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left">
        <thead>
          <tr className="border-border border-b">
            <th className="text-text-secondary text-meta py-2 pr-4 font-medium">
              Employee
            </th>
            {GRANTABLE_PERMISSIONS.map((permission) => (
              <th
                key={permission.value}
                className="text-text-secondary text-meta py-2 pr-4 font-medium"
                title={permission.description}
              >
                {permission.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {employees.map((employee) => (
            <tr key={employee.id}>
              <td className="py-2 pr-4">
                <p className="text-foreground font-medium">
                  {employee.fullName}
                </p>
                <p className="text-text-secondary text-meta">
                  {employee.employeeCode}
                  {employee.jobRole ? ` · ${employee.jobRole}` : ""}
                </p>
              </td>
              {GRANTABLE_PERMISSIONS.map((permission) => {
                const key = `${employee.id}:${permission.value}`;
                const granted = employee.grants.includes(permission.value);

                return (
                  <td key={permission.value} className="py-2 pr-4">
                    <input
                      type="checkbox"
                      aria-label={`${permission.label} for ${employee.fullName}`}
                      checked={granted}
                      disabled={pending === key}
                      onChange={(event) =>
                        toggle(
                          employee.id,
                          permission.value,
                          event.target.checked
                        )
                      }
                      className={cn(
                        "accent-brand-brown size-4",
                        pending === key && "opacity-50"
                      )}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

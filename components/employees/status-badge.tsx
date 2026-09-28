import type { EmployeeStatus } from "@/lib/generated/prisma/enums";
import { LEVEL_LABELS, type Level } from "@/lib/permission-grants";
import { StatusPill, type PillStyle } from "@/components/dashboard/status-pill";

/** What each employee status looks like and means (Design.md § 6). */
const STATUS_STYLES: Record<EmployeeStatus, PillStyle> = {
  Active: {
    text: "text-success-text",
    dot: "bg-success",
    label: "Active",
    description: "Signed up and able to log in",
  },
  Invited: {
    text: "text-warning-text",
    dot: "bg-warning",
    label: "Invited",
    description: "Invite sent, password not set yet",
  },
  Suspended: {
    text: "text-danger-text",
    dot: "bg-danger",
    label: "Suspended",
    description: "Access revoked, record kept",
  },
};

export function EmployeeStatusBadge({
  status,
  className,
}: {
  status: EmployeeStatus;
  className?: string;
}) {
  return <StatusPill style={STATUS_STYLES[status]} className={className} />;
}

/**
 * Role pill for company accounts.
 *
 * Roles are not a status, so this deliberately uses the brand palette rather
 * than the status one (Design.md § 3 — the two never overlap).
 */
export function RoleBadge({ role }: { role: Level }) {
  return (
    <span className="bg-brand-yellow-light text-brand-brown text-meta inline-flex items-center rounded-full px-2.5 py-1 font-medium">
      {LEVEL_LABELS[role]}
    </span>
  );
}

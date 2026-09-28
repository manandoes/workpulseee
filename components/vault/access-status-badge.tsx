import type { CredentialAccessStatus } from "@/lib/generated/prisma/enums";
import { StatusPill, type PillStyle } from "@/components/dashboard/status-pill";
import { accessStatusLabel } from "@/lib/vault";

/** Vault access status pill (Design.md § 6, mirrors the request badge). */
const STATUS_STYLES: Record<CredentialAccessStatus, PillStyle> = {
  Pending: {
    text: "text-warning-text",
    dot: "bg-warning",
    label: accessStatusLabel("Pending"),
    description: "Waiting on a vault manager",
  },
  Approved: {
    text: "text-success-text",
    dot: "bg-success",
    label: accessStatusLabel("Approved"),
    description: "Can view this credential",
  },
  Rejected: {
    text: "text-danger-text",
    dot: "bg-danger",
    label: accessStatusLabel("Rejected"),
    description: "Request rejected — you can ask again",
  },
  Revoked: {
    text: "text-danger-text",
    dot: "bg-danger",
    label: accessStatusLabel("Revoked"),
    description: "Access was withdrawn — you can ask again",
  },
};

export function AccessStatusBadge({
  status,
  className,
}: {
  status: CredentialAccessStatus;
  className?: string;
}) {
  return <StatusPill style={STATUS_STYLES[status]} className={className} />;
}

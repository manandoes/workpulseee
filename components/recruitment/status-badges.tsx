import type {
  ApplicationStage,
  HiringFormStatus,
} from "@/lib/generated/prisma/enums";
import { StatusPill, type PillStyle } from "@/components/dashboard/status-pill";

/**
 * Hiring's two status vocabularies (Plan: hiring), declared the same way every
 * other module declares its own — see `components/employees/status-badge.tsx`.
 *
 * Both use the *status* palette, never brand yellow/brown (Design.md § 3), and
 * the darkened `*-text` tokens that clear AA (§ 10).
 *
 * `New` and `Shortlisted` deliberately share `info`: neither is a verdict, and
 * spending a second hue on "we have read it" would imply one.
 */
const STAGE_STYLES: Record<ApplicationStage, PillStyle> = {
  New: {
    text: "text-info-text",
    dot: "bg-info",
    label: "New",
    description: "Submitted, not yet reviewed",
  },
  Shortlisted: {
    text: "text-info-text",
    dot: "bg-info",
    label: "Shortlisted",
    description: "Worth taking further",
  },
  Interview: {
    text: "text-warning-text",
    dot: "bg-warning",
    label: "Interview",
    description: "In conversation",
  },
  Offer: {
    text: "text-success-text",
    dot: "bg-success",
    label: "Offer",
    description: "Offer extended",
  },
  Hired: {
    text: "text-success-text",
    dot: "bg-success",
    label: "Hired",
    description: "Joined, or joining",
  },
  Rejected: {
    text: "text-danger-text",
    dot: "bg-danger",
    label: "Rejected",
    description: "Not moving forward",
  },
};

const FORM_STATUS_STYLES: Record<HiringFormStatus, PillStyle> = {
  Draft: {
    text: "text-text-secondary",
    dot: "bg-brand-brown-light",
    label: "Draft",
    description: "Not published — nobody outside the company can open it",
  },
  Live: {
    text: "text-success-text",
    dot: "bg-success",
    label: "Live",
    description: "Published and accepting applications",
  },
  Closed: {
    text: "text-text-secondary",
    dot: "bg-brand-brown-light",
    label: "Closed",
    description: "Published, no longer accepting applications",
  },
};

export function StageBadge({
  stage,
  className,
}: {
  stage: ApplicationStage;
  className?: string;
}) {
  return <StatusPill style={STAGE_STYLES[stage]} className={className} />;
}

export function FormStatusBadge({
  status,
  className,
}: {
  status: HiringFormStatus;
  className?: string;
}) {
  return <StatusPill style={FORM_STATUS_STYLES[status]} className={className} />;
}

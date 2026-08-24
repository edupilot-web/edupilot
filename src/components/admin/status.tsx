import { Badge, type BadgeTone } from "@/components/admin/ui";
import {
  AUTONOMY_STATUS_LABELS,
  VERIFICATION_STATUS_LABELS,
  type AutonomyStatus,
  type VerificationStatus,
} from "@/lib/admin/institution-fields";

/**
 * One mapping from status value to badge, used everywhere.
 *
 * Centralised because a status that is amber in the list and grey on the detail
 * page teaches the operator that the colours mean nothing. These functions are
 * the only place a status picks a tone.
 */

const VERIFICATION_TONES: Record<VerificationStatus, BadgeTone> = {
  "not-verified": "neutral",
  pending: "warning",
  "needs-review": "purple",
  verified: "success",
  rejected: "danger",
};

export function VerificationBadge({ status }: { status: string }) {
  const key = (status as VerificationStatus) in VERIFICATION_TONES
    ? (status as VerificationStatus)
    : "not-verified";
  return <Badge tone={VERIFICATION_TONES[key]}>{VERIFICATION_STATUS_LABELS[key]}</Badge>;
}

const AUTONOMY_TONES: Record<AutonomyStatus, BadgeTone> = {
  autonomous: "info",
  "non-autonomous": "neutral",
  "pending-verification": "warning",
};

export function AutonomyBadge({ status }: { status: string }) {
  const key = (status as AutonomyStatus) in AUTONOMY_TONES
    ? (status as AutonomyStatus)
    : "non-autonomous";
  // "Non-autonomous" is the default for most colleges and would be visual noise
  // on every row; only the states that carry information get a badge.
  if (key === "non-autonomous") {
    return <span className="text-[12.5px] text-slate-400 dark:text-slate-600">—</span>;
  }
  return <Badge tone={AUTONOMY_TONES[key]}>{AUTONOMY_STATUS_LABELS[key]}</Badge>;
}

const RECORD_TONES: Record<string, BadgeTone> = {
  active: "success",
  inactive: "neutral",
  suspended: "danger",
  archived: "neutral",
  deleted: "danger",
};

export function RecordStatusBadge({ status }: { status: string }) {
  return <Badge tone={RECORD_TONES[status] ?? "neutral"}>{titleCase(status)}</Badge>;
}

const JOB_TONES: Record<string, BadgeTone> = {
  queued: "neutral",
  uploaded: "neutral",
  mapping: "info",
  validating: "info",
  processing: "info",
  running: "info",
  importing: "info",
  validated: "purple",
  completed: "success",
  "completed-with-warnings": "warning",
  failed: "danger",
  cancelled: "neutral",
  expired: "neutral",
};

export function JobStatusBadge({ status }: { status: string }) {
  return <Badge tone={JOB_TONES[status] ?? "neutral"}>{titleCase(status)}</Badge>;
}

const ADMIN_TONES: Record<string, BadgeTone> = {
  active: "success",
  invited: "info",
  suspended: "warning",
  deactivated: "neutral",
};

export function AdminStatusBadge({ status }: { status: string }) {
  return <Badge tone={ADMIN_TONES[status] ?? "neutral"}>{titleCase(status)}</Badge>;
}

const SEVERITY_TONES: Record<string, BadgeTone> = {
  info: "neutral",
  notice: "info",
  critical: "danger",
  warn: "warning",
  error: "danger",
  fatal: "danger",
};

export function SeverityBadge({ severity }: { severity: string }) {
  return <Badge tone={SEVERITY_TONES[severity] ?? "neutral"}>{titleCase(severity)}</Badge>;
}

const ROW_TONES: Record<string, BadgeTone> = {
  pending: "neutral",
  valid: "success",
  warning: "warning",
  invalid: "danger",
  duplicate: "purple",
  created: "success",
  updated: "info",
  skipped: "neutral",
  failed: "danger",
};

export function ImportRowBadge({ status }: { status: string }) {
  return <Badge tone={ROW_TONES[status] ?? "neutral"}>{titleCase(status)}</Badge>;
}

/** "completed-with-warnings" → "Completed with warnings". */
function titleCase(value: string): string {
  const spaced = value.replace(/-/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

import { headers } from "next/headers";
import { connectDB } from "@/lib/db";
import { AuditLog, severityFor } from "@/models/AuditLog";
import type { CurrentAdmin } from "@/lib/admin/current-admin";

/**
 * Records one administrative action.
 *
 * Called by the action, not by the model. A mongoose middleware hook would look
 * tidier and would be wrong: it cannot see *who* acted or *why*, and it would
 * fire for seeds, migrations and imports that already record their own entry.
 *
 * Never throws. An audit write that fails must not roll back the change it
 * describes — losing the record of a verification is bad, but leaving a college
 * unverified because the log was unavailable is worse, and the failure is
 * logged for the operator either way.
 */
export type AuditInput = {
  actor: CurrentAdmin | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  /** Groups the rows written by one bulk operation. */
  batchId?: string | null;
  actorType?: "admin" | "system" | "import";
  source?: string;
};

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await connectDB();
    const { ip, userAgent } = await requestOrigin();

    await AuditLog.create({
      actorId: input.actor?.id ?? null,
      actorName: input.actor?.name ?? (input.actorType === "system" ? "System" : null),
      actorEmail: input.actor?.email ?? null,
      actorRole: input.actor?.roleName ?? null,
      actorType: input.actorType ?? "admin",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      entityLabel: input.entityLabel ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      metadata: input.metadata ?? null,
      batchId: input.batchId ?? null,
      severity: severityFor(input.action),
      ip,
      userAgent,
      source: input.source ?? "admin-ui",
    });
  } catch (err) {
    console.error(`[audit] could not record "${input.action}":`, err);
  }
}

/**
 * Reduces two documents to just the fields that differ.
 *
 * What goes in the log is a diff, not a snapshot: a reviewer wants to read
 * "autonomyStatus: non-autonomous → autonomous", and storing whole student
 * records would scatter personal data through a collection with a far longer
 * retention than the record itself.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: (keyof T)[]
): { before: Record<string, unknown>; after: Record<string, unknown>; changed: boolean } {
  const beforeDiff: Record<string, unknown> = {};
  const afterDiff: Record<string, unknown> = {};

  for (const field of fields) {
    if (!(field in after)) continue;
    const from = normalize(before[field]);
    const to = normalize(after[field]);
    if (from === to) continue;
    beforeDiff[field as string] = before[field] ?? null;
    afterDiff[field as string] = after[field] ?? null;
  }

  return {
    before: beforeDiff,
    after: afterDiff,
    changed: Object.keys(afterDiff).length > 0,
  };
}

/**
 * Compares by value, so a Date and an ObjectId do not read as changed simply
 * because they are different object instances holding the same thing.
 */
function normalize(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Best-effort caller address.
 *
 * `x-forwarded-for` is client-controlled unless a proxy overwrites it, so this
 * is evidence rather than proof — good enough to spot "all of these came from
 * one place", not good enough to hang an accusation on.
 */
async function requestOrigin(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || null;
    return { ip, userAgent: headerList.get("user-agent")?.slice(0, 400) ?? null };
  } catch {
    // Outside a request — a script or a job. Nothing to read.
    return { ip: null, userAgent: null };
  }
}

/** Short, sortable id used to group the rows written by one bulk action. */
export function newBatchId(): string {
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

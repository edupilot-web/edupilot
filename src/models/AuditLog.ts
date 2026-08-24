import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";

/**
 * One recorded administrative action (spec §29).
 *
 * Append-only by convention and by interface: nothing in the app updates or
 * deletes a row here, and no admin screen offers to. An audit trail an
 * administrator can edit is not an audit trail.
 *
 * `before` and `after` hold only the fields that actually changed, not whole
 * documents. Two reasons: a diff is what a reviewer wants to read, and storing
 * full snapshots of a student record would spread personal data across a
 * collection with a much longer retention than the record itself.
 */
const auditLogSchema = new Schema(
  {
    // ── Who ──────────────────────────────────────────────────────────────────
    actorId: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null, index: true },
    /**
     * Denormalised, and deliberately a copy rather than a join: the log must
     * still read correctly after the account is renamed or deleted.
     */
    actorName: { type: String, default: null, maxlength: 120 },
    actorEmail: { type: String, default: null, maxlength: 200 },
    actorRole: { type: String, default: null, maxlength: 80 },
    /** `admin`, `system` for jobs, `import` for rows written by a bulk import. */
    actorType: { type: String, enum: ["admin", "system", "import"], default: "admin" },

    // ── What ─────────────────────────────────────────────────────────────────
    /** Dotted verb: `college.verify`, `student.suspend`, `role.permissions.update`. */
    action: { type: String, required: true, index: true, maxlength: 80 },
    /** Collection-ish name: `College`, `StudentProfile`, `Role`. */
    entityType: { type: String, required: true, index: true, maxlength: 60 },
    entityId: { type: Schema.Types.ObjectId, default: null, index: true },
    /** What the entity was called at the time, so a deleted row is still identifiable. */
    entityLabel: { type: String, default: null, maxlength: 250 },

    /** Changed fields only. `{ autonomyStatus: "non-autonomous" }` → `{ autonomyStatus: "autonomous" }`. */
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    /** Free-form context: a rejection reason, a bulk-action size, an import id. */
    metadata: { type: Schema.Types.Mixed, default: null },

    /** Set when the action was one of many in a bulk operation, so they group. */
    batchId: { type: String, default: null, index: true },

    /**
     * Rows an auditor should be able to filter to first. Set by the recorder
     * from a fixed list of actions rather than judged per call, so "sensitive"
     * means the same thing everywhere.
     */
    severity: { type: String, enum: ["info", "notice", "critical"], default: "info", index: true },

    // ── Where from ───────────────────────────────────────────────────────────
    ip: { type: String, default: null, maxlength: 64 },
    userAgent: { type: String, default: null, maxlength: 400 },
    /** `admin-ui`, `import-job`, `api`, `seed`. */
    source: { type: String, default: "admin-ui", maxlength: 40 },

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

/**
 * The default view: everything, newest first. Declared only here — a
 * field-level `index: true` as well would build a second, ascending index on
 * the same key for no gain.
 */
auditLogSchema.index({ createdAt: -1 });
/** "What happened to this college?" — the entity timeline on a detail page. */
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
/** "What has this admin been doing?" */
auditLogSchema.index({ actorId: 1, createdAt: -1 });

export type AuditLogDoc = InferSchemaType<typeof auditLogSchema>;

resetModelInDev("AuditLog");

export const AuditLog: Model<AuditLogDoc> =
  (mongoose.models.AuditLog as Model<AuditLogDoc>) ||
  mongoose.model<AuditLogDoc>("AuditLog", auditLogSchema);

/**
 * Actions that get `severity: "critical"` regardless of who performs them.
 *
 * A fixed list rather than a judgement at each call site: whether deleting a
 * college is sensitive should not depend on which developer wrote the delete.
 */
export const CRITICAL_ACTIONS = new Set([
  "college.delete",
  "university.delete",
  "student.delete",
  "student.suspend",
  "student.impersonate",
  "admin.invite",
  "admin.deactivate",
  "admin.role.change",
  "role.create",
  "role.delete",
  "role.permissions.update",
  "system.settings.update",
  "system.flag.update",
  "import.commit",
]);

export const NOTICE_ACTIONS = new Set([
  "college.verify",
  "college.reject",
  "college.bulk.update",
  "university.verify",
  "student.verify",
  "student.reject",
  "content.publish",
  "content.delete",
  "export.create",
]);

export function severityFor(action: string): "info" | "notice" | "critical" {
  if (CRITICAL_ACTIONS.has(action)) return "critical";
  if (NOTICE_ACTIONS.has(action)) return "notice";
  return "info";
}

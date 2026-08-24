import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";

/**
 * The operational models: exports, background jobs, feature flags, settings and
 * saved table views.
 *
 * Grouped in one file because each is small and none is interesting on its own;
 * what they have in common is that they describe how the platform is run rather
 * than what it contains.
 */

// ── Exports ────────────────────────────────────────────────────────────────
const exportJobSchema = new Schema(
  {
    entity: { type: String, default: "college", maxlength: 40 },
    format: { type: String, enum: ["csv", "xlsx"], default: "csv" },
    /**
     * The exact filter that produced the file, kept so "export current filtered
     * results" is reproducible and auditable — an export is a copy of personal
     * or commercial data leaving the platform, and "which rows?" must have an
     * answer later.
     */
    filters: { type: Schema.Types.Mixed, default: {} },
    /** Null means every column of the default set. */
    fields: { type: [String], default: [] },
    scope: { type: String, enum: ["all", "filtered", "selected"], default: "filtered" },

    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed", "expired"],
      default: "queued",
      index: true,
    },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    rowCount: { type: Number, default: 0 },
    fileName: { type: String, default: null, maxlength: 260 },
    fileSize: { type: Number, default: 0 },
    /** Generated files expire; the row stays as the record that it happened. */
    downloadUrl: { type: String, default: null, maxlength: 500 },
    expiresAt: { type: Date, default: null },
    errorMessage: { type: String, default: null, maxlength: 500 },

    requestedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null, index: true },
    requestedByName: { type: String, default: null, maxlength: 120 },
    completedAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },
  },
  { timestamps: true }
);

exportJobSchema.index({ createdAt: -1 });

export type ExportJobDoc = InferSchemaType<typeof exportJobSchema>;
resetModelInDev("ExportJob");
export const ExportJob: Model<ExportJobDoc> =
  (mongoose.models.ExportJob as Model<ExportJobDoc>) ||
  mongoose.model<ExportJobDoc>("ExportJob", exportJobSchema);

// ── Background jobs ────────────────────────────────────────────────────────
const backgroundJobSchema = new Schema(
  {
    /** `recount-college-students`, `send-notification-campaign`, `data-quality-scan`. */
    type: { type: String, required: true, index: true, maxlength: 80 },
    label: { type: String, default: null, maxlength: 160 },
    status: {
      type: String,
      enum: ["queued", "running", "completed", "failed", "cancelled"],
      default: "queued",
      index: true,
    },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    payload: { type: Schema.Types.Mixed, default: null },
    result: { type: Schema.Types.Mixed, default: null },
    /** Operator-facing. The stack trace goes to the error log, not here. */
    errorMessage: { type: String, default: null, maxlength: 1000 },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },
    triggeredBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    triggeredByName: { type: String, default: null, maxlength: 120 },
  },
  { timestamps: true }
);

backgroundJobSchema.index({ createdAt: -1 });
backgroundJobSchema.index({ status: 1, createdAt: -1 });

export type BackgroundJobDoc = InferSchemaType<typeof backgroundJobSchema>;
resetModelInDev("BackgroundJob");
export const BackgroundJob: Model<BackgroundJobDoc> =
  (mongoose.models.BackgroundJob as Model<BackgroundJobDoc>) ||
  mongoose.model<BackgroundJobDoc>("BackgroundJob", backgroundJobSchema);

// ── Error log ──────────────────────────────────────────────────────────────
const errorLogSchema = new Schema(
  {
    level: { type: String, enum: ["warn", "error", "fatal"], default: "error", index: true },
    /** `api`, `import`, `email`, `job`, `admin-ui`. */
    source: { type: String, default: "api", maxlength: 60, index: true },
    message: { type: String, required: true, maxlength: 1000 },
    /** Kept for operators only, and never rendered into an admin-facing page. */
    stack: { type: String, default: null, maxlength: 8000 },
    context: { type: Schema.Types.Mixed, default: null },
    /** Same message + source collapses into one row with a count. */
    fingerprint: { type: String, default: null, index: true, maxlength: 120 },
    occurrences: { type: Number, default: 1 },
    lastSeenAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

/**
 * One index on `lastSeenAt`, carrying the TTL — see the note in AdminUser.ts.
 * 90 days: long enough to spot a pattern, short enough to stay cheap.
 */
errorLogSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export type ErrorLogDoc = InferSchemaType<typeof errorLogSchema>;
resetModelInDev("ErrorLog");
export const ErrorLog: Model<ErrorLogDoc> =
  (mongoose.models.ErrorLog as Model<ErrorLogDoc>) ||
  mongoose.model<ErrorLogDoc>("ErrorLog", errorLogSchema);

// ── Feature flags ──────────────────────────────────────────────────────────
const featureFlagSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 80 },
    name: { type: String, required: true, maxlength: 120 },
    description: { type: String, default: null, maxlength: 500 },
    state: {
      type: String,
      enum: ["enabled", "disabled", "beta", "rollout"],
      default: "disabled",
      index: true,
    },
    /** Only meaningful in `rollout`. Bucketed by a hash of the user id, not at random. */
    rolloutPercentage: { type: Number, default: 0, min: 0, max: 100 },
    /** Named cohorts the flag is forced on for, regardless of state. */
    enabledForRoles: { type: [String], default: [] },
    updatedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    updatedByName: { type: String, default: null, maxlength: 120 },
  },
  { timestamps: true }
);

export type FeatureFlagDoc = InferSchemaType<typeof featureFlagSchema>;
resetModelInDev("FeatureFlag");
export const FeatureFlag: Model<FeatureFlagDoc> =
  (mongoose.models.FeatureFlag as Model<FeatureFlagDoc>) ||
  mongoose.model<FeatureFlagDoc>("FeatureFlag", featureFlagSchema);

// ── Settings ───────────────────────────────────────────────────────────────
const settingSchema = new Schema(
  {
    /** `general.platformName`, `security.sessionTimeoutMinutes`. */
    key: { type: String, required: true, unique: true, trim: true, maxlength: 120 },
    /** Groups the settings page into sections. */
    group: { type: String, required: true, maxlength: 40, index: true },
    value: { type: Schema.Types.Mixed, default: null },
    valueType: {
      type: String,
      enum: ["string", "number", "boolean", "json"],
      default: "string",
    },
    label: { type: String, required: true, maxlength: 160 },
    description: { type: String, default: null, maxlength: 500 },
    /** Rendered as a masked field and never echoed back to the browser. */
    secret: { type: Boolean, default: false },
    updatedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    updatedByName: { type: String, default: null, maxlength: 120 },
  },
  { timestamps: true }
);

export type SettingDoc = InferSchemaType<typeof settingSchema>;
resetModelInDev("Setting");
export const Setting: Model<SettingDoc> =
  (mongoose.models.Setting as Model<SettingDoc>) ||
  mongoose.model<SettingDoc>("Setting", settingSchema);

// ── Saved views ────────────────────────────────────────────────────────────
const savedViewSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    /** Which table it belongs to: `colleges`, `students`, `audit`. */
    resource: { type: String, required: true, index: true, maxlength: 40 },
    /** The querystring, stored as parsed pairs so it survives a param rename. */
    filters: { type: Schema.Types.Mixed, default: {} },
    /** Column keys, in display order. Empty means the table's default set. */
    columns: { type: [String], default: [] },
    sort: { type: String, default: null, maxlength: 60 },

    ownerId: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null, index: true },
    /** Shared views appear for every admin who can see the resource. */
    shared: { type: Boolean, default: false },
    /** Seeded starting views ("Pending AP Colleges"). Not deletable. */
    system: { type: Boolean, default: false },
  },
  { timestamps: true }
);

savedViewSchema.index({ resource: 1, ownerId: 1, name: 1 });

export type SavedViewDoc = InferSchemaType<typeof savedViewSchema>;
resetModelInDev("SavedView");
export const SavedView: Model<SavedViewDoc> =
  (mongoose.models.SavedView as Model<SavedViewDoc>) ||
  mongoose.model<SavedViewDoc>("SavedView", savedViewSchema);

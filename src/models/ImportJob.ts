import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";

/**
 * A bulk import, from upload to committed result (spec §10–§11, §42).
 *
 * The job document is the *state machine*; the parsed rows live beside it in
 * `ImportRow`. That split is what lets the wizard work at scale: a 50,000-row
 * file is validated and previewed one page at a time, and the admin can inspect
 * any individual row's errors months later without the job document being
 * megabytes of embedded array.
 *
 * The stages are deliberately explicit rather than a boolean pair. An admin
 * returning to a half-finished import needs to know *which* step to resume at,
 * and a "processing" flag cannot tell them.
 */
export const IMPORT_STAGES = [
  "uploaded",
  "mapping",
  "validating",
  "validated",
  "importing",
  "completed",
  "completed-with-warnings",
  "failed",
  "cancelled",
] as const;
export type ImportStage = (typeof IMPORT_STAGES)[number];

/** What the file is being imported into. Colleges first; the shape generalises. */
export const IMPORT_ENTITIES = ["college", "university", "department", "program"] as const;
export type ImportEntity = (typeof IMPORT_ENTITIES)[number];

const importJobSchema = new Schema(
  {
    entity: { type: String, enum: IMPORT_ENTITIES, default: "college", index: true },
    stage: { type: String, enum: IMPORT_STAGES, default: "uploaded", index: true },

    fileName: { type: String, required: true, maxlength: 260 },
    fileSize: { type: Number, default: 0 },
    fileType: { type: String, enum: ["csv", "xls", "xlsx"], default: "csv" },

    /** Header row exactly as it appeared in the file, in file order. */
    sourceColumns: { type: [String], default: [] },
    /**
     * `{ "College Name": "name", "Univ": "universityName" }` — uploaded header
     * to system field. An unmapped column maps to `""` and is ignored, which is
     * a real answer rather than a missing key.
     */
    columnMapping: { type: Schema.Types.Mixed, default: {} },

    // ── Counts, recomputed at the end of each stage ──────────────────────────
    totalRows: { type: Number, default: 0 },
    validRows: { type: Number, default: 0 },
    invalidRows: { type: Number, default: 0 },
    warningRows: { type: Number, default: 0 },
    duplicateRows: { type: Number, default: 0 },
    createdCount: { type: Number, default: 0 },
    updatedCount: { type: Number, default: 0 },
    skippedCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },

    /** 0–100, for the progress bar. Written as the import walks the rows. */
    progress: { type: Number, default: 0, min: 0, max: 100 },

    /** Options chosen on the preview step, applied to every row at commit. */
    options: {
      duplicateStrategy: {
        type: String,
        enum: ["skip", "update", "create", "ask"],
        default: "ask",
      },
      ignoreWarnings: { type: Boolean, default: false },
      /** Create universities named in the file but not yet in the database. */
      createMissingUniversities: { type: Boolean, default: false },
      dryRun: { type: Boolean, default: false },
    },

    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    /** Milliseconds spent in the commit phase — what "Duration" shows. */
    durationMs: { type: Number, default: null },

    /** Operator-facing failure reason. Never a stack trace. */
    errorMessage: { type: String, default: null, maxlength: 1000 },

    uploadedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null, index: true },
    uploadedByName: { type: String, default: null, maxlength: 120 },
  },
  { timestamps: true }
);

importJobSchema.index({ createdAt: -1 });
importJobSchema.index({ stage: 1, createdAt: -1 });

export type ImportJobDoc = InferSchemaType<typeof importJobSchema>;

resetModelInDev("ImportJob");

export const ImportJob: Model<ImportJobDoc> =
  (mongoose.models.ImportJob as Model<ImportJobDoc>) ||
  mongoose.model<ImportJobDoc>("ImportJob", importJobSchema);

export const ROW_STATUSES = [
  "pending",
  "valid",
  "warning",
  "invalid",
  "duplicate",
  "created",
  "updated",
  "skipped",
  "failed",
] as const;
export type RowStatus = (typeof ROW_STATUSES)[number];

/**
 * One line of an uploaded file, with everything the wizard learned about it.
 *
 * Kept after the import finishes. "Which row created this college, and what did
 * the file actually say?" is the question that comes up three months later when
 * a college complains its name is wrong, and it is unanswerable if the rows are
 * discarded on commit.
 */
const importRowSchema = new Schema(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "ImportJob", required: true, index: true },
    /** 1-based line number as the admin sees it in Excel, header excluded. */
    rowNumber: { type: Number, required: true },

    /** The row exactly as parsed, before mapping. Kept verbatim for the error report. */
    raw: { type: Schema.Types.Mixed, default: {} },
    /** After mapping and coercion — what would actually be written. */
    mapped: { type: Schema.Types.Mixed, default: {} },

    status: { type: String, enum: ROW_STATUSES, default: "pending", index: true },

    /**
     * Named `rowErrors` rather than `errors`: `errors` is a reserved path on a
     * mongoose document and shadowing it breaks validation reporting on the
     * same document.
     */
    rowErrors: {
      type: [
        {
          _id: false,
          field: { type: String, default: null },
          value: { type: String, default: null },
          message: { type: String, required: true },
        },
      ],
      default: [],
    },
    rowWarnings: {
      type: [
        {
          _id: false,
          field: { type: String, default: null },
          value: { type: String, default: null },
          message: { type: String, required: true },
        },
      ],
      default: [],
    },

    // ── Duplicate detection (spec §10 step 5) ────────────────────────────────
    matchedEntityId: { type: Schema.Types.ObjectId, default: null },
    matchedEntityLabel: { type: String, default: null, maxlength: 250 },
    /** 0–100. How the score was reached is in `matchReasons`, so it can be argued with. */
    matchScore: { type: Number, default: null },
    matchReasons: { type: [String], default: [] },
    /** Per-row override of the job-wide duplicate strategy. */
    resolution: {
      type: String,
      enum: ["keep-existing", "update-existing", "create-new", "skip", null],
      default: null,
    },

    /** The document this row produced, once committed. */
    resultEntityId: { type: Schema.Types.ObjectId, default: null },
    failureReason: { type: String, default: null, maxlength: 500 },
  },
  { timestamps: true }
);

/** The wizard's tables: rows of a job filtered by status, in file order. */
importRowSchema.index({ jobId: 1, status: 1, rowNumber: 1 });
importRowSchema.index({ jobId: 1, rowNumber: 1 }, { unique: true });

export type ImportRowDoc = InferSchemaType<typeof importRowSchema>;

resetModelInDev("ImportRow");

export const ImportRow: Model<ImportRowDoc> =
  (mongoose.models.ImportRow as Model<ImportRowDoc>) ||
  mongoose.model<ImportRowDoc>("ImportRow", importRowSchema);

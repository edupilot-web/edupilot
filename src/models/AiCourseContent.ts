import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";
import {
  AI_CONTENT_LENGTHS,
  AI_CONTENT_LEVELS,
  AI_CONTENT_STATUSES,
  AI_CONTENT_TYPES,
  AI_DIFFICULTIES,
  AI_JOB_STATUSES,
  AI_LANGUAGES,
  AI_PROVIDER_TYPES,
  AI_SOURCE_TYPES,
  AI_TEACHING_STYLES,
} from "@/lib/admin/ai/fields";

/**
 * AI course content: the record, its versions, the jobs that produce it, the
 * source material it is grounded on, and the provider configuration (spec §22).
 *
 * Five collections rather than one document with arrays. Versions and jobs both
 * grow without bound and are queried across contents ("every failed job today"),
 * which an embedded array cannot serve; and a 200KB generated course inside the
 * list document would make the library table load megabytes to render a status
 * column.
 *
 * Every content record carries the full academic coordinate, because that tuple
 * is what uniqueness, permissions and the duplicate check are all keyed on
 * (§27) — and because a join per row to discover which college a piece of
 * content belongs to would make the library unusable.
 */

// ── Shared shapes ─────────────────────────────────────────────────────────

/**
 * The academic coordinate, as a reusable field set.
 *
 * Written out per collection rather than shared through a sub-schema: mongoose
 * sub-schemas nest the paths (`context.collegeId`), which would push every index
 * and every query one level deeper for no gain.
 */
function academicCoordinate() {
  return {
    collegeId: { type: Schema.Types.ObjectId, ref: "College", required: true, index: true },
    programId: { type: Schema.Types.ObjectId, ref: "Program", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Department", required: true, index: true },
    regulationId: { type: Schema.Types.ObjectId, ref: "Regulation", required: true, index: true },
    /**
     * The cohort the content was generated for. Unlike the curriculum subject,
     * *content* is academic-year specific: the same R23 subject may be taught
     * with different emphasis to the 2025-26 and 2026-27 batches.
     */
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true, index: true },
    year: { type: Number, required: true, min: 1, max: 8 },
    semester: { type: Number, required: true, min: 1, max: 16 },
    subjectId: { type: Schema.Types.ObjectId, ref: "CurriculumSubject", required: true, index: true },
  } as const;
}

/** Denormalised labels so a table row renders without seven joins. */
function academicLabels() {
  return {
    collegeName: { type: String, default: null, maxlength: 200 },
    programName: { type: String, default: null, maxlength: 200 },
    branchName: { type: String, default: null, maxlength: 160 },
    regulationCode: { type: String, default: null, maxlength: 20 },
    academicYearLabel: { type: String, default: null, maxlength: 20 },
    subjectName: { type: String, default: null, maxlength: 300 },
    subjectCode: { type: String, default: null, maxlength: 24 },
  } as const;
}

/** The generation options an administrator chose (§8). */
const generationConfigSchema = new Schema(
  {
    level: { type: String, enum: AI_CONTENT_LEVELS, default: "undergraduate" },
    language: { type: String, enum: AI_LANGUAGES, default: "english" },
    length: { type: String, enum: AI_CONTENT_LENGTHS, default: "standard" },
    difficulty: { type: String, enum: AI_DIFFICULTIES, default: "moderate" },
    teachingStyles: { type: [String], enum: AI_TEACHING_STYLES, default: ["academic"] },
    /** Free-text steer from the administrator, and the `custom` type's brief. */
    instructions: { type: String, default: null, maxlength: 4000 },
    /** Which unit or topic a scoped generation targets (§28). */
    unitNumber: { type: Number, default: null, min: 1, max: 30 },
    topicNumber: { type: Number, default: null, min: 1, max: 100 },
  },
  { _id: false }
);

/** What the provider reported it spent (§24 cost monitoring). */
const tokenUsageSchema = new Schema(
  {
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    /**
     * Estimated, in the smallest currency unit, and always nullable. A number
     * here is a local estimate from a rate table, never a figure the provider
     * billed — recording an estimate as if it were an invoice is how cost
     * dashboards start lying.
     */
    estimatedCostMicros: { type: Number, default: null },
  },
  { _id: false }
);

// ── ai_course_contents ───────────────────────────────────────────────────

const aiCourseContentSchema = new Schema(
  {
    ...academicCoordinate(),
    ...academicLabels(),

    title: { type: String, required: true, trim: true, maxlength: 300 },
    description: { type: String, default: null, maxlength: 2000 },

    contentType: { type: String, enum: AI_CONTENT_TYPES, required: true, index: true },

    /**
     * The current structured content (§12).
     *
     * `Schema.Types.Mixed` because the shape is per content type and is policed
     * by the zod schemas in `ai/schema.ts` before any write — mongoose would
     * only be able to check it shallowly, and two validators disagreeing is
     * worse than one that owns the question. Never an HTML blob (§44).
     */
    content: { type: Schema.Types.Mixed, default: null },

    status: { type: String, enum: AI_CONTENT_STATUSES, default: "draft", index: true },

    currentVersionId: {
      type: Schema.Types.ObjectId,
      ref: "AiCourseContentVersion",
      default: null,
    },
    versionCount: { type: Number, default: 0 },

    /** Which provider produced what is currently in `content`. */
    provider: { type: String, enum: AI_PROVIDER_TYPES, default: null },
    model: { type: String, default: null, maxlength: 120 },

    /** Set while a job is in flight, so the UI can show progress (§19). */
    activeJobId: { type: Schema.Types.ObjectId, ref: "AiGenerationJob", default: null },
    lastGenerationError: { type: String, default: null, maxlength: 2000 },

    // ── Review and publication (§30, §31) ─────────────────────────────────
    reviewedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    reviewedAt: { type: Date, default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    approvedAt: { type: Date, default: null },

    publishedAt: { type: Date, default: null },
    publishedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    /** The version that went live — not necessarily the newest one since. */
    publishedVersionId: {
      type: Schema.Types.ObjectId,
      ref: "AiCourseContentVersion",
      default: null,
    },

    unpublishedAt: { type: Date, default: null },
    unpublishedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    /** Required by §31 — an unpublish without a stated reason is unauditable. */
    unpublishReason: { type: String, default: null, maxlength: 1000 },

    /**
     * Whether a human has vouched for this as academic material (§42).
     *
     * Default false and never set by the generator. Nothing in the system may
     * describe content as approved, official or faculty-verified unless an
     * administrator has explicitly said so.
     */
    academicallyApproved: { type: Boolean, default: false },

    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
  },
  { timestamps: true }
);

/**
 * The duplicate guard (§27) and the cascade's content lookup.
 *
 * Unique on the full coordinate plus the content type: one subject may hold a
 * question bank *and* a complete course, but not two complete courses for the
 * same cohort. This is what makes "content already exists" a database
 * guarantee rather than a race between two administrators clicking Generate.
 */
aiCourseContentSchema.index(
  {
    collegeId: 1,
    programId: 1,
    branchId: 1,
    regulationId: 1,
    academicYearId: 1,
    year: 1,
    semester: 1,
    subjectId: 1,
    contentType: 1,
  },
  { unique: true, name: "ai_content_academic_coordinate_unique" }
);

/** The library's default sort and filters (§20, §43). */
aiCourseContentSchema.index({ status: 1, updatedAt: -1 });
aiCourseContentSchema.index({ contentType: 1, status: 1, createdAt: -1 });
aiCourseContentSchema.index({ subjectName: "text", subjectCode: "text", title: "text" });

export type AiCourseContentDoc = InferSchemaType<typeof aiCourseContentSchema>;
export type AiGenerationConfig = InferSchemaType<typeof generationConfigSchema>;

resetModelInDev("AiCourseContent");

export const AiCourseContent: Model<AiCourseContentDoc> =
  (mongoose.models.AiCourseContent as Model<AiCourseContentDoc>) ||
  mongoose.model<AiCourseContentDoc>("AiCourseContent", aiCourseContentSchema);

// ── ai_course_content_versions ───────────────────────────────────────────

/**
 * An immutable snapshot of the content at one point (§17).
 *
 * Written once and never updated — restoring an old version creates a *new*
 * version holding the old payload rather than moving a pointer backwards, so
 * the history stays a record of what happened instead of a mutable list.
 */
const aiCourseContentVersionSchema = new Schema(
  {
    courseContentId: {
      type: Schema.Types.ObjectId,
      ref: "AiCourseContent",
      required: true,
      index: true,
    },
    versionNumber: { type: Number, required: true, min: 1 },

    content: { type: Schema.Types.Mixed, default: null },

    /** How this version came about, for the history list. */
    origin: {
      type: String,
      enum: ["generated", "regenerated", "admin-edited", "restored", "assistant-applied"],
      default: "generated",
    },
    /** One line for the version list — "Regenerated unit 3". */
    note: { type: String, default: null, maxlength: 300 },

    generationConfig: { type: generationConfigSchema, default: null },
    /**
     * Which prompt build produced it. Without this, a change to the system
     * prompt makes every historical version unreproducible and unexplainable.
     */
    promptVersion: { type: String, default: null, maxlength: 40 },

    provider: { type: String, enum: AI_PROVIDER_TYPES, default: null },
    model: { type: String, default: null, maxlength: 120 },

    sourceMaterialIds: { type: [Schema.Types.ObjectId], ref: "AiContentSource", default: [] },
    generationJobId: { type: Schema.Types.ObjectId, ref: "AiGenerationJob", default: null },

    tokenUsage: { type: tokenUsageSchema, default: null },

    /** True once this version has been published; blocks any edit (§17). */
    published: { type: Boolean, default: false },
    restoredFromVersion: { type: Number, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

/** One version number per content, and the history list's sort. */
aiCourseContentVersionSchema.index({ courseContentId: 1, versionNumber: -1 }, { unique: true });

export type AiCourseContentVersionDoc = InferSchemaType<typeof aiCourseContentVersionSchema>;

resetModelInDev("AiCourseContentVersion");

export const AiCourseContentVersion: Model<AiCourseContentVersionDoc> =
  (mongoose.models.AiCourseContentVersion as Model<AiCourseContentVersionDoc>) ||
  mongoose.model<AiCourseContentVersionDoc>(
    "AiCourseContentVersion",
    aiCourseContentVersionSchema
  );

// ── ai_generation_jobs ───────────────────────────────────────────────────

/**
 * One generation request and what became of it (§19).
 *
 * Its own collection because generation is asynchronous: the browser posts a
 * request, gets a job id, and polls. Nothing about that flow can live on the
 * content document, which may not exist yet when the job is created.
 */
const aiGenerationJobSchema = new Schema(
  {
    /**
     * Human-facing identifier — "AI-000124" in §38. Sequential ids are worth
     * the counter here: an operator reads these aloud and pastes them into
     * tickets, and a 24-character ObjectId is useless for that.
     */
    reference: { type: String, required: true, unique: true, maxlength: 20 },

    type: {
      type: String,
      enum: ["content-generation", "regeneration", "assistant", "partial-generation"],
      default: "content-generation",
      index: true,
    },

    ...academicCoordinate(),
    ...academicLabels(),

    contentType: { type: String, enum: AI_CONTENT_TYPES, required: true, index: true },
    /** Set once the job has something to write into. */
    courseContentId: { type: Schema.Types.ObjectId, ref: "AiCourseContent", default: null, index: true },

    status: { type: String, enum: AI_JOB_STATUSES, default: "queued", index: true },

    provider: { type: String, enum: AI_PROVIDER_TYPES, default: null },
    model: { type: String, default: null, maxlength: 120 },
    promptVersion: { type: String, default: null, maxlength: 40 },

    generationConfig: { type: generationConfigSchema, default: null },
    sourceMaterialIds: { type: [Schema.Types.ObjectId], ref: "AiContentSource", default: [] },

    /**
     * The resolved request as sent, and the raw response.
     *
     * Kept for reproducibility and for the "View result / View error" actions.
     * `request` holds the *resolved* context, never the caller's payload — the
     * whole point of §10 is that the frontend's academic claims are discarded.
     */
    request: { type: Schema.Types.Mixed, default: null },
    response: { type: Schema.Types.Mixed, default: null },

    /** Operator-facing message. Never a stack trace or a key (§32). */
    error: { type: String, default: null, maxlength: 2000 },
    errorCode: { type: String, default: null, maxlength: 60 },
    attempts: { type: Number, default: 0 },

    tokenUsage: { type: tokenUsageSchema, default: null },

    queuedAt: { type: Date, default: Date.now },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    /** Milliseconds, stored rather than derived so the table can sort on it. */
    durationMs: { type: Number, default: null },

    cancelledBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    createdByName: { type: String, default: null, maxlength: 120 },
  },
  { timestamps: true }
);

aiGenerationJobSchema.index({ status: 1, queuedAt: 1 });
aiGenerationJobSchema.index({ createdAt: -1 });
aiGenerationJobSchema.index({ subjectId: 1, contentType: 1, createdAt: -1 });

export type AiGenerationJobDoc = InferSchemaType<typeof aiGenerationJobSchema>;

resetModelInDev("AiGenerationJob");

export const AiGenerationJob: Model<AiGenerationJobDoc> =
  (mongoose.models.AiGenerationJob as Model<AiGenerationJobDoc>) ||
  mongoose.model<AiGenerationJobDoc>("AiGenerationJob", aiGenerationJobSchema);

// ── ai_content_sources ──────────────────────────────────────────────────

/**
 * Uploaded or referenced material the generator may be grounded on (§9).
 *
 * `extractedText` is stored alongside the file because extraction is expensive
 * and deterministic: doing it once at upload keeps generation fast and lets the
 * text be inspected before it is ever fed to a model. `embedding` is absent by
 * design — vectors belong in the store §39 introduces, not in a document that
 * the library lists.
 */
const aiContentSourceSchema = new Schema(
  {
    collegeId: { type: Schema.Types.ObjectId, ref: "College", default: null, index: true },
    programId: { type: Schema.Types.ObjectId, ref: "Program", default: null },
    branchId: { type: Schema.Types.ObjectId, ref: "Department", default: null },
    regulationId: { type: Schema.Types.ObjectId, ref: "Regulation", default: null },
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", default: null },
    /** Null for material that applies to a whole regulation, not one subject. */
    subjectId: { type: Schema.Types.ObjectId, ref: "CurriculumSubject", default: null, index: true },

    name: { type: String, required: true, trim: true, maxlength: 300 },
    type: { type: String, enum: AI_SOURCE_TYPES, required: true, index: true },

    fileUrl: { type: String, default: null, maxlength: 1000 },
    mimeType: { type: String, default: null, maxlength: 120 },
    fileSize: { type: Number, default: null, min: 0 },

    extractedText: { type: String, default: null },
    /** Set when extraction failed, so the source is visibly unusable. */
    extractionError: { type: String, default: null, maxlength: 600 },
    extractionStatus: {
      type: String,
      enum: ["pending", "extracted", "failed", "not-applicable"],
      default: "pending",
    },

    metadata: { type: Schema.Types.Mixed, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

aiContentSourceSchema.index({ subjectId: 1, type: 1, createdAt: -1 });

export type AiContentSourceDoc = InferSchemaType<typeof aiContentSourceSchema>;

resetModelInDev("AiContentSource");

export const AiContentSource: Model<AiContentSourceDoc> =
  (mongoose.models.AiContentSource as Model<AiContentSourceDoc>) ||
  mongoose.model<AiContentSourceDoc>("AiContentSource", aiContentSourceSchema);

// ── ai_provider_configs ─────────────────────────────────────────────────

/**
 * Provider and generation settings (§24).
 *
 * **No credentials.** `configuration` holds endpoints, model names and tuning;
 * the API key is read from the environment at call time by the provider itself
 * (§22, §44). A key in here would be readable by anyone with database access,
 * would appear in backups, and would leak through any endpoint that returns the
 * document — which is why `toJSON` also strips the field even if one is ever
 * written by mistake.
 */
const aiProviderConfigSchema = new Schema(
  {
    providerName: { type: String, required: true, trim: true, maxlength: 80 },
    providerType: { type: String, enum: AI_PROVIDER_TYPES, required: true },

    model: { type: String, required: true, trim: true, maxlength: 120 },
    /** Only one config may be the active default. Enforced on write. */
    enabled: { type: Boolean, default: false, index: true },
    isDefault: { type: Boolean, default: false },

    /** Endpoint and non-secret options — never a key. */
    configuration: { type: Schema.Types.Mixed, default: null },

    // ── Generation tuning (§24) ──────────────────────────────────────────
    temperature: { type: Number, default: 0.4, min: 0, max: 2 },
    maxTokens: { type: Number, default: 8192, min: 256, max: 200000 },
    topP: { type: Number, default: 0.95, min: 0, max: 1 },

    // ── Content defaults (§24) ───────────────────────────────────────────
    defaultLanguage: { type: String, enum: AI_LANGUAGES, default: "english" },
    defaultDifficulty: { type: String, enum: AI_DIFFICULTIES, default: "moderate" },
    defaultLength: { type: String, enum: AI_CONTENT_LENGTHS, default: "standard" },
    defaultLevel: { type: String, enum: AI_CONTENT_LEVELS, default: "undergraduate" },

    // ── Safety (§24, §25) ────────────────────────────────────────────────
    enableContentValidation: { type: Boolean, default: true },
    enableHallucinationChecks: { type: Boolean, default: true },
    requireAdminReview: { type: Boolean, default: true },
    /**
     * Defaults to true and is the switch §25 depends on. Turning it off does
     * not let the generator publish — nothing in the pipeline can set
     * `published` — it only removes the extra confirmation.
     */
    preventAutomaticPublishing: { type: Boolean, default: true },

    // ── Cost monitoring counters (§24) ───────────────────────────────────
    requestCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    estimatedCostMicros: { type: Number, default: 0 },
    totalDurationMs: { type: Number, default: 0 },

    updatedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
  },
  { timestamps: true }
);

aiProviderConfigSchema.index({ providerType: 1, model: 1 }, { unique: true });

/** Belt and braces: a key written here by mistake never leaves the process. */
aiProviderConfigSchema.set("toJSON", {
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret.__v;
    if (ret.configuration && typeof ret.configuration === "object") {
      const config = ret.configuration as Record<string, unknown>;
      for (const key of Object.keys(config)) {
        if (/key|secret|token|password|credential/i.test(key)) delete config[key];
      }
    }
    return ret;
  },
});

export type AiProviderConfigDoc = InferSchemaType<typeof aiProviderConfigSchema>;

resetModelInDev("AiProviderConfig");

export const AiProviderConfig: Model<AiProviderConfigDoc> =
  (mongoose.models.AiProviderConfig as Model<AiProviderConfigDoc>) ||
  mongoose.model<AiProviderConfigDoc>("AiProviderConfig", aiProviderConfigSchema);

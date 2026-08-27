import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { recordAudit } from "@/lib/admin/audit";
import type { CurrentAdmin } from "@/lib/admin/current-admin";
import {
  AiContentSource,
  AiCourseContent,
  AiGenerationJob,
} from "@/models/AiCourseContent";
import {
  contentTypeLabel,
  type AiContentType,
} from "@/lib/admin/ai/fields";
import { resolveAcademicContext, type AcademicContextInput } from "@/lib/admin/ai/context";
import { buildPrompt } from "@/lib/admin/ai/prompt";
import { ProviderError, parseJsonResponse } from "@/lib/admin/ai/provider";
import { createJob, ensureContentRecord, findExistingContent, saveVersion } from "@/lib/admin/ai/repository";
import { jsonSchemaFor } from "@/lib/admin/ai/schema";
import { recordUsage, resolveAiSettings } from "@/lib/admin/ai/settings";
import { validateGeneratedContent } from "@/lib/admin/ai/validator";
import { MAX_JOB_ATTEMPTS_CLIENT } from "@/components/admin/ai/constants";

/**
 * AIContentGenerator — the pipeline from a request to a reviewable draft
 * (spec §10, §19, §25).
 *
 * Two entry points, deliberately separated:
 *
 *   `requestGeneration`  validates, checks for duplicates, creates a job, and
 *                        returns immediately. Never calls a model.
 *   `runJob`             does the slow work. Called by the job runner.
 *
 * The split is what makes §19 true: the browser posts a request, gets a job
 * reference back in milliseconds, and polls. Nothing in the request path waits
 * on a language model, so a two-minute generation cannot time out an HTTP
 * request or leave a half-written document behind.
 *
 * The strongest thing this file can produce is a **draft with warnings**. It
 * cannot approve, publish or mark content as academically endorsed — §25 and
 * §42 put those behind a human, and there is no code path here that sets them.
 */

/** How much extracted source text is passed to the model, per source (§9). */
const SOURCE_TEXT_BUDGET = 12_000;
/** How many attempts a job gets before it stays failed (§19, §43). */
export const MAX_JOB_ATTEMPTS = 3;

/**
 * The client mirror of the above must agree with it.
 *
 * A retry button offered for an attempt the server will refuse is a worse
 * failure than no button, so the two are tied together at module load rather
 * than left to a comment asking someone to remember.
 */
if (MAX_JOB_ATTEMPTS !== MAX_JOB_ATTEMPTS_CLIENT) {
  throw new Error(
    `MAX_JOB_ATTEMPTS (${MAX_JOB_ATTEMPTS}) and MAX_JOB_ATTEMPTS_CLIENT (${MAX_JOB_ATTEMPTS_CLIENT}) must match.`
  );
}

export type GenerationRequest = AcademicContextInput & {
  contentType: string;
  options?: {
    level?: string;
    language?: string;
    length?: string;
    difficulty?: string;
    teachingStyles?: string[];
    instructions?: string | null;
    unitNumber?: number | null;
    topicNumber?: number | null;
  };
  sourceMaterialIds?: string[];
  /** What to do when content already exists (§27). */
  onDuplicate?: "reject" | "new-version" | "replace-draft";
};

export type GenerationRefusal = {
  code: string;
  message: string;
  field?: string;
  /** Present for a duplicate, so the UI can offer §27's four actions. */
  existing?: {
    id: string;
    status: string;
    versionCount: number;
    coveredUnits: number[];
  };
};

export type GenerationAccepted = {
  jobId: string;
  jobReference: string;
  courseContentId: string;
  provider: string;
  model: string;
  /** True when the mock stood in for an unusable configured provider. */
  usingMock: boolean;
};

export type GenerationResponse =
  | { ok: true; accepted: GenerationAccepted }
  | { ok: false; refusal: GenerationRefusal };

/**
 * Accept or refuse a generation request.
 *
 * Everything that can be decided without a model is decided here, in this order:
 * permission (by the caller), academic context, content type, syllabus presence,
 * duplicates. Only then is a job created — so a refused request costs nothing and
 * an accepted one is known to be runnable.
 */
export async function requestGeneration(
  request: GenerationRequest,
  admin: CurrentAdmin
): Promise<GenerationResponse> {
  const contentType = request.contentType as AiContentType;
  if (!jsonSchemaFor(contentType) && !isKnownType(contentType)) {
    return refuse("unknown-content-type", `"${request.contentType}" is not a content type.`, "contentType");
  }

  // §10: the frontend's academic claims are discarded and the context is
  // resolved from the database. §26: the chain is verified link by link.
  const resolution = await resolveAcademicContext(request);
  if (!resolution.ok) {
    return {
      ok: false,
      refusal: {
        code: resolution.failure.code,
        message: resolution.failure.message,
        field: resolution.failure.field,
      },
    };
  }
  const context = resolution.context;

  // §9: refuse to generate a course structure with nothing to ground it on.
  // Question types are still allowed — they can be built from the subject's
  // objectives — but anything unit-shaped would have to invent the units.
  if (!context.hasSyllabus && needsSyllabus(contentType)) {
    return refuse(
      "no-syllabus",
      `${context.subject.name} has no syllabus or units on record, so ${contentTypeLabel(contentType)} cannot be grounded on the curriculum. Add the syllabus to the subject first, or upload it as source material.`,
      "subjectId"
    );
  }

  if (request.options?.unitNumber) {
    const exists = context.subject.units.some((unit) => unit.unitNumber === request.options?.unitNumber);
    if (!exists) {
      return refuse(
        "unit-not-in-syllabus",
        `Unit ${request.options.unitNumber} is not in the ${context.subject.code} syllabus.`,
        "unitNumber"
      );
    }
  }

  const settings = await resolveAiSettings();

  // §27: duplicate prevention, before anything is spent.
  const coordinate = {
    collegeId: context.college.id,
    programId: context.program.id,
    branchId: context.branch.id,
    regulationId: context.regulation.id,
    academicYearId: context.academicYear.id,
    year: context.year,
    semester: context.semester,
    subjectId: context.subject.id,
  };

  const existing = await findExistingContent(coordinate, contentType);
  if (existing && existing.hasContent) {
    const mode = request.onDuplicate ?? "reject";

    if (mode === "reject") {
      return {
        ok: false,
        refusal: {
          code: "content-exists",
          message: `${contentTypeLabel(contentType)} already exists for ${context.subject.name}.`,
          existing: {
            id: existing.id,
            status: existing.status,
            versionCount: existing.versionCount,
            coveredUnits: existing.coveredUnits,
          },
        },
      };
    }

    // §16, §17: published content is never silently overwritten.
    if (existing.status === "published" && mode === "replace-draft") {
      return {
        ok: false,
        refusal: {
          code: "published-immutable",
          message:
            "This content is published. Generate a new version instead — a published version cannot be replaced.",
          existing: {
            id: existing.id,
            status: existing.status,
            versionCount: existing.versionCount,
            coveredUnits: existing.coveredUnits,
          },
        },
      };
    }
  }

  const record = await ensureContentRecord({
    context,
    academicYearId: context.academicYear.id,
    contentType,
    title: `${context.subject.name} — ${contentTypeLabel(contentType)}`,
    adminId: admin.id,
  });

  const config = {
    level: request.options?.level ?? settings.defaults.level,
    language: request.options?.language ?? settings.defaults.language,
    length: request.options?.length ?? settings.defaults.length,
    difficulty: request.options?.difficulty ?? settings.defaults.difficulty,
    teachingStyles: request.options?.teachingStyles?.length
      ? request.options.teachingStyles
      : ["academic"],
    instructions: request.options?.instructions ?? null,
    unitNumber: request.options?.unitNumber ?? null,
    topicNumber: request.options?.topicNumber ?? null,
  };

  const job = await createJob({
    context,
    academicYearId: context.academicYear.id,
    contentType,
    type: config.unitNumber ? "partial-generation" : existing?.hasContent ? "regeneration" : "content-generation",
    courseContentId: String(record._id),
    generationConfig: config,
    sourceMaterialIds: request.sourceMaterialIds,
    provider: settings.providerType,
    model: settings.model,
    promptVersion: (await import("@/lib/admin/ai/prompt")).PROMPT_VERSION,
    /**
     * The *resolved* context, never the caller's payload.
     *
     * Storing what was actually used is what makes a job reproducible; storing
     * what was asked for would preserve exactly the unverified names §10 exists
     * to discard.
     */
    request: {
      coordinate,
      resolved: {
        college: context.college.name,
        program: context.program.name,
        branch: context.branch.name,
        regulation: context.regulation.code,
        academicYear: context.academicYear.label,
        yearSemester: context.yearSemesterLabel,
        subject: `${context.subject.name} (${context.subject.code})`,
        syllabusUnits: context.subject.units.map((unit) => `${unit.unitNumber}. ${unit.title}`),
      },
      contentType,
      config,
      onDuplicate: request.onDuplicate ?? "reject",
    },
    adminId: admin.id,
    adminName: admin.name,
  });

  await AiCourseContent.updateOne(
    { _id: record._id },
    { $set: { status: "generating", activeJobId: new Types.ObjectId(job.id), lastGenerationError: null } }
  );

  await recordAudit({
    actor: admin,
    action: "ai.generation.requested",
    entityType: "AiCourseContent",
    entityId: String(record._id),
    entityLabel: `${context.subject.name} — ${contentTypeLabel(contentType)}`,
    metadata: {
      jobReference: job.reference,
      contentType,
      provider: settings.providerType,
      model: settings.model,
      college: context.college.name,
      regulation: context.regulation.code,
      semester: context.semester,
    },
  });

  return {
    ok: true,
    accepted: {
      jobId: job.id,
      jobReference: job.reference,
      courseContentId: String(record._id),
      provider: settings.providerType,
      model: settings.model,
      usingMock: settings.providerType === "mock",
    },
  };
}

// ── Running a job ───────────────────────────────────────────────────────

export type JobOutcome =
  | { status: "completed"; versionNumber: number; warnings: number }
  | { status: "failed"; error: string; code: string; retryable: boolean }
  | { status: "skipped"; reason: string };

/**
 * Execute one queued job (§19).
 *
 * Claims the job with a conditional update before doing any work, so two
 * runners — a request-triggered one and a retry — cannot both call the model for
 * the same job and bill twice for one document.
 */
export async function runJob(jobId: string, signal?: AbortSignal): Promise<JobOutcome> {
  await connectDB();

  const claimed = await AiGenerationJob.findOneAndUpdate(
    { _id: jobId, status: { $in: ["queued", "failed"] } },
    { $set: { status: "processing", startedAt: new Date(), error: null, errorCode: null }, $inc: { attempts: 1 } },
    { returnDocument: "after" }
  ).lean();

  if (!claimed) {
    return { status: "skipped", reason: "The job is not queued — it may already be running or finished." };
  }

  const startedAt = Date.now();
  const settings = await resolveAiSettings();

  try {
    // Re-resolve the context rather than trusting the stored one. Between
    // queueing and running, a subject may have been remapped or a regulation
    // archived, and generating against a coordinate that is no longer valid is
    // exactly the leak §26 guards against.
    const coordinate = (claimed.request as { coordinate?: AcademicContextInput })?.coordinate;
    if (!coordinate) throw new ProviderError("unknown", "The job has no stored academic coordinate.", { retryable: false });

    const resolution = await resolveAcademicContext(coordinate);
    if (!resolution.ok) {
      return await failJob(claimed._id, startedAt, {
        code: resolution.failure.code,
        message: `The academic context is no longer valid: ${resolution.failure.message}`,
        retryable: false,
      }, settings.configId);
    }
    const context = resolution.context;

    const contentType = claimed.contentType as AiContentType;
    const config = (claimed.generationConfig ?? {}) as Record<string, unknown>;

    const sourceMaterial = await loadSourceMaterial(
      (claimed.sourceMaterialIds ?? []).map((id) => String(id))
    );

    const jsonSchema = jsonSchemaFor(contentType);
    const prompt = buildPrompt({
      context,
      contentType,
      config: {
        level: String(config.level ?? settings.defaults.level),
        language: String(config.language ?? settings.defaults.language),
        length: String(config.length ?? settings.defaults.length),
        difficulty: String(config.difficulty ?? settings.defaults.difficulty),
        teachingStyles: Array.isArray(config.teachingStyles) ? (config.teachingStyles as string[]) : ["academic"],
        instructions: (config.instructions as string | null) ?? null,
        unitNumber: (config.unitNumber as number | null) ?? null,
        topicNumber: (config.topicNumber as number | null) ?? null,
      },
      sourceMaterial,
      jsonSchema,
    });

    const result = await settings.provider.generateStructured(
      { system: prompt.system, user: prompt.user },
      {
        model: settings.model,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        topP: settings.topP,
        jsonSchema,
        timeoutMs: settings.timeoutMs,
        signal,
      }
    );

    const parsed = parseJsonResponse(result.text);
    if (!parsed.ok) {
      // Keep the raw text on the job so "View error" can show what came back.
      await AiGenerationJob.updateOne(
        { _id: claimed._id },
        { $set: { response: { raw: result.text.slice(0, 20_000) } } }
      );
      return await failJob(claimed._id, startedAt, {
        code: "invalid-response",
        message: parsed.reason,
        retryable: true,
      }, settings.configId, result.usage);
    }

    // §25: the validation pipeline.
    const validation = validateGeneratedContent({
      contentType,
      raw: parsed.value,
      context,
      options: {
        enableContentValidation: settings.safety.enableContentValidation,
        enableHallucinationChecks: settings.safety.enableHallucinationChecks,
      },
    });

    if (!validation.ok) {
      await AiGenerationJob.updateOne(
        { _id: claimed._id },
        { $set: { response: { validation: validation.errors, raw: result.text.slice(0, 8_000) } } }
      );
      return await failJob(claimed._id, startedAt, {
        code: validation.errors[0]?.code ?? "validation-failed",
        message: `The generated content failed validation: ${validation.errors.map((issue) => issue.message).join(" ")}`,
        retryable: validation.errors.every((issue) => issue.stage === "schema"),
      }, settings.configId, result.usage);
    }

    const contentId = claimed.courseContentId ? String(claimed.courseContentId) : null;
    if (!contentId) throw new ProviderError("unknown", "The job has no content record.", { retryable: false });

    const version = await saveVersion({
      courseContentId: contentId,
      content: validation.content,
      origin: claimed.type === "regeneration" ? "regenerated" : "generated",
      note:
        config.unitNumber != null
          ? `Generated unit ${config.unitNumber} via ${settings.providerType}`
          : `Generated via ${settings.providerType}`,
      generationConfig: config,
      promptVersion: prompt.promptVersion,
      provider: settings.providerType,
      model: result.model,
      sourceMaterialIds: (claimed.sourceMaterialIds ?? []).map((id) => String(id)),
      generationJobId: String(claimed._id),
      tokenUsage: result.usage,
      adminId: String(claimed.createdBy),
    });

    /**
     * Always `generated`, never `approved` or `published` (§25, §42).
     *
     * `requireAdminReview` does not gate this: there is no setting that makes
     * the pipeline publish, only one that adds a review step in front of
     * approval. The safety switch removes a prompt, not the human.
     */
    await AiCourseContent.updateOne(
      { _id: contentId },
      {
        $set: {
          status: "generated",
          activeJobId: null,
          lastGenerationError: null,
          provider: settings.providerType,
          model: result.model,
        },
      }
    );

    const durationMs = Date.now() - startedAt;
    await AiGenerationJob.updateOne(
      { _id: claimed._id },
      {
        $set: {
          status: "completed",
          completedAt: new Date(),
          durationMs,
          tokenUsage: result.usage,
          error: null,
          errorCode: null,
          response: {
            versionNumber: version.versionNumber,
            warnings: validation.warnings,
            usage: result.usage,
          },
        },
      }
    );

    await recordUsage({
      configId: settings.configId,
      tokens: result.usage.totalTokens,
      durationMs,
      failed: false,
    });

    await recordAudit({
      actor: null,
      actorType: "system",
      action: "ai.generation.completed",
      entityType: "AiCourseContent",
      entityId: contentId,
      entityLabel: `${context.subject.name} — ${contentTypeLabel(contentType)}`,
      metadata: {
        jobReference: claimed.reference,
        versionNumber: version.versionNumber,
        provider: settings.providerType,
        model: result.model,
        totalTokens: result.usage.totalTokens,
        warnings: validation.warnings.length,
        durationMs,
      },
    });

    return { status: "completed", versionNumber: version.versionNumber, warnings: validation.warnings.length };
  } catch (err) {
    const providerError =
      err instanceof ProviderError
        ? err
        : new ProviderError("unknown", "The generation failed unexpectedly.", { retryable: false });

    // The message is safe to show: `ProviderError` messages are written for
    // operators and never carry a key, a stack trace or a response body (§32).
    if (!(err instanceof ProviderError)) {
      console.error("[ai] job failed:", err);
    }

    return await failJob(
      claimed._id,
      startedAt,
      { code: providerError.code, message: providerError.message, retryable: providerError.retryable },
      settings.configId
    );
  }
}

async function failJob(
  jobId: Types.ObjectId,
  startedAt: number,
  failure: { code: string; message: string; retryable: boolean },
  configId: string | null,
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
): Promise<JobOutcome> {
  const durationMs = Date.now() - startedAt;

  const job = await AiGenerationJob.findOneAndUpdate(
    { _id: jobId },
    {
      $set: {
        status: failure.code === "cancelled" ? "cancelled" : "failed",
        completedAt: new Date(),
        durationMs,
        error: failure.message,
        errorCode: failure.code,
        ...(usage ? { tokenUsage: usage } : {}),
      },
    },
    { returnDocument: "after" }
  ).lean();

  if (job?.courseContentId) {
    /**
     * The content goes back to a *usable* state, not to `failed`.
     *
     * A record that already holds a good version must not be marked failed
     * because a regeneration was refused — the operator would lose sight of the
     * content they still have. Only a record with nothing in it becomes failed.
     */
    const record = await AiCourseContent.findById(job.courseContentId).select("content versionCount").lean();
    const hasContent = Boolean(record?.content);

    await AiCourseContent.updateOne(
      { _id: job.courseContentId },
      {
        $set: {
          status: hasContent ? "generated" : "failed",
          activeJobId: null,
          lastGenerationError: failure.message,
        },
      }
    );
  }

  await recordUsage({
    configId,
    tokens: usage?.totalTokens ?? 0,
    durationMs,
    failed: true,
  });

  await recordAudit({
    actor: null,
    actorType: "system",
    action: "ai.generation.failed",
    entityType: "AiGenerationJob",
    entityId: String(jobId),
    entityLabel: job?.reference ?? String(jobId),
    metadata: { code: failure.code, message: failure.message, retryable: failure.retryable, durationMs },
  });

  return { status: "failed", error: failure.message, code: failure.code, retryable: failure.retryable };
}

/**
 * Load and budget the extracted text of the chosen sources (§9).
 *
 * Truncated per source rather than in total, so one large PDF cannot crowd the
 * others out entirely — a prompt that silently dropped three of four selected
 * sources would be grounding on something the operator did not choose.
 */
async function loadSourceMaterial(
  ids: string[]
): Promise<{ name: string; type: string; text: string }[]> {
  if (!ids.length) return [];

  await connectDB();

  const rows = await AiContentSource.find({
    _id: { $in: ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id)) },
    extractionStatus: "extracted",
  })
    .select("name type extractedText")
    .limit(10)
    .lean();

  return rows
    .filter((row) => row.extractedText?.trim())
    .map((row) => ({
      name: row.name,
      type: row.type,
      text:
        row.extractedText!.length > SOURCE_TEXT_BUDGET
          ? `${row.extractedText!.slice(0, SOURCE_TEXT_BUDGET)}\n\n[truncated — ${row.extractedText!.length - SOURCE_TEXT_BUDGET} more characters not shown]`
          : row.extractedText!,
    }));
}

/**
 * Whether this content type is meaningless without a syllabus (§9).
 *
 * The unit-shaped types are: generating them with no units on record would mean
 * inventing the unit structure, which rule 4 forbids outright. Question and
 * summary types can still be grounded on the subject's objectives and outcomes,
 * so they are allowed with a warning attached by the validator instead.
 */
const SYLLABUS_REQUIRED: AiContentType[] = [
  "complete-course",
  "unit-structure",
  "unit-content",
  "lesson-content",
  "study-notes",
  "revision-notes",
  "exam-preparation",
  "lab-guidance",
];

function needsSyllabus(contentType: AiContentType): boolean {
  return SYLLABUS_REQUIRED.includes(contentType);
}

function refuse(code: string, message: string, field?: string): GenerationResponse {
  return { ok: false, refusal: { code, message, field } };
}

function isKnownType(contentType: string): boolean {
  return Boolean(jsonSchemaFor(contentType));
}

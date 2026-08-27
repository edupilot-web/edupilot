import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import {
  AiCourseContent,
  AiCourseContentVersion,
  AiGenerationJob,
  type AiCourseContentDoc,
} from "@/models/AiCourseContent";
import type { ResolvedAcademicContext } from "@/lib/admin/ai/context";
import {
  IMMUTABLE_STATUSES,
  type AiContentStatus,
  type AiContentType,
} from "@/lib/admin/ai/fields";

/**
 * AIContentRepository — every write to content, versions and jobs (spec §22).
 *
 * Centralised so three invariants hold everywhere rather than at each call site:
 *
 *   1. **A version is written for every change.** Content is never updated
 *      without a snapshot of what it was (§17). A caller that could skip this
 *      would eventually skip it.
 *   2. **Published versions are immutable.** `published: true` on a version and
 *      `status: "published"` on the record both block in-place edits (§16, §17).
 *   3. **Version numbers are allocated under a filter, not read-then-written.**
 *      Two administrators regenerating at once must not both get version 4.
 */

export type ContentCoordinate = {
  collegeId: string;
  programId: string;
  branchId: string;
  regulationId: string;
  academicYearId: string;
  year: number;
  semester: number;
  subjectId: string;
};

export function coordinateFrom(
  context: ResolvedAcademicContext,
  academicYearId?: string
): ContentCoordinate {
  return {
    collegeId: context.college.id,
    programId: context.program.id,
    branchId: context.branch.id,
    regulationId: context.regulation.id,
    academicYearId: academicYearId ?? context.academicYear.id,
    year: context.year,
    semester: context.semester,
    subjectId: context.subject.id,
  };
}

function ids(coordinate: ContentCoordinate) {
  return {
    collegeId: new Types.ObjectId(coordinate.collegeId),
    programId: new Types.ObjectId(coordinate.programId),
    branchId: new Types.ObjectId(coordinate.branchId),
    regulationId: new Types.ObjectId(coordinate.regulationId),
    academicYearId: new Types.ObjectId(coordinate.academicYearId),
    year: coordinate.year,
    semester: coordinate.semester,
    subjectId: new Types.ObjectId(coordinate.subjectId),
  };
}

function labels(context: ResolvedAcademicContext) {
  return {
    collegeName: context.college.name,
    programName: context.program.name,
    branchName: context.branch.name,
    regulationCode: context.regulation.code,
    academicYearLabel: context.academicYear.label,
    subjectName: context.subject.name,
    subjectCode: context.subject.code,
  };
}

// ── Duplicate detection (spec §27) ──────────────────────────────────────

export type ExistingContent = {
  id: string;
  status: AiContentStatus;
  versionCount: number;
  updatedAt: Date;
  title: string;
  hasContent: boolean;
  /** Which syllabus units the current content covers, for "generate missing". */
  coveredUnits: number[];
};

/**
 * Whether content already exists for this exact coordinate and type.
 *
 * Read *before* generating (§27) so the operator is offered Open / New version /
 * Generate missing / Replace draft rather than being told about a collision
 * after a model has been paid for. The unique index is still the backstop for
 * two simultaneous requests.
 */
export async function findExistingContent(
  coordinate: ContentCoordinate,
  contentType: AiContentType
): Promise<ExistingContent | null> {
  await connectDB();

  const row = await AiCourseContent.findOne({ ...ids(coordinate), contentType })
    .select("status versionCount updatedAt title content")
    .lean();

  if (!row) return null;

  return {
    id: String(row._id),
    status: row.status as AiContentStatus,
    versionCount: row.versionCount ?? 0,
    updatedAt: row.updatedAt as Date,
    title: row.title,
    hasContent: Boolean(row.content),
    coveredUnits: coveredUnitsOf(row.content),
  };
}

/** Unit numbers present in a stored content payload. */
export function coveredUnitsOf(content: unknown): number[] {
  if (!content || typeof content !== "object") return [];
  const record = content as Record<string, unknown>;

  const declared = Array.isArray(record.syllabusUnitsCovered)
    ? record.syllabusUnitsCovered.filter((entry): entry is number => typeof entry === "number")
    : [];
  if (declared.length) return [...new Set(declared)].sort((a, b) => a - b);

  const units = Array.isArray(record.units) ? record.units : [];
  const found = units
    .map((unit) => (unit && typeof unit === "object" ? (unit as Record<string, unknown>).unitNumber : null))
    .filter((value): value is number => typeof value === "number");
  return [...new Set(found)].sort((a, b) => a - b);
}

// ── Content records ─────────────────────────────────────────────────────

/**
 * Get or create the record a job will write into.
 *
 * An upsert on the unique coordinate, so two jobs racing for the same subject
 * converge on one document instead of one of them failing with a duplicate-key
 * error the operator would have to interpret.
 */
export async function ensureContentRecord(input: {
  context: ResolvedAcademicContext;
  academicYearId: string;
  contentType: AiContentType;
  title: string;
  adminId: string;
}): Promise<AiCourseContentDoc & { _id: Types.ObjectId }> {
  await connectDB();

  const coordinate = coordinateFrom(input.context, input.academicYearId);

  const row = await AiCourseContent.findOneAndUpdate(
    { ...ids(coordinate), contentType: input.contentType },
    {
      $set: { ...labels(input.context), updatedBy: new Types.ObjectId(input.adminId) },
      $setOnInsert: {
        title: input.title,
        status: "draft",
        createdBy: new Types.ObjectId(input.adminId),
        academicallyApproved: false,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();

  return row as AiCourseContentDoc & { _id: Types.ObjectId };
}

/**
 * Write a new version and point the record at it.
 *
 * The version number is allocated by counting under the same filter the insert
 * uses, then retried on a duplicate-key collision — which is what makes two
 * concurrent regenerations produce versions 4 and 5 rather than one failure.
 */
export async function saveVersion(input: {
  courseContentId: string;
  content: unknown;
  origin: "generated" | "regenerated" | "admin-edited" | "restored" | "assistant-applied";
  note?: string | null;
  generationConfig?: unknown;
  promptVersion?: string | null;
  provider?: string | null;
  model?: string | null;
  sourceMaterialIds?: string[];
  generationJobId?: string | null;
  tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  restoredFromVersion?: number | null;
  adminId: string;
  /** Leave the record's own `content` alone — used when only archiving a snapshot. */
  updateCurrent?: boolean;
}): Promise<{ versionId: string; versionNumber: number }> {
  await connectDB();

  const contentId = new Types.ObjectId(input.courseContentId);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const latest = await AiCourseContentVersion.findOne({ courseContentId: contentId })
      .sort({ versionNumber: -1 })
      .select("versionNumber")
      .lean();

    const versionNumber = (latest?.versionNumber ?? 0) + 1;

    try {
      const version: { _id: Types.ObjectId } = await AiCourseContentVersion.create({
        // The enum is the authority on provider names; the cast is at this one
        // boundary rather than threaded through every caller's signature.
        courseContentId: contentId,
        versionNumber,
        content: input.content,
        origin: input.origin,
        note: input.note ?? null,
        generationConfig: (input.generationConfig ?? null) as never,
        promptVersion: input.promptVersion ?? null,
        provider: (input.provider ?? null) as never,
        model: input.model ?? null,
        sourceMaterialIds: (input.sourceMaterialIds ?? []).map((id) => new Types.ObjectId(id)),
        generationJobId: input.generationJobId ? new Types.ObjectId(input.generationJobId) : null,
        tokenUsage: input.tokenUsage ?? null,
        restoredFromVersion: input.restoredFromVersion ?? null,
        published: false,
        createdBy: new Types.ObjectId(input.adminId),
      });

      await AiCourseContent.updateOne(
        { _id: contentId },
        {
          $set: {
            currentVersionId: version._id,
            ...(input.updateCurrent === false ? {} : { content: input.content }),
            provider: (input.provider ?? null) as never,
            model: input.model ?? null,
            updatedBy: new Types.ObjectId(input.adminId),
          },
          $inc: { versionCount: 1 },
        }
      );

      return { versionId: String(version._id), versionNumber };
    } catch (err) {
      // Duplicate version number: another writer took it. Recount and retry.
      const duplicate =
        err && typeof err === "object" && (err as { code?: number }).code === 11000;
      if (!duplicate || attempt === 4) throw err;
    }
  }

  throw new Error("Could not allocate a version number after five attempts.");
}

/**
 * Whether the record may be edited in place.
 *
 * Published content is immutable (§17): the way to change it is a new version,
 * which is why this returns a reason rather than a boolean — the reason becomes
 * the message on the editor's disabled save button.
 */
export function editBlockedReason(status: AiContentStatus): string | null {
  if (IMMUTABLE_STATUSES.includes(status)) {
    return "This content is published. Create a new version to change it — published versions are immutable.";
  }
  if (status === "generating") {
    return "A generation job is running for this content. Wait for it to finish.";
  }
  return null;
}

// ── Jobs (spec §19) ─────────────────────────────────────────────────────

/**
 * Allocate the next human-readable job reference.
 *
 * Counting documents would repeat a reference after a deletion, so this reads
 * the highest existing one. A collection scan is avoided by the index on
 * `reference`; a race produces a duplicate-key error, which the caller retries.
 */
export async function nextJobReference(): Promise<string> {
  await connectDB();

  const latest = await AiGenerationJob.findOne({})
    .sort({ reference: -1 })
    .select("reference")
    .lean();

  const current = latest?.reference ? Number(latest.reference.replace(/\D/g, "")) : 0;
  return `AI-${String(current + 1).padStart(6, "0")}`;
}

export async function createJob(input: {
  context: ResolvedAcademicContext;
  academicYearId: string;
  contentType: AiContentType;
  type: "content-generation" | "regeneration" | "assistant" | "partial-generation";
  courseContentId?: string | null;
  generationConfig: unknown;
  sourceMaterialIds?: string[];
  provider: string;
  model: string;
  promptVersion: string;
  request: unknown;
  adminId: string;
  adminName: string;
}): Promise<{ id: string; reference: string }> {
  await connectDB();

  const coordinate = coordinateFrom(input.context, input.academicYearId);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reference = await nextJobReference();
    try {
      const job: { _id: Types.ObjectId } = await AiGenerationJob.create({
        reference,
        type: input.type,
        ...ids(coordinate),
        ...labels(input.context),
        contentType: input.contentType,
        courseContentId: input.courseContentId ? new Types.ObjectId(input.courseContentId) : null,
        status: "queued",
        provider: input.provider as never,
        model: input.model,
        promptVersion: input.promptVersion,
        generationConfig: input.generationConfig as never,
        sourceMaterialIds: (input.sourceMaterialIds ?? []).map((id) => new Types.ObjectId(id)),
        request: input.request as never,
        attempts: 0,
        queuedAt: new Date(),
        createdBy: new Types.ObjectId(input.adminId),
        createdByName: input.adminName,
      });
      return { id: String(job._id), reference };
    } catch (err) {
      const duplicate = err && typeof err === "object" && (err as { code?: number }).code === 11000;
      if (!duplicate || attempt === 4) throw err;
    }
  }

  throw new Error("Could not allocate a job reference after five attempts.");
}

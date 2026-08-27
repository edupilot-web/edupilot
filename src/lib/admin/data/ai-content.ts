import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { CurriculumSubject } from "@/models/Curriculum";
import {
  AiCourseContent,
  AiGenerationJob,
} from "@/models/AiCourseContent";
import {
  AI_CONTENT_STATUSES,
  AI_CONTENT_TYPES,
  AI_JOB_STATUSES,
  contentTypeLabel,
  type AiContentStatus,
  type AiJobStatus,
} from "@/lib/admin/ai/fields";
import { containsRegex, readPagination, readParam, type SearchParams } from "@/lib/admin/query";

/**
 * Read models for the AI screens: the landing summary, the content library and
 * the job list (spec §3, §19, §20, §21).
 *
 * Filtering and search are server-side (§21) and paginated (§43). The library is
 * expected to grow to one row per subject per content type per cohort — tens of
 * thousands — so nothing here loads a full collection to count or filter it in
 * application code.
 */

/** Filter keys the library understands, for the shared query helpers. */
export const AI_CONTENT_FILTER_KEYS = [
  "college",
  "program",
  "branch",
  "regulation",
  "academicYear",
  "year",
  "semester",
  "subject",
  "contentType",
  "status",
  "createdBy",
  "provider",
  "from",
  "to",
] as const;

export const AI_CONTENT_SORT_FIELDS = ["updatedAt", "createdAt", "subjectName", "status"] as const;

function objectId(value: string | undefined): Types.ObjectId | null {
  if (!value || !Types.ObjectId.isValid(value)) return null;
  return new Types.ObjectId(value);
}

/**
 * Translate query parameters into a mongo filter.
 *
 * Unknown enum values are dropped rather than passed through: a hand-edited
 * `?status=whatever` should show everything, not an empty table that reads as
 * "no content exists".
 */
function contentFilter(params: SearchParams): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  const pairs: [string, string][] = [
    ["college", "collegeId"],
    ["program", "programId"],
    ["branch", "branchId"],
    ["regulation", "regulationId"],
    ["academicYear", "academicYearId"],
    ["subject", "subjectId"],
  ];
  for (const [param, field] of pairs) {
    const id = objectId(readParam(params, param));
    if (id) filter[field] = id;
  }

  const year = Number(readParam(params, "year"));
  if (Number.isInteger(year) && year >= 1 && year <= 8) filter.year = year;

  const semester = Number(readParam(params, "semester"));
  if (Number.isInteger(semester) && semester >= 1 && semester <= 16) filter.semester = semester;

  const contentType = readParam(params, "contentType");
  if (contentType && AI_CONTENT_TYPES.includes(contentType as never)) filter.contentType = contentType;

  const status = readParam(params, "status");
  if (status && AI_CONTENT_STATUSES.includes(status as never)) filter.status = status;

  const provider = readParam(params, "provider");
  if (provider) filter.provider = provider;

  const createdBy = objectId(readParam(params, "createdBy"));
  if (createdBy) filter.createdBy = createdBy;

  const from = readParam(params, "from");
  const to = readParam(params, "to");
  if (from || to) {
    const range: Record<string, Date> = {};
    if (from && !Number.isNaN(Date.parse(from))) range.$gte = new Date(from);
    if (to && !Number.isNaN(Date.parse(to))) range.$lte = new Date(`${to}T23:59:59.999Z`);
    if (Object.keys(range).length) filter.updatedAt = range;
  }

  /**
   * Search (§21).
   *
   * A regex `$or` across the denormalised labels rather than the `$text` index:
   * `$text` cannot do prefix matching, so typing "data str" would find nothing,
   * which is the opposite of what a search box should do. The fields are all
   * indexed individually and the result set is paginated.
   */
  const query = readParam(params, "q")?.trim();
  if (query && query.length >= 2) {
    const term = containsRegex(query);
    filter.$or = [
      { subjectName: term },
      { subjectCode: term },
      { title: term },
      { collegeName: term },
      { programName: term },
      { branchName: term },
    ];
  }

  return filter;
}

// ── Landing summary (spec §3) ───────────────────────────────────────────

export type AiSummary = {
  totalSubjects: number;
  contentGenerated: number;
  published: number;
  drafts: number;
  jobs: number;
  failedJobs: number;
};

/**
 * The six cards on the landing page.
 *
 * `countDocuments` per card rather than one aggregation: each is an indexed
 * count, they run in parallel, and a single `$facet` would scan the whole
 * collection to produce the same six numbers.
 *
 * "Content Generated" counts records that actually hold content, not records
 * that exist — a row created by a failed job holds nothing and would otherwise
 * inflate the number an operator uses to judge coverage.
 */
export async function getAiSummary(): Promise<AiSummary> {
  await connectDB();

  const [totalSubjects, contentGenerated, published, drafts, jobs, failedJobs] = await Promise.all([
    CurriculumSubject.countDocuments({ status: "active" }),
    AiCourseContent.countDocuments({ content: { $ne: null } }),
    AiCourseContent.countDocuments({ status: "published" }),
    AiCourseContent.countDocuments({ status: { $in: ["draft", "generated", "under-review"] } }),
    AiGenerationJob.countDocuments({}),
    AiGenerationJob.countDocuments({ status: "failed" }),
  ]);

  return { totalSubjects, contentGenerated, published, drafts, jobs, failedJobs };
}

/** Status counts for the library's quick filters. */
export async function getContentStatusCounts(): Promise<Record<string, number>> {
  await connectDB();

  const rows = await AiCourseContent.aggregate<{ _id: string; n: number }>([
    { $group: { _id: "$status", n: { $sum: 1 } } },
  ]);

  const counts: Record<string, number> = {};
  for (const status of AI_CONTENT_STATUSES) counts[status] = 0;
  for (const row of rows) if (row._id) counts[row._id] = row.n;
  return counts;
}

// ── Content library (spec §20) ──────────────────────────────────────────

export type ContentRow = {
  id: string;
  title: string;
  contentType: string;
  contentTypeLabel: string;
  status: AiContentStatus;
  subjectName: string | null;
  subjectCode: string | null;
  collegeName: string | null;
  branchName: string | null;
  regulationCode: string | null;
  academicYearLabel: string | null;
  year: number;
  semester: number;
  versionCount: number;
  provider: string | null;
  model: string | null;
  updatedAt: Date;
  publishedAt: Date | null;
  hasContent: boolean;
  academicallyApproved: boolean;
};

export async function listAiContent(params: SearchParams): Promise<{
  rows: ContentRow[];
  total: number;
  page: number;
  limit: number;
}> {
  await connectDB();

  const { page, limit, skip } = readPagination(params);
  const filter = contentFilter(params);

  const sortField = readParam(params, "sort") ?? "updatedAt";
  const direction = readParam(params, "dir") === "asc" ? 1 : -1;
  const sort: Record<string, 1 | -1> = AI_CONTENT_SORT_FIELDS.includes(sortField as never)
    ? { [sortField]: direction }
    : { updatedAt: -1 };

  const [rows, total] = await Promise.all([
    AiCourseContent.find(filter)
      .select(
        "title contentType status subjectName subjectCode collegeName branchName regulationCode academicYearLabel year semester versionCount provider model updatedAt publishedAt content academicallyApproved"
      )
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    AiCourseContent.countDocuments(filter),
  ]);

  return {
    rows: rows.map((row) => ({
      id: String(row._id),
      title: row.title,
      contentType: row.contentType,
      contentTypeLabel: contentTypeLabel(row.contentType),
      status: row.status as AiContentStatus,
      subjectName: row.subjectName ?? null,
      subjectCode: row.subjectCode ?? null,
      collegeName: row.collegeName ?? null,
      branchName: row.branchName ?? null,
      regulationCode: row.regulationCode ?? null,
      academicYearLabel: row.academicYearLabel ?? null,
      year: row.year,
      semester: row.semester,
      versionCount: row.versionCount ?? 0,
      provider: row.provider ?? null,
      model: row.model ?? null,
      updatedAt: row.updatedAt as Date,
      publishedAt: (row.publishedAt as Date | null) ?? null,
      hasContent: Boolean(row.content),
      academicallyApproved: row.academicallyApproved === true,
    })),
    total,
    page,
    limit,
  };
}

/** Distinct values for the library's filter chips. */
export async function getAiContentFacets(): Promise<{
  colleges: { value: string; label: string; count: number }[];
  providers: { value: string; label: string; count: number }[];
  contentTypes: { value: string; label: string; count: number }[];
}> {
  await connectDB();

  const [colleges, providers, types] = await Promise.all([
    AiCourseContent.aggregate<{ _id: Types.ObjectId | null; label: string | null; n: number }>([
      { $group: { _id: "$collegeId", label: { $first: "$collegeName" }, n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 12 },
    ]),
    AiCourseContent.aggregate<{ _id: string | null; n: number }>([
      { $group: { _id: "$provider", n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]),
    AiCourseContent.aggregate<{ _id: string | null; n: number }>([
      { $group: { _id: "$contentType", n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 12 },
    ]),
  ]);

  return {
    colleges: colleges
      .filter((row) => row._id && row.label)
      .map((row) => ({ value: String(row._id), label: row.label as string, count: row.n })),
    providers: providers
      .filter((row) => row._id)
      .map((row) => ({ value: row._id as string, label: row._id as string, count: row.n })),
    contentTypes: types
      .filter((row) => row._id)
      .map((row) => ({
        value: row._id as string,
        label: contentTypeLabel(row._id as string),
        count: row.n,
      })),
  };
}

// ── Generation jobs (spec §19) ──────────────────────────────────────────

export const AI_JOB_FILTER_KEYS = ["status", "contentType", "college", "subject", "provider"] as const;

export type JobRow = {
  id: string;
  reference: string;
  status: AiJobStatus;
  type: string;
  contentType: string;
  contentTypeLabel: string;
  courseContentId: string | null;
  collegeName: string | null;
  programName: string | null;
  subjectName: string | null;
  subjectCode: string | null;
  regulationCode: string | null;
  semester: number;
  provider: string | null;
  model: string | null;
  requestedBy: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  totalTokens: number | null;
  attempts: number;
  error: string | null;
  errorCode: string | null;
};

export async function listGenerationJobs(params: SearchParams): Promise<{
  rows: JobRow[];
  total: number;
  page: number;
  limit: number;
  counts: Record<string, number>;
}> {
  await connectDB();

  const { page, limit, skip } = readPagination(params);

  const filter: Record<string, unknown> = {};
  const status = readParam(params, "status");
  if (status && AI_JOB_STATUSES.includes(status as never)) filter.status = status;

  const contentType = readParam(params, "contentType");
  if (contentType && AI_CONTENT_TYPES.includes(contentType as never)) filter.contentType = contentType;

  const college = objectId(readParam(params, "college"));
  if (college) filter.collegeId = college;

  const subject = objectId(readParam(params, "subject"));
  if (subject) filter.subjectId = subject;

  const provider = readParam(params, "provider");
  if (provider) filter.provider = provider;

  const query = readParam(params, "q")?.trim();
  if (query && query.length >= 2) {
    const term = containsRegex(query);
    filter.$or = [{ reference: term }, { subjectName: term }, { subjectCode: term }, { collegeName: term }];
  }

  const [rows, total, statusRows] = await Promise.all([
    AiGenerationJob.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AiGenerationJob.countDocuments(filter),
    AiGenerationJob.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);

  const counts: Record<string, number> = {};
  for (const jobStatus of AI_JOB_STATUSES) counts[jobStatus] = 0;
  for (const row of statusRows) if (row._id) counts[row._id] = row.n;

  return {
    rows: rows.map((row) => ({
      id: String(row._id),
      reference: row.reference,
      status: row.status as AiJobStatus,
      type: row.type,
      contentType: row.contentType,
      contentTypeLabel: contentTypeLabel(row.contentType),
      courseContentId: row.courseContentId ? String(row.courseContentId) : null,
      collegeName: row.collegeName ?? null,
      programName: row.programName ?? null,
      subjectName: row.subjectName ?? null,
      subjectCode: row.subjectCode ?? null,
      regulationCode: row.regulationCode ?? null,
      semester: row.semester,
      provider: row.provider ?? null,
      model: row.model ?? null,
      requestedBy: row.createdByName ?? null,
      startedAt: (row.startedAt as Date | null) ?? null,
      completedAt: (row.completedAt as Date | null) ?? null,
      durationMs: row.durationMs ?? null,
      totalTokens: row.tokenUsage?.totalTokens ?? null,
      attempts: row.attempts ?? 0,
      error: row.error ?? null,
      errorCode: row.errorCode ?? null,
    })),
    total,
    page,
    limit,
    counts,
  };
}

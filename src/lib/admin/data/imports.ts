import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { ImportJob, ImportRow } from "@/models/ImportJob";
import { readPagination, readParam, type SearchParams } from "@/lib/admin/query";

/** The job document, flattened for the wizard pages. */
export async function getImportJob(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  await connectDB();

  const job = await ImportJob.findById(id).lean();
  if (!job) return null;

  return {
    id: String(job._id),
    entity: job.entity,
    stage: job.stage,
    fileName: job.fileName,
    fileSize: job.fileSize,
    fileType: job.fileType,
    sourceColumns: job.sourceColumns,
    columnMapping: (job.columnMapping ?? {}) as Record<string, string>,
    totalRows: job.totalRows,
    validRows: job.validRows,
    invalidRows: job.invalidRows,
    warningRows: job.warningRows,
    duplicateRows: job.duplicateRows,
    createdCount: job.createdCount,
    updatedCount: job.updatedCount,
    skippedCount: job.skippedCount,
    failedCount: job.failedCount,
    progress: job.progress,
    options: {
      duplicateStrategy: job.options?.duplicateStrategy ?? "ask",
      ignoreWarnings: job.options?.ignoreWarnings ?? false,
      createMissingUniversities: job.options?.createMissingUniversities ?? false,
    },
    errorMessage: job.errorMessage ?? null,
    uploadedByName: job.uploadedByName ?? null,
    createdAt: job.createdAt,
    completedAt: job.completedAt ?? null,
    durationMs: job.durationMs ?? null,
  };
}

/** First few parsed rows, so the mapping screen can show real values. */
export async function getImportSampleRows(
  jobId: string,
  count: number
): Promise<Record<string, string>[]> {
  if (!mongoose.Types.ObjectId.isValid(jobId)) return [];
  await connectDB();

  const rows = await ImportRow.find({ jobId }).select("raw").sort({ rowNumber: 1 }).limit(count).lean();
  return rows.map((row) => (row.raw ?? {}) as Record<string, string>);
}

type IssueLike = { field?: string | null; value?: string | null; message: string };

function toIssue(issue: IssueLike): { field: string | null; value: string | null; message: string } {
  return { field: issue.field ?? null, value: issue.value ?? null, message: issue.message };
}

export type ImportRowView = {
  id: string;
  rowNumber: number;
  status: string;
  raw: Record<string, string>;
  mapped: Record<string, unknown>;
  errors: { field: string | null; value: string | null; message: string }[];
  warnings: { field: string | null; value: string | null; message: string }[];
  matchedEntityId: string | null;
  matchedEntityLabel: string | null;
  matchScore: number | null;
  matchReasons: string[];
  resolution: string | null;
  resultEntityId: string | null;
  failureReason: string | null;
};

/**
 * Rows of a job, filtered by status.
 *
 * Paginated even on the review screen. A 50,000-row file cannot be rendered at
 * once, and the operator does not want to read it — they want the errors, the
 * duplicates, and a count of the rest.
 */
export async function listImportRows(
  jobId: string,
  params: SearchParams,
  defaultStatus?: string
): Promise<{ rows: ImportRowView[]; total: number; page: number; limit: number; status: string }> {
  await connectDB();
  const { page, limit, skip } = readPagination(params);

  const status = readParam(params, "status") ?? defaultStatus ?? "all";
  const filter: Record<string, unknown> = { jobId };
  if (status !== "all") filter.status = status;

  const [docs, total] = await Promise.all([
    ImportRow.find(filter).sort({ rowNumber: 1 }).skip(skip).limit(limit).lean(),
    ImportRow.countDocuments(filter),
  ]);

  return {
    total,
    page,
    limit,
    status,
    rows: docs.map((doc) => ({
      id: String(doc._id),
      rowNumber: doc.rowNumber,
      status: doc.status,
      raw: (doc.raw ?? {}) as Record<string, string>,
      mapped: (doc.mapped ?? {}) as Record<string, unknown>,
      // Normalised rather than passed through: mongoose infers optional
      // subdocument fields as `string | null | undefined`, and the view type
      // promises `string | null`.
      errors: (doc.rowErrors ?? []).map(toIssue),
      warnings: (doc.rowWarnings ?? []).map(toIssue),
      matchedEntityId: doc.matchedEntityId ? String(doc.matchedEntityId) : null,
      matchedEntityLabel: doc.matchedEntityLabel ?? null,
      matchScore: doc.matchScore ?? null,
      matchReasons: doc.matchReasons ?? [],
      resolution: doc.resolution ?? null,
      resultEntityId: doc.resultEntityId ? String(doc.resultEntityId) : null,
      failureReason: doc.failureReason ?? null,
    })),
  };
}

/** Row counts per status, for the review screen's tabs. */
export async function getImportRowCounts(jobId: string): Promise<Record<string, number>> {
  await connectDB();
  const rows = await ImportRow.aggregate<{ _id: string; count: number }>([
    { $match: { jobId: new mongoose.Types.ObjectId(jobId) } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const counts: Record<string, number> = {};
  let all = 0;
  for (const row of rows) {
    counts[row._id] = row.count;
    all += row.count;
  }
  counts.all = all;
  return counts;
}

/** How many duplicates still have no per-row decision. */
export async function countUnresolvedDuplicates(jobId: string): Promise<number> {
  await connectDB();
  return ImportRow.countDocuments({ jobId, status: "duplicate", resolution: null });
}

export async function listImportJobs(params: SearchParams) {
  await connectDB();
  const { page, limit, skip } = readPagination(params);

  const stage = readParam(params, "stage");
  const filter: Record<string, unknown> = {};
  if (stage) filter.stage = stage;

  const [docs, total] = await Promise.all([
    ImportJob.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ImportJob.countDocuments(filter),
  ]);

  return {
    total,
    page,
    limit,
    rows: docs.map((doc) => ({
      id: String(doc._id),
      fileName: doc.fileName,
      fileType: doc.fileType,
      stage: doc.stage,
      totalRows: doc.totalRows,
      createdCount: doc.createdCount,
      updatedCount: doc.updatedCount,
      skippedCount: doc.skippedCount,
      failedCount: doc.failedCount,
      invalidRows: doc.invalidRows,
      uploadedByName: doc.uploadedByName ?? "Unknown",
      createdAt: doc.createdAt,
      durationMs: doc.durationMs ?? null,
      progress: doc.progress,
    })),
  };
}

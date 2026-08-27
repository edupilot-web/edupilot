import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { fail, ok, withPermission } from "@/lib/admin/ai/api";
import { AdminUser } from "@/models/AdminUser";
import { AiCourseContent, AiCourseContentVersion } from "@/models/AiCourseContent";
import { coveredUnitsOf } from "@/lib/admin/ai/repository";

/**
 * GET /api/admin/ai/course-content/:id/versions  (spec §17, §35)
 *
 * The version history. Returns metadata plus a small shape summary per version —
 * enough for the list and for a "compare" view to show what changed in size —
 * but never the payloads themselves: a subject with twelve versions of a
 * complete course would be megabytes.
 *
 * Pass `?include=<n>` to get one version's full content, which is what View and
 * Compare fetch.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withPermission("ai_course_content.view", async () => {
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) return fail("That is not a content id.", 400, { code: "invalid-id" });

    await connectDB();

    const record = await AiCourseContent.findById(id)
      .select("title currentVersionId publishedVersionId versionCount contentType")
      .lean();
    if (!record) return fail("That content no longer exists.", 404, { code: "content-not-found" });

    const rows = await AiCourseContentVersion.find({ courseContentId: record._id })
      .sort({ versionNumber: -1 })
      .limit(100)
      .lean();

    // One lookup for every author, rather than one per row.
    const authorIds = [...new Set(rows.map((row) => row.createdBy).filter(Boolean).map(String))];
    const authors = await AdminUser.find({ _id: { $in: authorIds } }).select("name").lean();
    const authorName = new Map(authors.map((author) => [String(author._id), author.name]));

    const requested = new URL(req.url).searchParams.get("include");
    const includeNumber = requested ? Number(requested) : null;

    const versions = rows.map((row) => {
      const isCurrent = String(row._id) === String(record.currentVersionId);
      const isPublished = String(row._id) === String(record.publishedVersionId);

      return {
        id: String(row._id),
        versionNumber: row.versionNumber,
        origin: row.origin,
        note: row.note,
        createdAt: row.createdAt,
        createdBy: row.createdBy ? (authorName.get(String(row.createdBy)) ?? null) : null,
        provider: row.provider,
        model: row.model,
        promptVersion: row.promptVersion,
        tokenUsage: row.tokenUsage ?? null,
        restoredFromVersion: row.restoredFromVersion,

        isCurrent,
        /**
         * `published` on the version *or* being the record's published version.
         *
         * Both are checked because a version stays flagged after an unpublish
         * (it was live once) while the record's pointer is what "the live one"
         * means now.
         */
        isPublished,
        immutable: row.published === true,

        summary: summarise(row.content),
        /** Only when explicitly asked for, and only one at a time. */
        content: includeNumber === row.versionNumber ? (row.content ?? null) : undefined,
      };
    });

    return ok({
      contentId: String(record._id),
      title: record.title,
      contentType: record.contentType,
      versionCount: record.versionCount ?? versions.length,
      versions,
    });
  });
}

/**
 * A cheap shape summary, so the list can say what a version holds.
 *
 * Counts rather than content: "5 units, 24 topics" tells a reviewer whether a
 * version is complete, which is the question the history list is usually being
 * asked.
 */
function summarise(content: unknown): Record<string, number> & { units?: number } {
  const summary: Record<string, number> = {};
  if (!content || typeof content !== "object") return summary;

  const record = content as Record<string, unknown>;

  const units = Array.isArray(record.units) ? record.units : null;
  if (units) {
    summary.units = units.length;
    summary.topics = units.reduce((total, unit) => {
      const topics = unit && typeof unit === "object" ? (unit as Record<string, unknown>).topics : null;
      return total + (Array.isArray(topics) ? topics.length : 0);
    }, 0);
  }

  for (const key of ["mcqs", "questions", "shortAnswers", "longAnswers", "flashcards", "notes", "lessons", "experiments", "assignments", "caseStudies", "sections"] as const) {
    const value = record[key];
    if (Array.isArray(value)) summary[key] = value.length;
  }

  const covered = coveredUnitsOf(content);
  if (covered.length) summary.unitsCovered = covered.length;

  return summary;
}

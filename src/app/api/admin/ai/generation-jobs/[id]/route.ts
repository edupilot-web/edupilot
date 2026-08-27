import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { fail, ok, withPermission } from "@/lib/admin/ai/api";
import { AiGenerationJob } from "@/models/AiCourseContent";
import { contentTypeLabel } from "@/lib/admin/ai/fields";

/**
 * GET /api/admin/ai/generation-jobs/:id  (spec §19, §35)
 *
 * The endpoint the generation screen polls. Kept deliberately small — a poll
 * that returned the whole generated document would transfer a 200KB course on
 * every tick — so it carries status, timing, usage and the error, and the
 * content is fetched once from the content endpoint when the job completes.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withPermission("ai_course_content.view", async () => {
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return fail("That is not a job id.", 400, { code: "invalid-id" });
    }

    await connectDB();

    const job = await AiGenerationJob.findById(id).lean();
    if (!job) return fail("That job no longer exists.", 404, { code: "job-not-found" });

    const response = (job.response ?? null) as Record<string, unknown> | null;

    return ok({
      job: {
        id: String(job._id),
        reference: job.reference,
        type: job.type,
        status: job.status,
        contentType: job.contentType,
        contentTypeLabel: contentTypeLabel(job.contentType),
        courseContentId: job.courseContentId ? String(job.courseContentId) : null,

        college: job.collegeName,
        program: job.programName,
        branch: job.branchName,
        regulation: job.regulationCode,
        academicYear: job.academicYearLabel,
        subject: job.subjectName,
        subjectCode: job.subjectCode,
        semester: job.semester,

        provider: job.provider,
        model: job.model,
        promptVersion: job.promptVersion,

        requestedBy: job.createdByName,
        queuedAt: job.queuedAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        durationMs: job.durationMs,
        attempts: job.attempts,

        tokenUsage: job.tokenUsage ?? null,

        error: job.error,
        errorCode: job.errorCode,

        /**
         * Only the summary of the result, never the content itself.
         *
         * `warnings` is the part that matters on this screen: a completed job
         * with three validation warnings needs a reviewer's attention, and
         * hiding that behind a separate request would mean it went unseen.
         */
        result: response
          ? {
              versionNumber: response.versionNumber ?? null,
              warnings: Array.isArray(response.warnings) ? response.warnings : [],
              /** Present when the response could not be parsed — for "View error". */
              hasRawResponse: typeof response.raw === "string",
            }
          : null,
      },
    });
  });
}

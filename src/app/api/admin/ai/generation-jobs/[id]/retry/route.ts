import { after } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { recordAudit } from "@/lib/admin/audit";
import { fail, ok, withGenerationLimit } from "@/lib/admin/ai/api";
import { MAX_JOB_ATTEMPTS, runJob } from "@/lib/admin/ai/generator";
import { AiCourseContent, AiGenerationJob } from "@/models/AiCourseContent";

/**
 * POST /api/admin/ai/generation-jobs/:id/retry  (spec §19, §35)
 *
 * Re-queues a failed job and runs it after the response, exactly as the original
 * request did.
 *
 * Retry needs the *generate* permission, not merely *view*: it spends money and
 * writes a version, so it is the same privilege as asking in the first place
 * (§33). It is also rate limited on the same bucket, or a failing job would be
 * a free way around the generation limit.
 */
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withGenerationLimit("ai_course_content.generate", async (admin) => {
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return fail("That is not a job id.", 400, { code: "invalid-id" });
    }

    await connectDB();

    const job = await AiGenerationJob.findById(id).select("status attempts reference contentType courseContentId").lean();
    if (!job) return fail("That job no longer exists.", 404, { code: "job-not-found" });

    if (job.status === "processing") {
      return fail("That job is already running.", 409, { code: "job-running" });
    }
    if (job.status === "completed") {
      return fail(
        "That job already completed. Generate a new version instead of retrying it.",
        409,
        { code: "job-completed" }
      );
    }
    if ((job.attempts ?? 0) >= MAX_JOB_ATTEMPTS) {
      return fail(
        `That job has already been attempted ${job.attempts} times. Review the error and start a new generation rather than retrying again.`,
        409,
        { code: "attempts-exhausted" }
      );
    }

    /**
     * Reset to `queued` so `runJob`'s conditional claim can pick it up.
     *
     * A cancelled job is deliberately re-queueable: an operator who cancelled by
     * mistake should not have to rebuild the whole request.
     */
    await AiGenerationJob.updateOne(
      { _id: job._id },
      { $set: { status: "queued", error: null, errorCode: null, completedAt: null, durationMs: null } }
    );

    if (job.courseContentId) {
      await AiCourseContent.updateOne(
        { _id: job.courseContentId },
        { $set: { status: "generating", activeJobId: job._id, lastGenerationError: null } }
      );
    }

    await recordAudit({
      actor: admin,
      action: "ai.generation.retried",
      entityType: "AiGenerationJob",
      entityId: String(job._id),
      entityLabel: job.reference,
      metadata: { attempt: (job.attempts ?? 0) + 1, contentType: job.contentType },
    });

    after(async () => {
      try {
        await runJob(String(job._id));
      } catch (err) {
        console.error(`[ai] retry of ${job.reference} could not be run:`, err);
      }
    });

    return ok({ jobId: String(job._id), reference: job.reference, status: "queued" }, 202);
  });
}

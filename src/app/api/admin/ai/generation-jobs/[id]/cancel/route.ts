import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { recordAudit } from "@/lib/admin/audit";
import { fail, ok, withPermission } from "@/lib/admin/ai/api";
import { AiCourseContent, AiGenerationJob } from "@/models/AiCourseContent";
import { TERMINAL_JOB_STATUSES, type AiJobStatus } from "@/lib/admin/ai/fields";

/**
 * POST /api/admin/ai/generation-jobs/:id/cancel  (spec §19)
 *
 * Marks a job cancelled. A queued job will never be claimed; a job already in
 * flight is *recorded* as cancelled but the provider call it started is not
 * abandoned — `after()` work has no handle to signal from another request.
 *
 * That limitation is stated in the response rather than hidden, because an
 * operator who believed a cancel had stopped a running generation would be
 * surprised when a version appeared a minute later.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withPermission("ai_course_content.generate", async (admin) => {
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return fail("That is not a job id.", 400, { code: "invalid-id" });
    }

    await connectDB();

    const job = await AiGenerationJob.findById(id).select("status reference courseContentId").lean();
    if (!job) return fail("That job no longer exists.", 404, { code: "job-not-found" });

    if (TERMINAL_JOB_STATUSES.includes(job.status as AiJobStatus)) {
      return fail(`That job has already ${job.status}.`, 409, { code: "job-finished" });
    }

    const wasRunning = job.status === "processing";

    await AiGenerationJob.updateOne(
      { _id: job._id },
      {
        $set: {
          status: "cancelled",
          completedAt: new Date(),
          cancelledBy: new Types.ObjectId(admin.id),
          error: "Cancelled by an administrator.",
          errorCode: "cancelled",
        },
      }
    );

    if (job.courseContentId) {
      // Return the record to a usable state rather than leaving it "generating"
      // for ever. Content that already holds a version keeps it.
      const record = await AiCourseContent.findById(job.courseContentId).select("content").lean();
      await AiCourseContent.updateOne(
        { _id: job.courseContentId },
        {
          $set: {
            status: record?.content ? "generated" : "draft",
            activeJobId: null,
            lastGenerationError: "The generation was cancelled.",
          },
        }
      );
    }

    await recordAudit({
      actor: admin,
      action: "ai.generation.cancelled",
      entityType: "AiGenerationJob",
      entityId: String(job._id),
      entityLabel: job.reference,
      metadata: { wasRunning },
    });

    return ok({
      jobId: String(job._id),
      status: "cancelled",
      note: wasRunning
        ? "The job was already running. It is recorded as cancelled, but a provider call already in flight may still finish and write a version."
        : "The job was queued and will not run.",
    });
  });
}

import { after } from "next/server";
import { fail, handleError, ok } from "@/lib/api";
import { recordAudit } from "@/lib/admin/audit";
import {
  completePublishJob,
  notifyAssignmentPublished,
  publishAssignment,
  ValidationError,
} from "@/lib/teaching/assignments";
import { requireSubject, requireTeacher } from "@/lib/teaching/teacher";
import { getTeacherAssignment } from "@/lib/teaching/teacher-view";
import { consumeRateLimits, formatRetryAfter } from "@/lib/rate-limit";

/**
 * POST /api/teacher/assignments/:id/publish  (§17, §60)
 *
 * The full pipeline, in the order §60 sets out. What runs *inside* the request
 * and what runs after it is the decision this route exists to make:
 *
 *   **Inside** — authorise, validate, resolve the audience, snapshot the
 *   target, write one `AssignmentStudent` row per recipient. All of it is
 *   correctness: the student's list reads from those rows, so telling the
 *   teacher "published" before they exist would be a lie with a race attached,
 *   and the count shown must be the count published to.
 *
 *   **After** — the notification fan-out (§17, §62). Nothing depends on it:
 *   a student who never sees the prompt still finds the assignment in their
 *   list. It is also the only part that scales with the audience twice over,
 *   since each recipient needs a preference lookup and a row.
 *
 * `after()` is the platform's queue — the same mechanism the AI module uses,
 * and the one that fits a deployment with no worker process. A `BackgroundJob`
 * row is written alongside so an operator can see the fan-out happened and how
 * big it was, which `after()` alone records nowhere.
 */

/**
 * `after` inherits the route's budget, so a fan-out to a large cohort that
 * outlived the default would be killed halfway and leave a job stuck.
 */
export const maxDuration = 300;

/**
 * Publishing is rate limited per teacher (§85).
 *
 * Each publish resolves an audience and writes two rows per student. Twenty an
 * hour is far above a real teaching day and well below what an accidental loop
 * in a client would do.
 */
const PUBLISH_LIMIT = { limit: 20, windowSeconds: 60 * 60 };

export async function POST(
  _req: Request,
  ctx: RouteContext<"/api/teacher/assignments/[id]/publish">
) {
  try {
    const teacher = await requireTeacher("PUBLISH_ASSIGNMENT");
    const { id } = await ctx.params;

    const allowance = await consumeRateLimits([
      { key: `assignment-publish:${teacher.userId}`, rule: PUBLISH_LIMIT },
    ]);

    if (!allowance.allowed) {
      return fail(
        `Too many assignments published. Try again ${formatRetryAfter(allowance.retryAfterSeconds)}.`,
        429
      );
    }

    // Loaded first so the subject can be re-authorised: a teacher removed from
    // the subject since saving the draft must not be able to publish it (§78).
    const existing = await getTeacherAssignment(teacher, id);
    if (!existing) return fail("That assignment could not be found.", 404);

    const subject = await requireSubject(teacher, existing.subjectId);

    const result = await publishAssignment(teacher, subject, id);

    after(async () => {
      try {
        const notified = await notifyAssignmentPublished(result.id, result.batchId);
        await completePublishJob(result.batchId, { notified });
      } catch (err) {
        console.error(`[assignments] fan-out failed for ${result.id}:`, err);
        await completePublishJob(result.batchId, {
          notified: 0,
          failed: true,
          error: err instanceof Error ? err.message : "unknown",
        });
      }
    });

    await recordAudit({
      actor: null,
      actorType: "system",
      action: "assignment.published",
      entityType: "Assignment",
      entityId: result.id,
      entityLabel: existing.title,
      metadata: {
        teacherUserId: teacher.userId,
        teacherName: teacher.name,
        collegeId: teacher.collegeId,
        subjectId: subject.subjectId,
        eligibleStudents: result.eligibleStudents,
      },
      source: "teacher-ui",
    });

    return ok({
      id: result.id,
      status: "published",
      eligibleStudents: result.eligibleStudents,
      audienceNotes: result.audience,
      warning: result.warning,
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      return fail(err.message, 422, { details: { issues: err.issues } });
    }
    return handleError(err);
  }
}

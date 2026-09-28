import { after } from "next/server";
import { fail, handleError, ok } from "@/lib/api";
import { recordAudit } from "@/lib/admin/audit";
import { ValidationError } from "@/lib/teaching/assignments";
import { notifyNotePublished, publishNote } from "@/lib/teaching/notes";
import { consumeRateLimits, formatRetryAfter } from "@/lib/rate-limit";
import { requireSubject, requireTeacher } from "@/lib/teaching/teacher";
import { getTeacherNote } from "@/lib/teaching/teacher-view";

/**
 * POST /api/teacher/notes/:id/publish  (§61)
 *
 * The same split as publishing an assignment: the audience resolution and the
 * `NoteRecipient` rows run inside the request because the student's list reads
 * from them, and the notification fan-out runs after it because nothing depends
 * on it.
 */
export const maxDuration = 300;

const PUBLISH_LIMIT = { limit: 30, windowSeconds: 60 * 60 };

export async function POST(_req: Request, ctx: RouteContext<"/api/teacher/notes/[id]/publish">) {
  try {
    const teacher = await requireTeacher("PUBLISH_NOTE");
    const { id } = await ctx.params;

    const allowance = await consumeRateLimits([
      { key: `note-publish:${teacher.userId}`, rule: PUBLISH_LIMIT },
    ]);

    if (!allowance.allowed) {
      return fail(
        `Too many notes published. Try again ${formatRetryAfter(allowance.retryAfterSeconds)}.`,
        429
      );
    }

    const existing = await getTeacherNote(teacher, id);
    if (!existing) return fail("Those notes could not be found.", 404);

    const subject = await requireSubject(teacher, existing.subjectId);
    const result = await publishNote(teacher, subject, id);

    after(async () => {
      try {
        await notifyNotePublished(result.id, result.batchId);
      } catch (err) {
        console.error(`[notes] fan-out failed for ${result.id}:`, err);
      }
    });

    await recordAudit({
      actor: null,
      actorType: "system",
      action: "note.published",
      entityType: "Note",
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
      warning: result.warning,
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      return fail(err.message, 422, { details: { issues: err.issues } });
    }
    return handleError(err);
  }
}

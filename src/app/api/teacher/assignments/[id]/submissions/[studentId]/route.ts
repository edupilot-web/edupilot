import { fail, handleError, ok } from "@/lib/api";
import { getSubmission, gradeSubmission } from "@/lib/teaching/submissions";
import { requireTeacher } from "@/lib/teaching/teacher";
import { gradeSchema } from "@/lib/teaching/validation";
import { recordAudit } from "@/lib/admin/audit";

/**
 * GET  /api/teacher/assignments/:id/submissions/:studentId — one submission
 * POST /api/teacher/assignments/:id/submissions/:studentId — grade it
 *
 * Addressed by student rather than by submission id, deliberately. A student
 * may have several attempts and the teacher is grading *the student's work*,
 * not one attempt in isolation — so the id that identifies the thing being
 * graded is the pair, and the attempts come back as history beside it.
 *
 * Both are scoped by `teacherUserId` inside the query (§94's fifth test), so a
 * teacher reaching for a colleague's submission gets a 404 rather than a row.
 */
export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/teacher/assignments/[id]/submissions/[studentId]">
) {
  try {
    const teacher = await requireTeacher("VIEW_SUBMISSIONS");
    const { id, studentId } = await ctx.params;

    const submission = await getSubmission(teacher, id, studentId);
    if (!submission) return fail("That submission could not be found.", 404);

    return ok({ submission });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  req: Request,
  ctx: RouteContext<"/api/teacher/assignments/[id]/submissions/[studentId]">
) {
  try {
    const teacher = await requireTeacher("GRADE_ASSIGNMENT");
    const { id, studentId } = await ctx.params;

    const parsed = gradeSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return fail(issue?.message ?? "Check the marks and try again", 422, {
        field: issue?.path.join("."),
      });
    }

    const result = await gradeSubmission(teacher, id, studentId, {
      marks: parsed.data.marks,
      feedback: parsed.data.feedback ?? null,
    });

    /**
     * Grading is audited (§83).
     *
     * A changed mark is the action most likely to be disputed, and the only
     * defensible answer to "it used to say 8" is a record of who changed it and
     * when.
     */
    await recordAudit({
      actor: null,
      actorType: "system",
      action: "assignment.graded",
      entityType: "Assignment",
      entityId: id,
      metadata: {
        teacherUserId: teacher.userId,
        teacherName: teacher.name,
        studentId,
        marks: result.marks,
      },
      source: "teacher-ui",
    });

    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}

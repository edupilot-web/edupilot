import { fail, handleError, ok } from "@/lib/api";
import { updateAssignment, ValidationError } from "@/lib/teaching/assignments";
import { countAudience } from "@/lib/teaching/audience";
import { requireSubject, requireTeacher } from "@/lib/teaching/teacher";
import { getTeacherAssignment } from "@/lib/teaching/teacher-view";
import { assignmentUpdateSchema } from "@/lib/teaching/validation";

/**
 * GET /api/teacher/assignments/:id — one assignment, with its engagement
 * PUT /api/teacher/assignments/:id — edit it
 *
 * The update schema has no `subjectId` (§77). Re-pointing published work at a
 * different subject would leave every `AssignmentStudent` row for an audience
 * that no longer matches, and the students holding them with no explanation —
 * so the field is unrepresentable rather than merely refused.
 *
 * A material edit to a published assignment notifies its students (§79); a
 * cosmetic one does not. The line is drawn in `updateAssignment` at what a
 * student would have to act on.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/teacher/assignments/[id]">) {
  try {
    const teacher = await requireTeacher();
    const { id } = await ctx.params;

    const assignment = await getTeacherAssignment(teacher, id);
    if (!assignment) return fail("That assignment could not be found.", 404);

    // The live audience, so a draft saved last month shows the cohort it would
    // actually reach today rather than the one it would have reached then.
    const subject = await requireSubject(teacher, assignment.subjectId).catch(() => null);
    const audience = subject
      ? await countAudience({
          collegeId: subject.collegeId,
          programId: subject.programId,
          branchId: subject.branchId,
          regulationId: subject.regulationId,
          semester: subject.semester,
          admissionYear: subject.admissionYear,
        })
      : null;

    return ok({
      assignment,
      eligibleStudents: audience?.count ?? null,
      audienceNotes: audience?.skipped ?? null,
      /**
       * Surfaced so the screen can explain a disabled publish button: a teacher
       * whose subject assignment was revoked keeps the draft and loses the
       * ability to send it (§89).
       */
      canManage: Boolean(subject),
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: Request, ctx: RouteContext<"/api/teacher/assignments/[id]">) {
  try {
    const teacher = await requireTeacher("EDIT_ASSIGNMENT");
    const { id } = await ctx.params;

    const parsed = assignmentUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return fail(issue?.message ?? "Check the form and try again", 422, {
        field: issue?.path.join("."),
      });
    }

    const existing = await getTeacherAssignment(teacher, id);
    if (!existing) return fail("That assignment could not be found.", 404);

    // Re-authorised on every edit: a teacher removed from the subject keeps the
    // draft and loses the ability to change it (§78, §89).
    await requireSubject(teacher, existing.subjectId);

    const result = await updateAssignment(teacher, id, parsed.data);

    return ok({
      id: result.id,
      notifiedStudents: result.notifiedStudents,
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      return fail(err.message, 422, { details: { issues: err.issues } });
    }
    return handleError(err);
  }
}

import { fail, handleError, ok } from "@/lib/api";
import { ValidationError } from "@/lib/teaching/assignments";
import { updateNote } from "@/lib/teaching/notes";
import { requireSubject, requireTeacher } from "@/lib/teaching/teacher";
import { getTeacherNote } from "@/lib/teaching/teacher-view";
import { noteUpdateSchema } from "@/lib/teaching/validation";

/**
 * GET /api/teacher/notes/:id — one note, with its engagement (§47)
 * PUT /api/teacher/notes/:id — edit it
 *
 * Editing a published note does **not** notify. Unlike an assignment nothing
 * about a note is owed back or time-bound, so a correction is not something a
 * student has to act on — and a platform that pinged them for every typo is one
 * whose notifications get muted.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/teacher/notes/[id]">) {
  try {
    const teacher = await requireTeacher();
    const { id } = await ctx.params;

    const note = await getTeacherNote(teacher, id);
    if (!note) return fail("Those notes could not be found.", 404);

    return ok({ note });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: Request, ctx: RouteContext<"/api/teacher/notes/[id]">) {
  try {
    const teacher = await requireTeacher("EDIT_NOTE");
    const { id } = await ctx.params;

    const parsed = noteUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return fail(issue?.message ?? "Check the form and try again", 422, {
        field: issue?.path.join("."),
      });
    }

    const existing = await getTeacherNote(teacher, id);
    if (!existing) return fail("Those notes could not be found.", 404);

    // Re-authorised, so a teacher removed from the subject keeps the draft and
    // loses the ability to change it (§78).
    await requireSubject(teacher, existing.subjectId);

    const result = await updateNote(teacher, id, parsed.data);
    return ok(result);
  } catch (err) {
    if (err instanceof ValidationError) {
      return fail(err.message, 422, { details: { issues: err.issues } });
    }
    return handleError(err);
  }
}

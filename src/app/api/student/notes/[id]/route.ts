import { after } from "next/server";
import { fail, handleError, ok, requireAuth } from "@/lib/api";
import { getStudentNote, recordNoteView } from "@/lib/teaching/student-view";

/**
 * GET /api/student/notes/:id  (§33)
 *
 * An archived note is answered with 410, not 404. The student *did* receive it
 * and may well be holding a bookmark — telling them it never existed reads as a
 * bug, while "these notes were taken down" is the truth and is actionable
 * (§78, §89).
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/student/notes/[id]">) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;

    const { note, archived } = await getStudentNote(session.sub, id);

    if (archived) {
      return fail("These notes have been taken down by the teacher.", 410, {
        code: "note-archived",
      });
    }
    if (!note) return fail("Those notes could not be found.", 404);

    after(() => recordNoteView(session.sub, id));

    return ok({ note });
  } catch (err) {
    return handleError(err);
  }
}

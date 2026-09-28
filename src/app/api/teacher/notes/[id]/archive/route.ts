import { fail, handleError, ok } from "@/lib/api";
import { transitionNote } from "@/lib/teaching/notes";
import { requireTeacher } from "@/lib/teaching/teacher";
import type { NoteStatus } from "@/lib/teaching/fields";

/**
 * POST /api/teacher/notes/:id/archive  (§46, §58)
 *
 * Archiving takes a note out of every student's list without deleting it. The
 * `NoteRecipient` rows stay — the students *were* sent it — so a bookmark still
 * resolves and the student is told it was taken down rather than getting a
 * "not found" that reads as a bug (§78).
 *
 * The body may ask for `published` instead, which is how a note comes back.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/teacher/notes/[id]/archive">) {
  try {
    const teacher = await requireTeacher("ARCHIVE_NOTE");
    const { id } = await ctx.params;

    const body = (await req.json().catch(() => null)) as { status?: unknown } | null;
    const requested = typeof body?.status === "string" ? body.status : "archived";

    if (!["archived", "published"].includes(requested)) {
      return fail("That is not a status notes can be moved to.", 422);
    }

    const result = await transitionNote(teacher, id, requested as NoteStatus);
    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}

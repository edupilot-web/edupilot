import { handleError, ok, requireAuth } from "@/lib/api";
import { toggleNoteBookmark } from "@/lib/teaching/student-view";

/**
 * POST /api/student/notes/:id/bookmark  (§72)
 *
 * A toggle rather than separate add and remove endpoints: the button is a
 * toggle, and two endpoints would need the client to know the current state to
 * pick one — which it can get wrong after a stale render.
 *
 * Only a note the student actually received may be saved; a crafted id changes
 * nothing and returns `bookmarked: false`.
 */
export async function POST(_req: Request, ctx: RouteContext<"/api/student/notes/[id]/bookmark">) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;

    const result = await toggleNoteBookmark(session.sub, id);
    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}

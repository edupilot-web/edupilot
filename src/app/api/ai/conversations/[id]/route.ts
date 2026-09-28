import { fail, handleError, ok, requireAuth } from "@/lib/api";
import { archiveConversation, getConversation } from "@/lib/tutor/history";

/**
 * GET    /api/ai/conversations/:id  — the thread and its messages (§29)
 * DELETE /api/ai/conversations/:id  — archive it
 *
 * Reading a thread never calls a model: every answer in it was validated and
 * stored when it was produced (§15).
 *
 * DELETE archives rather than deletes. The interactions are what the usage and
 * cost records refer to, and a student tidying their own list is not asking for
 * the platform's accounting to be rewritten.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/ai/conversations/[id]">) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;

    const conversation = await getConversation(session.sub, id);
    if (!conversation) return fail("That conversation could not be found", 404);

    return ok({ conversation });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/ai/conversations/[id]">) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;

    const archived = await archiveConversation(session.sub, id);
    if (!archived) return fail("That conversation could not be found", 404);

    return ok({ archived: true });
  } catch (err) {
    return handleError(err);
  }
}

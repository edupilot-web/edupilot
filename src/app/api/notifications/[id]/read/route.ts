import { fail, handleError, ok, requireAuth } from "@/lib/api";
import { markRead } from "@/lib/notifications/service";

/**
 * PATCH /api/notifications/:id/read  (§39)
 *
 * Idempotent: a notification already read is a success, not a 404, so two taps
 * on one card do not produce an error on the second.
 */
export async function PATCH(_req: Request, ctx: RouteContext<"/api/notifications/[id]/read">) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;

    const marked = await markRead(session.sub, id);
    if (!marked) return fail("That notification could not be found.", 404);

    return ok({ read: true });
  } catch (err) {
    return handleError(err);
  }
}

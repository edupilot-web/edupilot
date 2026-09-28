import { fail, handleError, ok, requireAuth } from "@/lib/api";
import { getInteraction, rateInteraction } from "@/lib/tutor/history";

/**
 * GET   /api/ai/question/:id  — read a stored answer (§15 "View")
 * PATCH /api/ai/question/:id  — mark it helpful or not
 *
 * **GET never calls a model.** That is the whole point of §15: an answer was
 * validated and stored when it was produced, so reading it again is a
 * `findOne`. Only `/retry` goes back to a provider.
 *
 * Both are filtered on the session's user id inside the query, so an id
 * belonging to another student is simply not found — §71, enforced by the
 * lookup rather than by a check after it.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/ai/question/[id]">) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;

    const interaction = await getInteraction(session.sub, id);
    if (!interaction) return fail("That answer could not be found", 404);

    return ok({ interaction });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/ai/question/[id]">) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;

    let helpful: unknown;
    try {
      const body = await req.json();
      helpful = (body as { helpful?: unknown })?.helpful;
    } catch {
      return fail("Send a JSON body", 400);
    }

    if (typeof helpful !== "boolean") return fail("`helpful` must be true or false", 400);

    const updated = await rateInteraction(session.sub, id, helpful);
    if (!updated) return fail("That answer could not be found", 404);

    return ok({ helpful });
  } catch (err) {
    return handleError(err);
  }
}

import { handleError, ok, requireAuth } from "@/lib/api";
import { historyForTopic } from "@/lib/tutor/history";

/**
 * GET /api/ai/history/topic/:topicId  (§14, §29)
 *
 * "Previously asked" for one topic, across every thread — because a student
 * returning to a topic remembers the question, not which conversation it was
 * in.
 *
 * No model call, and no ownership check on the *topic*: the query is filtered
 * on the session's user, so at worst an unauthorised topic id returns an empty
 * list. Checking the topic as well would cost a query to make an empty answer
 * differently empty.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/ai/history/topic/[topicId]">) {
  try {
    const session = await requireAuth();
    const { topicId } = await ctx.params;
    const limit = Number(new URL(req.url).searchParams.get("limit")) || 20;

    const interactions = await historyForTopic(session.sub, topicId, limit);

    return ok({ interactions });
  } catch (err) {
    return handleError(err);
  }
}

import { fail, handleError, ok, requireAuth } from "@/lib/api";
import type { LearningLanguage } from "@/lib/learning/fields";
import { getTopicView } from "@/lib/learning/topics";

/**
 * GET /api/curriculum/topics/:topicId  (§29)
 *
 * One topic, its prepared content, this student's progress and their previous
 * questions — in one response, with no model call anywhere in it (§9).
 *
 * The page renders from the same function server-side; this endpoint exists for
 * the client-side refreshes (progress moved, a question was answered) and for
 * any future native client. A topic outside the student's curriculum returns
 * 404, identical to one that does not exist.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/curriculum/topics/[topicId]">) {
  try {
    const session = await requireAuth();
    const { topicId } = await ctx.params;

    const language = (new URL(req.url).searchParams.get("language") ?? "english") as LearningLanguage;

    const topic = await getTopicView(session.sub, topicId, language);
    if (!topic) return fail("That topic could not be found", 404);

    return ok({ topic });
  } catch (err) {
    return handleError(err);
  }
}

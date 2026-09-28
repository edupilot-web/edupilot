import { fail, handleError, ok, requireAuth } from "@/lib/api";
import { getSubjectTopics } from "@/lib/learning/topics";

/**
 * GET /api/curriculum/subjects/:subjectId/topics  (§29)
 *
 * The topic list for one subject, with this student's progress against each.
 * Authorised by the subject query carrying their coordinate, so a subject from
 * another college is not found rather than found-and-refused.
 */
export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/curriculum/subjects/[subjectId]/topics">
) {
  try {
    const session = await requireAuth();
    const { subjectId } = await ctx.params;

    const topics = await getSubjectTopics(session.sub, subjectId);
    if (!topics) return fail("That subject could not be found", 404);

    return ok(topics);
  } catch (err) {
    return handleError(err);
  }
}

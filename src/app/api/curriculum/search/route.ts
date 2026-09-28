import { handleError, ok, requireAuth } from "@/lib/api";
import { searchCurriculum } from "@/lib/learning/topics";

/**
 * GET /api/curriculum/search?q=  (§42)
 *
 * Searches subjects, topics and subtopics **inside the student's own
 * curriculum**. The scope is not a filter the caller can widen: the subject
 * list the search runs over is resolved from their profile, so a query cannot
 * reach a regulation they are not on.
 */
export async function GET(req: Request) {
  try {
    const session = await requireAuth();
    const query = new URL(req.url).searchParams.get("q") ?? "";

    const results = await searchCurriculum(session.sub, query);

    return ok({ query: query.trim(), results });
  } catch (err) {
    return handleError(err);
  }
}

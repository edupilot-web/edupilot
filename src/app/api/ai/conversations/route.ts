import { handleError, ok, requireAuth } from "@/lib/api";
import { listConversations } from "@/lib/tutor/history";

/**
 * GET /api/ai/conversations  (§29)
 *
 * Every thread this student has, newest activity first. `?topicId=` narrows it
 * to one topic, which is what the topic page's conversation switcher reads.
 *
 * Scoped to the session's user inside the query. There is no parameter that
 * widens it — §71 has no "and also show me someone else's" mode, so there is no
 * flag here that could be set to one.
 */
export async function GET(req: Request) {
  try {
    const session = await requireAuth();
    const url = new URL(req.url);

    const conversations = await listConversations(session.sub, {
      topicId: url.searchParams.get("topicId"),
      limit: Number(url.searchParams.get("limit")) || 30,
    });

    return ok({ conversations });
  } catch (err) {
    return handleError(err);
  }
}

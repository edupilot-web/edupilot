import { fail, handleError, ok, requireAuth } from "@/lib/api";
import { getForStudent } from "@/lib/service-requests/service";

/**
 * GET /api/service-requests/:id — one request and its timeline.
 *
 * A foreign id, a missing id and a malformed id all return **404** — identical,
 * so a probed URL cannot be used to learn what anyone else has asked for.
 *
 * Internal notes are excluded in the query rather than filtered afterwards. A
 * `.filter()` that gets refactored away is a leak; a query condition that gets
 * refactored away is an empty list.
 */
export async function GET(_req: Request, context: RouteContext<"/api/service-requests/[id]">) {
  try {
    const session = await requireAuth();
    const { id } = await context.params;

    const detail = await getForStudent(session.sub, id);
    if (!detail) return fail("That request does not exist", 404);

    return ok(detail);
  } catch (err) {
    return handleError(err);
  }
}

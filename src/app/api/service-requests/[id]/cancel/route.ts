import { fail, handleError, ok, requireAuth } from "@/lib/api";
import { cancelRequest } from "@/lib/service-requests/service";

/**
 * POST /api/service-requests/:id/cancel — the student withdrawing it.
 *
 * The only status change a student may make. Cancelling is atomic with the
 * check that it is still open, so a cancel racing the desk's resolution cannot
 * overwrite the resolution.
 */
export async function POST(_req: Request, context: RouteContext<"/api/service-requests/[id]/cancel">) {
  try {
    const session = await requireAuth();
    const { id } = await context.params;

    const result = await cancelRequest(session.sub, id);
    if (!result.ok) {
      return fail(result.message, result.code === "not-found" ? 404 : 409, { code: result.code });
    }

    return ok({ cancelled: true });
  } catch (err) {
    return handleError(err);
  }
}

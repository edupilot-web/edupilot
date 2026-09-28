import { handleError, ok, requireAuth } from "@/lib/api";
import { markAllRead } from "@/lib/notifications/service";

/**
 * POST /api/notifications/read-all  (§39)
 *
 * One update over the unread filter rather than a read followed by a loop, so
 * clearing a hundred notifications is one round trip.
 */
export async function POST() {
  try {
    const session = await requireAuth();
    const marked = await markAllRead(session.sub);

    return ok({ marked });
  } catch (err) {
    return handleError(err);
  }
}

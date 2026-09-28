import { handleError, ok, requireAuth } from "@/lib/api";
import { unreadCount } from "@/lib/notifications/service";

/**
 * GET /api/notifications/unread-count  (§39)
 *
 * Its own endpoint because the bell polls it and the list does not need to be
 * fetched to render a badge. Capped at 100 server-side — the badge shows "99+"
 * past that, and counting a hundred thousand rows to render two characters is
 * work nobody sees.
 */
export async function GET() {
  try {
    const session = await requireAuth();
    const count = await unreadCount(session.sub);

    return ok({ count, capped: count >= 100 });
  } catch (err) {
    return handleError(err);
  }
}

import { handleError, ok, requireAuth } from "@/lib/api";
import { listNotifications } from "@/lib/notifications/service";

/**
 * GET /api/notifications  (§38, §39, §91)
 *
 * Cursor pagination on `createdAt`, not `skip`. A notification list grows at
 * the top, so an offset shifts under the reader every time something arrives
 * and page two silently repeats a row from page one.
 *
 * Scoped to the session's user inside the query. There is no parameter that
 * widens it, because §71's privacy rule has no "and also show me someone
 * else's" mode to express.
 */
export async function GET(req: Request) {
  try {
    const session = await requireAuth();
    const params = new URL(req.url).searchParams;

    const result = await listNotifications(session.sub, {
      cursor: params.get("cursor"),
      limit: Number(params.get("limit")) || 20,
      unreadOnly: params.get("unread") === "true",
    });

    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}

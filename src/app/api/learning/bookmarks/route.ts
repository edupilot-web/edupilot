import { Types } from "mongoose";
import { fail, handleError, ok, requireAuth } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { BOOKMARK_TYPES, type BookmarkType } from "@/lib/learning/fields";
import { Bookmark } from "@/models/Learning";

/**
 * GET    /api/learning/bookmarks  — everything this student saved (§41)
 * POST   /api/learning/bookmarks  — save one
 * DELETE /api/learning/bookmarks  — remove one
 *
 * The label and the href are captured at save time rather than resolved on
 * read. Two reasons, and the second is the one that matters: a bookmark list
 * that joins three collections per row is three queries per row, and a topic
 * that is later renamed or archived would otherwise render as a blank line in
 * a list the student built themselves (§58).
 *
 * Saving the same thing twice is a no-op enforced by a unique index, not by a
 * read-then-write — two taps on a star must not create two rows, and a check
 * before the insert loses that race.
 */

export async function GET(req: Request) {
  try {
    const session = await requireAuth();
    const type = new URL(req.url).searchParams.get("type");

    await connectDB();

    const filter: Record<string, unknown> = { userId: session.sub };
    if (type && (BOOKMARK_TYPES as readonly string[]).includes(type)) filter.type = type;

    const rows = await Bookmark.find(filter).sort({ createdAt: -1 }).limit(200).lean();

    return ok({
      bookmarks: rows.map((row) => ({
        id: String(row._id),
        type: row.type,
        referenceId: String(row.referenceId),
        label: row.label ?? null,
        href: row.href ?? null,
        note: row.note ?? null,
        createdAt: row.createdAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireAuth();

    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== "object") return fail("Send a JSON body", 400);
      body = parsed as Record<string, unknown>;
    } catch {
      return fail("Send a JSON body", 400);
    }

    const type = typeof body.type === "string" ? body.type : "";
    if (!(BOOKMARK_TYPES as readonly string[]).includes(type)) {
      return fail("Unknown bookmark type", 400);
    }

    const referenceId = typeof body.referenceId === "string" ? body.referenceId : "";
    if (!Types.ObjectId.isValid(referenceId)) return fail("A valid referenceId is required", 400);

    await connectDB();

    /**
     * An upsert, so the endpoint is idempotent.
     *
     * A double tap, a retried request and a stale offline queue all converge on
     * one row instead of a duplicate-key error the client would have to
     * interpret.
     */
    await Bookmark.updateOne(
      { userId: session.sub, type: type as BookmarkType, referenceId },
      {
        $setOnInsert: {
          userId: session.sub,
          type: type as BookmarkType,
          referenceId,
          label: typeof body.label === "string" ? body.label.slice(0, 300) : null,
          href: typeof body.href === "string" ? body.href.slice(0, 400) : null,
          note: typeof body.note === "string" ? body.note.slice(0, 1000) : null,
        },
      },
      { upsert: true }
    );

    return ok({ saved: true });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireAuth();
    const params = new URL(req.url).searchParams;

    const type = params.get("type");
    const referenceId = params.get("referenceId");

    if (!type || !referenceId) return fail("`type` and `referenceId` are required", 400);

    await connectDB();
    await Bookmark.deleteOne({ userId: session.sub, type: type as BookmarkType, referenceId });

    // Idempotent: removing a bookmark that is already gone is a success, not a
    // 404 the client has to special-case on an unstable connection.
    return ok({ removed: true });
  } catch (err) {
    return handleError(err);
  }
}

import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { recordAudit } from "@/lib/admin/audit";
import { fail, ok, readJson, readString, withPermission } from "@/lib/admin/ai/api";
import { AiCourseContent } from "@/models/AiCourseContent";

/**
 * POST /api/admin/ai/course-content/:id/unpublish  (spec §31)
 *
 * Withdraws published content. Nothing is deleted: the record and every version
 * stay, and the status returns to `approved` — the state it was in before
 * publication — or to `archived` if the caller asks for that.
 *
 * A reason is mandatory. Content that was live to students and is no longer must
 * carry an explanation, or the audit log records that it happened without
 * recording why, which is the part anyone reviewing the incident needs.
 */
const MIN_REASON = 10;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withPermission("ai_course_content.publish", async (admin) => {
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) return fail("That is not a content id.", 400, { code: "invalid-id" });

    const body = await readJson(req);
    const reason = readString(body, "reason");

    if (reason.length < MIN_REASON) {
      return fail(
        `Give a reason for unpublishing — at least ${MIN_REASON} characters. It is recorded in the audit log.`,
        400,
        { code: "reason-required", field: "reason" }
      );
    }

    // §31 allows either destination depending on the workflow.
    const to = readString(body, "to") === "archived" ? "archived" : "approved";

    await connectDB();

    const row = await AiCourseContent.findById(id).lean();
    if (!row) return fail("That content no longer exists.", 404, { code: "content-not-found" });

    if (row.status !== "published") {
      return fail("That content is not published.", 409, { code: "not-published" });
    }

    const now = new Date();

    await AiCourseContent.updateOne(
      { _id: row._id },
      {
        $set: {
          status: to,
          unpublishedAt: now,
          unpublishedBy: new Types.ObjectId(admin.id),
          unpublishReason: reason,
          updatedBy: new Types.ObjectId(admin.id),
        },
      }
    );

    /**
     * The published version keeps `published: true`.
     *
     * It was live, and that is a historical fact — clearing the flag would make
     * the version editable again and erase the record that students had seen it.
     * `publishedVersionId` is kept for the same reason.
     */

    await recordAudit({
      actor: admin,
      action: "ai.content.unpublished",
      entityType: "AiCourseContent",
      entityId: String(row._id),
      entityLabel: row.title,
      before: { status: "published" },
      after: { status: to },
      metadata: {
        reason,
        college: row.collegeName,
        regulation: row.regulationCode,
        subject: row.subjectName,
        contentType: row.contentType,
        publishedAt: row.publishedAt,
      },
    });

    return ok({ id: String(row._id), status: to, unpublishedAt: now, reason });
  });
}

import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { recordAudit } from "@/lib/admin/audit";
import { fail, ok, withPermission } from "@/lib/admin/ai/api";
import { AiCourseContent, AiCourseContentVersion } from "@/models/AiCourseContent";
import { editBlockedReason, saveVersion } from "@/lib/admin/ai/repository";
import type { AiContentStatus } from "@/lib/admin/ai/fields";

/**
 * POST /api/admin/ai/course-content/:id/versions/:versionId/restore  (spec §17)
 *
 * Restoring writes a **new** version holding the old payload. It does not move
 * the current-version pointer backwards.
 *
 * That is the whole design of the history: versions are a record of what
 * happened, and rewinding a pointer would erase the fact that the newer version
 * ever existed. After restoring version 2 onto a record at version 5, the
 * history reads 1, 2, 3, 4, 5, 6 — where 6 is "restored from 2" — and nothing
 * has been lost.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  return withPermission("ai_course_content.edit", async (admin) => {
    const { id, versionId } = await params;
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(versionId)) {
      return fail("That is not a valid id.", 400, { code: "invalid-id" });
    }

    await connectDB();

    const record = await AiCourseContent.findById(id).lean();
    if (!record) return fail("That content no longer exists.", 404, { code: "content-not-found" });

    const blocked = editBlockedReason(record.status as AiContentStatus);
    if (blocked) return fail(blocked, 409, { code: "edit-blocked" });

    // Scoped to this record: a version id from another subject's history must
    // not be restorable here.
    const version = await AiCourseContentVersion.findOne({
      _id: versionId,
      courseContentId: record._id,
    }).lean();

    if (!version) {
      return fail("That version does not belong to this content.", 404, { code: "version-not-found" });
    }

    if (String(version._id) === String(record.currentVersionId)) {
      return fail("That version is already the current one.", 409, { code: "already-current" });
    }

    if (!version.content) {
      return fail("That version has no content to restore.", 409, { code: "empty-version" });
    }

    const created = await saveVersion({
      courseContentId: String(record._id),
      content: version.content,
      origin: "restored",
      note: `Restored from version ${version.versionNumber}`,
      generationConfig: version.generationConfig,
      promptVersion: version.promptVersion,
      provider: version.provider,
      model: version.model,
      sourceMaterialIds: (version.sourceMaterialIds ?? []).map((sourceId) => String(sourceId)),
      restoredFromVersion: version.versionNumber,
      adminId: admin.id,
    });

    /**
     * A restore sends the record back for review.
     *
     * Content that was approved at version 5 has not been approved at version 6,
     * even though 6 holds an older payload — the approval was of a specific
     * document, and carrying it across would let a restore put unreviewed
     * content one click from publication.
     */
    if (record.status === "approved") {
      await AiCourseContent.updateOne(
        { _id: record._id },
        {
          $set: {
            status: "under-review",
            approvedBy: null,
            approvedAt: null,
            academicallyApproved: false,
          },
        }
      );
    }

    await recordAudit({
      actor: admin,
      action: "ai.content.version-restored",
      entityType: "AiCourseContent",
      entityId: String(record._id),
      entityLabel: record.title,
      before: { currentVersion: record.versionCount },
      after: { currentVersion: created.versionNumber, restoredFrom: version.versionNumber },
      metadata: {
        subject: record.subjectName,
        contentType: record.contentType,
        statusReset: record.status === "approved",
      },
    });

    return ok({
      id: String(record._id),
      newVersionNumber: created.versionNumber,
      restoredFromVersion: version.versionNumber,
      statusReset: record.status === "approved" ? "under-review" : null,
    });
  });
}

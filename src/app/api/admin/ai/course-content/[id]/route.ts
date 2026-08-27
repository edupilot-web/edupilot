import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { recordAudit } from "@/lib/admin/audit";
import { fail, ok, readJson, readString, withPermission } from "@/lib/admin/ai/api";
import { AiCourseContent } from "@/models/AiCourseContent";
import { editBlockedReason, saveVersion } from "@/lib/admin/ai/repository";
import { parseContent } from "@/lib/admin/ai/schema";
import {
  AI_CONTENT_STATUS_LABELS,
  canTransition,
  contentTypeLabel,
  type AiContentStatus,
} from "@/lib/admin/ai/fields";

/**
 * GET / PATCH /api/admin/ai/course-content/:id  (spec §35)
 *
 * GET returns the record with its content. PATCH is the editor's save and the
 * status workflow in one endpoint, because both are "change this record" and
 * both must go through the same version write (§17).
 */

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withPermission("ai_course_content.view", async () => {
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) return fail("That is not a content id.", 400, { code: "invalid-id" });

    await connectDB();

    const row = await AiCourseContent.findById(id).lean();
    if (!row) return fail("That content no longer exists.", 404, { code: "content-not-found" });

    return ok({
      content: {
        id: String(row._id),
        title: row.title,
        description: row.description,
        contentType: row.contentType,
        contentTypeLabel: contentTypeLabel(row.contentType),
        status: row.status,
        statusLabel: AI_CONTENT_STATUS_LABELS[row.status as AiContentStatus] ?? row.status,

        context: {
          college: row.collegeName,
          program: row.programName,
          branch: row.branchName,
          regulation: row.regulationCode,
          academicYear: row.academicYearLabel,
          subject: row.subjectName,
          subjectCode: row.subjectCode,
          year: row.year,
          semester: row.semester,
          ids: {
            collegeId: String(row.collegeId),
            programId: String(row.programId),
            branchId: String(row.branchId),
            regulationId: String(row.regulationId),
            academicYearId: String(row.academicYearId),
            subjectId: String(row.subjectId),
          },
        },

        body: row.content ?? null,

        provider: row.provider,
        model: row.model,
        versionCount: row.versionCount,
        currentVersionId: row.currentVersionId ? String(row.currentVersionId) : null,
        publishedVersionId: row.publishedVersionId ? String(row.publishedVersionId) : null,

        activeJobId: row.activeJobId ? String(row.activeJobId) : null,
        lastGenerationError: row.lastGenerationError,

        /**
         * Never true unless a human set it (§42).
         *
         * Sent to the client so the preview can refuse to label content as
         * approved material on its own.
         */
        academicallyApproved: row.academicallyApproved === true,

        reviewedAt: row.reviewedAt,
        approvedAt: row.approvedAt,
        publishedAt: row.publishedAt,
        unpublishedAt: row.unpublishedAt,
        unpublishReason: row.unpublishReason,

        editBlockedReason: editBlockedReason(row.status as AiContentStatus),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
    });
  });
}

/**
 * PATCH — an editor save, a status move, or both.
 *
 * Two permissions rather than one: changing the *body* is `edit`, moving the
 * status through review is `review`, and publishing is refused here outright
 * because §33 makes it a separate right with its own endpoint and confirmation
 * (§30). A PATCH that could set `status: "published"` would route around that.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withPermission("ai_course_content.view", async (admin) => {
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) return fail("That is not a content id.", 400, { code: "invalid-id" });

    const body = await readJson(req);
    if (!body) return fail("Send a JSON body.", 400, { code: "invalid-body" });

    await connectDB();

    const row = await AiCourseContent.findById(id).lean();
    if (!row) return fail("That content no longer exists.", 404, { code: "content-not-found" });

    const currentStatus = row.status as AiContentStatus;
    const blocked = editBlockedReason(currentStatus);

    const wantsBodyChange = "body" in body;
    const nextStatus = readString(body, "status") as AiContentStatus | "";
    const wantsTitle = "title" in body;

    // ── Body edit ────────────────────────────────────────────────────────
    if (wantsBodyChange) {
      if (!admin.permissions.includes("*") && !admin.permissions.includes("ai_course_content.edit")) {
        return fail('You do not have the "ai_course_content.edit" permission.', 403, { code: "forbidden" });
      }
      if (blocked) return fail(blocked, 409, { code: "edit-blocked" });

      // An administrator's edit is validated against the same schema a model's
      // output is (§25). Hand-editing is not a way around the contract.
      const parsed = parseContent(row.contentType, body.body);
      if (!parsed.ok) {
        return fail(
          `The edited content does not match the ${contentTypeLabel(row.contentType)} schema.`,
          422,
          { code: "schema-invalid", details: { issues: parsed.issues } }
        );
      }

      const version = await saveVersion({
        courseContentId: String(row._id),
        content: parsed.content,
        origin: "admin-edited",
        note: readString(body, "note") || "Edited by an administrator",
        provider: row.provider,
        model: row.model,
        adminId: admin.id,
      });

      await recordAudit({
        actor: admin,
        action: "ai.content.edited",
        entityType: "AiCourseContent",
        entityId: String(row._id),
        entityLabel: row.title,
        metadata: { versionNumber: version.versionNumber, contentType: row.contentType },
      });
    }

    // ── Status move ──────────────────────────────────────────────────────
    if (nextStatus) {
      if (nextStatus === "published") {
        return fail(
          "Publishing is a separate action. Use the publish endpoint, which requires the publish permission and a confirmation.",
          400,
          { code: "use-publish-endpoint" }
        );
      }

      if (!admin.permissions.includes("*") && !admin.permissions.includes("ai_course_content.review")) {
        return fail('You do not have the "ai_course_content.review" permission.', 403, { code: "forbidden" });
      }

      if (!canTransition(currentStatus, nextStatus)) {
        return fail(
          `Content cannot move from ${AI_CONTENT_STATUS_LABELS[currentStatus]} to ${AI_CONTENT_STATUS_LABELS[nextStatus] ?? nextStatus}.`,
          409,
          { code: "invalid-transition" }
        );
      }

      const patch: Record<string, unknown> = { status: nextStatus, updatedBy: new Types.ObjectId(admin.id) };
      if (nextStatus === "under-review") {
        patch.reviewedBy = new Types.ObjectId(admin.id);
        patch.reviewedAt = new Date();
      }
      if (nextStatus === "approved") {
        patch.approvedBy = new Types.ObjectId(admin.id);
        patch.approvedAt = new Date();
        /**
         * Approval is the *only* place this becomes true, and only because an
         * administrator asked for it (§42). Nothing in the generation pipeline
         * can set it.
         */
        patch.academicallyApproved = body.academicallyApproved === true;
      }

      await AiCourseContent.updateOne({ _id: row._id }, { $set: patch });

      await recordAudit({
        actor: admin,
        action: `ai.content.${nextStatus === "approved" ? "approved" : nextStatus === "archived" ? "archived" : "status-changed"}`,
        entityType: "AiCourseContent",
        entityId: String(row._id),
        entityLabel: row.title,
        before: { status: currentStatus },
        after: { status: nextStatus },
      });
    }

    if (wantsTitle) {
      if (blocked) return fail(blocked, 409, { code: "edit-blocked" });
      const title = readString(body, "title");
      if (title) await AiCourseContent.updateOne({ _id: row._id }, { $set: { title } });
    }

    if (!wantsBodyChange && !nextStatus && !wantsTitle) {
      return fail("Nothing to change.", 400, { code: "empty-patch" });
    }

    const updated = await AiCourseContent.findById(row._id).select("status versionCount title").lean();
    return ok({
      id: String(row._id),
      status: updated?.status,
      versionCount: updated?.versionCount,
      title: updated?.title,
    });
  });
}

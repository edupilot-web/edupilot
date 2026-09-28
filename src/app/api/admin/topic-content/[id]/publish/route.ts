import { Types } from "mongoose";
import { fail, ok, readJson, withPermission } from "@/lib/admin/ai/api";
import { recordAudit } from "@/lib/admin/audit";
import { connectDB } from "@/lib/db";
import { Topic, TopicContent } from "@/models/Topic";

/**
 * POST   /api/admin/topic-content/:id/publish  — make it visible to students
 * DELETE /api/admin/topic-content/:id/publish  — take it back down
 *
 * The **only** path to content a student can read. Separate from PATCH and
 * behind its own permission, because publishing is the moment a piece of
 * generated text stops being a draft somebody is reviewing and becomes what a
 * student revises from (§45).
 *
 * Three gates, and each one exists because of a specific way this goes wrong:
 *
 *   - **approved only.** A draft cannot be published, however good it looks.
 *   - **never `provider: "mock"`.** The mock writes clearly-labelled
 *     placeholder text; it is labelled for a reviewer, and a student who
 *     reached it would have no such context.
 *   - **a confirmation that a human read it.** `academicallyReviewed` must be
 *     sent explicitly. A publish button that needs no assertion is a publish
 *     button people press without reading.
 */

export async function POST(req: Request, ctx: RouteContext<"/api/admin/topic-content/[id]/publish">) {
  return withPermission("topic_content.publish", async (admin) => {
    const { id } = await ctx.params;
    if (!Types.ObjectId.isValid(id)) {
      return fail("That content could not be found.", 404, { code: "not-found" });
    }

    const body = await readJson(req);

    await connectDB();

    const content = await TopicContent.findById(id)
      .select("status provider topicId subjectId approvedAt")
      .lean();

    if (!content) return fail("That content could not be found.", 404, { code: "not-found" });

    if (content.status !== "approved") {
      return fail(
        `Only approved content can be published. This is ${content.status}.`,
        409,
        { code: "not-approved" }
      );
    }

    if (content.provider === "mock") {
      return fail(
        "This content came from the mock provider and is placeholder text. Configure a real provider and regenerate it.",
        409,
        { code: "mock-content" }
      );
    }

    if (body?.academicallyReviewed !== true) {
      return fail(
        "Confirm that you have read this content and that it is academically correct.",
        400,
        { code: "confirmation-required", field: "academicallyReviewed" }
      );
    }

    const now = new Date();

    await TopicContent.updateOne(
      { _id: id },
      { $set: { status: "published", publishedAt: now, publishedBy: admin.id } }
    );

    /**
     * The topic's flag is set here and only here.
     *
     * It is what puts "Explanation ready" on the student's subject page, and
     * setting it anywhere earlier would advertise text nobody had approved.
     */
    await Topic.updateOne({ _id: content.topicId }, { $set: { hasPublishedContent: true } });

    await recordAudit({
      actor: admin,
      action: "topic_content.published",
      entityType: "TopicContent",
      entityId: id,
      before: { status: content.status },
      after: { status: "published" },
      metadata: { topicId: String(content.topicId), subjectId: String(content.subjectId) },
    });

    return ok({ id, status: "published", publishedAt: now.toISOString() });
  });
}

export async function DELETE(
  req: Request,
  ctx: RouteContext<"/api/admin/topic-content/[id]/publish">
) {
  return withPermission("topic_content.publish", async (admin) => {
    const { id } = await ctx.params;
    if (!Types.ObjectId.isValid(id)) {
      return fail("That content could not be found.", 404, { code: "not-found" });
    }

    const body = await readJson(req);
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

    /**
     * A reason is required.
     *
     * Something a student was reading has been taken away from them; an
     * unpublish with no stated reason is unauditable, and the next person
     * looking at the row cannot tell a mistake from a correction.
     */
    if (reason.length < 5) {
      return fail("Give a reason for taking this down.", 400, {
        code: "reason-required",
        field: "reason",
      });
    }

    await connectDB();

    const content = await TopicContent.findById(id).select("status topicId").lean();
    if (!content) return fail("That content could not be found.", 404, { code: "not-found" });

    if (content.status !== "published") {
      return fail("That content is not published.", 409, { code: "not-published" });
    }

    /**
     * Back to approved, not to draft.
     *
     * It was approved once and nothing has changed the text — sending it to
     * draft would discard a review that is still valid and make somebody redo
     * it to fix whatever prompted the unpublish.
     */
    await TopicContent.updateOne({ _id: id }, { $set: { status: "approved" } });
    await Topic.updateOne({ _id: content.topicId }, { $set: { hasPublishedContent: false } });

    await recordAudit({
      actor: admin,
      action: "topic_content.unpublished",
      entityType: "TopicContent",
      entityId: id,
      before: { status: "published" },
      after: { status: "approved" },
      metadata: { topicId: String(content.topicId), reason },
    });

    return ok({ id, status: "approved" });
  });
}

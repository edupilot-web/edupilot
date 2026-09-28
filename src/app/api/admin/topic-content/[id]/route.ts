import { Types } from "mongoose";
import { fail, ok, readJson, readString, withPermission } from "@/lib/admin/ai/api";
import { recordAudit } from "@/lib/admin/audit";
import { connectDB } from "@/lib/db";
import {
  canTransitionContent,
  TOPIC_CONTENT_STATUS_LABELS,
  type TopicContentStatus,
} from "@/lib/learning/fields";
import { getTopicContentDetail } from "@/lib/admin/data/topic-content";
import { TopicContent } from "@/models/Topic";

/**
 * GET   /api/admin/topic-content/:id  — the document, with the syllabus beside it
 * PATCH /api/admin/topic-content/:id  — edit the prose, or move it through review
 *
 * PATCH **cannot publish**. `status: "published"` is refused outright, so there
 * is exactly one path to content a student can see and it needs its own
 * permission (§45). The same construction the course-content module uses, and
 * for the same reason: a general-purpose update endpoint that happens to accept
 * one particular value is a publish endpoint with no permission check.
 */

export async function GET(_req: Request, ctx: RouteContext<"/api/admin/topic-content/[id]">) {
  return withPermission("topic_content.view", async () => {
    const { id } = await ctx.params;

    const detail = await getTopicContentDetail(id);
    if (!detail) return fail("That content could not be found.", 404, { code: "not-found" });

    return ok(detail);
  });
}

/** Fields an editor may rewrite. Everything else on the document is derived. */
const EDITABLE_TEXT = [
  "basicExplanation",
  "whyItMatters",
  "realWorldAnalogy",
  "practicalExplanation",
  "advancedOverview",
] as const;

const EDITABLE_LISTS = ["keyPoints", "commonMistakes", "prerequisites", "realWorldExamples"] as const;

export async function PATCH(req: Request, ctx: RouteContext<"/api/admin/topic-content/[id]">) {
  return withPermission("topic_content.view", async (admin) => {
    const { id } = await ctx.params;
    if (!Types.ObjectId.isValid(id)) {
      return fail("That content could not be found.", 404, { code: "not-found" });
    }

    const body = await readJson(req);
    if (!body) return fail("Send a JSON body.", 400, { code: "invalid-body" });

    await connectDB();

    const existing = await TopicContent.findById(id).select("status topicId subjectId").lean();
    if (!existing) return fail("That content could not be found.", 404, { code: "not-found" });

    const current = existing.status as TopicContentStatus;
    const requested = readString(body, "status") as TopicContentStatus | "";

    const update: Record<string, unknown> = {};
    const now = new Date();

    // ── Text edits ────────────────────────────────────────────────────────
    const wantsTextEdit =
      EDITABLE_TEXT.some((field) => typeof body[field] === "string") ||
      EDITABLE_LISTS.some((field) => Array.isArray(body[field]));

    if (wantsTextEdit) {
      if (!admin.permissions.includes("*") && !admin.permissions.includes("topic_content.edit")) {
        return fail('You do not have the "topic_content.edit" permission.', 403, {
          code: "forbidden",
        });
      }

      /**
       * Published content is immutable in place.
       *
       * Editing what students are currently reading, with no record of what it
       * said before, is the one change nobody can review after the fact. Send
       * it back to review, edit it there, and publish again.
       */
      if (current === "published") {
        return fail(
          "Published content cannot be edited in place. Move it back to review first.",
          409,
          { code: "published-immutable" }
        );
      }

      for (const field of EDITABLE_TEXT) {
        const value = body[field];
        if (typeof value === "string") update[field] = value.trim() || null;
      }
      for (const field of EDITABLE_LISTS) {
        const value = body[field];
        if (Array.isArray(value)) {
          update[field] = value
            .filter((entry): entry is string => typeof entry === "string")
            .map((entry) => entry.trim())
            .filter(Boolean)
            .slice(0, 10);
        }
      }

      /**
       * A human edit changes the provenance.
       *
       * Once a person has rewritten the prose, calling it AI-generated on the
       * student's page is no longer true — and §36 asks that notice to be
       * accurate rather than merely cautious.
       */
      update.origin = "authored";
      update.updatedBy = admin.id;
    }

    // ── Status transitions ────────────────────────────────────────────────
    if (requested) {
      if (requested === "published") {
        return fail(
          "Use the publish endpoint. Publishing needs its own permission.",
          403,
          { code: "publish-forbidden" }
        );
      }

      if (!canTransitionContent(current, requested)) {
        return fail(
          `Content that is ${TOPIC_CONTENT_STATUS_LABELS[current]} cannot move to ${
            TOPIC_CONTENT_STATUS_LABELS[requested] ?? requested
          }.`,
          409,
          { code: "invalid-transition" }
        );
      }

      const needsReview = requested === "approved" || requested === "editor-review";
      if (
        needsReview &&
        !admin.permissions.includes("*") &&
        !admin.permissions.includes("topic_content.review")
      ) {
        return fail('You do not have the "topic_content.review" permission.', 403, {
          code: "forbidden",
        });
      }

      update.status = requested;

      if (requested === "editor-review") {
        update.reviewedBy = admin.id;
        update.reviewedAt = now;
      }
      if (requested === "approved") {
        update.approvedBy = admin.id;
        update.approvedAt = now;
      }
      /**
       * Un-approving clears the approval.
       *
       * A document sent back to draft that kept `approvedAt` would show a
       * student the "reviewed" provenance notice on text nobody currently
       * stands behind.
       */
      if (requested === "ai-draft") {
        update.approvedBy = null;
        update.approvedAt = null;
      }
    }

    if (Object.keys(update).length === 0) {
      return fail("Nothing to change.", 400, { code: "no-op" });
    }

    await TopicContent.updateOne({ _id: id }, { $set: update });

    await recordAudit({
      actor: admin,
      action: requested ? `topic_content.${requested.replace("-", "_")}` : "topic_content.edited",
      entityType: "TopicContent",
      entityId: id,
      before: { status: current },
      after: { status: requested || current },
      metadata: { topicId: String(existing.topicId), edited: wantsTextEdit },
    });

    return ok({ id, status: requested || current, edited: wantsTextEdit });
  });
}

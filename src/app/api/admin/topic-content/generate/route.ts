import { fail, ok, readJson, readString, readStringArray, withGenerationLimit } from "@/lib/admin/ai/api";
import { generateTopicContent } from "@/lib/admin/ai/topic-content-generator";
import { recordAudit } from "@/lib/admin/audit";

/**
 * POST /api/admin/topic-content/generate  (§45)
 *
 * Drafts the prepared explanation for one topic, or for a small batch of them.
 *
 * Synchronous, unlike `/api/admin/ai/course-content/generate`, and the
 * difference is the size of the work: a topic is one section that finishes
 * inside a request, while a complete course is twenty and needs a job the
 * browser polls. Adding a job record and a polling loop for a fifteen-second
 * call would be more machinery than the work it manages.
 *
 * Everything it writes lands in `ai-draft`. There is no parameter, and no code
 * path through the generator, that produces any other status — publishing
 * needs `topic_content.publish` and its own endpoint.
 */

/**
 * A batch of ten at roughly fifteen seconds each. `maxDuration` covers the
 * worst case with room for the writes; the batch cap below is what keeps the
 * worst case bounded in the first place.
 */
export const maxDuration = 300;

/**
 * How many topics one request may generate.
 *
 * Ten, because that is a unit's worth — the granularity an operator actually
 * works in — and because an uncapped batch is an uncapped bill triggered by a
 * single click. Generating a whole subject means pressing the button four
 * times, which is a deliberate friction rather than an oversight.
 */
const MAX_BATCH = 10;

export async function POST(req: Request) {
  return withGenerationLimit("topic_content.generate", async (admin) => {
    const body = await readJson(req);
    if (!body) return fail("Send a JSON body.", 400, { code: "invalid-body" });

    const single = readString(body, "topicId");
    const many = readStringArray(body, "topicIds");
    const topicIds = single ? [single] : many;

    if (!topicIds.length) {
      return fail("Choose at least one topic.", 400, { code: "missing-topic", field: "topicId" });
    }
    if (topicIds.length > MAX_BATCH) {
      return fail(
        `Generate at most ${MAX_BATCH} topics at a time. Select fewer and run it again.`,
        400,
        { code: "batch-too-large", field: "topicIds" }
      );
    }

    const replaceDraft = body.replaceDraft === true;

    /**
     * Sequential, not `Promise.all`.
     *
     * Ten concurrent calls is the fastest way to hit a provider's rate limit,
     * and the failure would arrive as nine successes and one confusing error.
     * Sequentially, a rate limit stops the batch where it is and everything
     * before it is already saved.
     */
    const results: {
      topicId: string;
      ok: boolean;
      contentId?: string;
      code?: string;
      message?: string;
    }[] = [];

    let usingMock = false;

    for (const topicId of topicIds) {
      const outcome = await generateTopicContent({ topicId, admin, replaceDraft });

      if (outcome.ok) {
        usingMock = usingMock || outcome.usingMock;
        results.push({ topicId, ok: true, contentId: outcome.contentId });

        await recordAudit({
          actor: admin,
          action: "topic_content.generated",
          entityType: "TopicContent",
          entityId: outcome.contentId,
          metadata: {
            topicId,
            provider: outcome.provider,
            model: outcome.model,
            replacedDraft: outcome.replacedDraft,
          },
        });
      } else {
        results.push({ topicId, ok: false, code: outcome.code, message: outcome.message });
      }
    }

    const succeeded = results.filter((entry) => entry.ok).length;

    /**
     * A batch where nothing succeeded is a failure, even though each item was
     * handled. Returning 200 with ten errors inside would let a client render
     * "done" over a batch that did nothing.
     */
    if (succeeded === 0) {
      return fail(results[0]?.message ?? "Nothing could be generated.", 422, {
        code: results[0]?.code ?? "generation-failed",
        details: { results },
      });
    }

    return ok({
      generated: succeeded,
      attempted: results.length,
      results,
      /**
       * Surfaced so the screen can label the output. Mock content is
       * placeholder text and a reviewer who did not know that could approve it
       * (§36).
       */
      usingMock,
      status: "ai-draft",
    });
  });
}

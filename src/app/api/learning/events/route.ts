import { fail, handleError, ok, requireAuth } from "@/lib/api";
import { isLearningEventType, type LearningEventType } from "@/lib/learning/fields";
import { applyEvent, authorizeTopic } from "@/lib/learning/progress";

/**
 * POST /api/learning/events  (§25, §29)
 *
 * The analytics stream, and the only way the client moves progress.
 *
 * The event type must be one of `LEARNING_EVENT_TYPES`. A closed list because
 * the browser is what writes here: an open one would let a client define the
 * platform's own metric vocabulary, and "most studied topics" would be
 * aggregating whatever names happened to be posted.
 *
 * Recording the event and applying whatever progress it implies happen in one
 * call, so the two can never disagree about what an event means — the mapping
 * lives in `EVENT_PROGRESS_SIGNAL` and is read in exactly one place.
 *
 * `TOPIC_OPENED` is accepted and moves nothing. That is §24's rule made
 * concrete: a page visit is data, not learning.
 */

/** One event at a time; the client batches by calling again, not by nesting. */
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
    if (!isLearningEventType(type)) {
      return fail("Unknown event type", 400, { code: "unknown-event-type" });
    }

    const topicId = typeof body.topicId === "string" ? body.topicId.trim() : "";
    if (!topicId) return fail("A topicId is required", 400);

    const ownership = await authorizeTopic(session.sub, topicId);
    if (!ownership) return fail("That topic could not be found", 404);

    const progress = await applyEvent({
      userId: session.sub,
      type: type as LearningEventType,
      ownership,
      subtopicId: typeof body.subtopicId === "string" ? body.subtopicId : null,
      timeSpentSeconds:
        typeof body.timeSpentSeconds === "number" ? body.timeSpentSeconds : undefined,
      depthLevel: typeof body.depthLevel === "string" ? body.depthLevel : null,
      /**
       * Free-form extras, capped hard.
       *
       * Whatever the client sends is stored under `meta` for analytics, and it
       * is never read back into a decision — so the only risk is size, which
       * the cap answers. A schema per event type would be forty shapes to keep
       * in step with a client that changes more often than this file.
       */
      meta: isPlainObject(body.meta) ? clamp(body.meta) : null,
    });

    return ok({ progress });
  } catch (err) {
    return handleError(err);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** At most eight keys, scalar values only, strings truncated. */
function clamp(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(meta).slice(0, 8)) {
    if (typeof value === "string") out[key.slice(0, 40)] = value.slice(0, 200);
    else if (typeof value === "number" || typeof value === "boolean") out[key.slice(0, 40)] = value;
  }

  return out;
}

import { fail, handleError, ok, requireAuth } from "@/lib/api";
import { isProgressSignal, type ProgressSignal } from "@/lib/learning/fields";
import { authorizeTopic, progressForSubject, recordProgress } from "@/lib/learning/progress";

/**
 * GET /api/learning/progress?subjectId=…  — this student's progress in a subject
 * PUT /api/learning/progress             — record a signal against one topic
 *
 * The client says **which signal happened**, never a percentage (§24). The
 * server owns the arithmetic, the clamping and the completion threshold,
 * because a client that could post a number could post 100 — and "topics
 * completed" would then be a figure nobody could defend.
 *
 * Every write re-authorises the topic against the student's own curriculum
 * before storing anything. That is one extra query per call and it is not
 * negotiable: without it, a progress row can be filed against a topic the
 * student cannot see, and another college's engagement numbers can be
 * fabricated from a console.
 */

export async function GET(req: Request) {
  try {
    const session = await requireAuth();
    const subjectId = new URL(req.url).searchParams.get("subjectId");

    if (!subjectId) return fail("A subjectId is required", 400);

    const progress = await progressForSubject(session.sub, subjectId);

    return ok({
      subjectId,
      topics: Object.fromEntries(progress),
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: Request) {
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

    const topicId = typeof body.topicId === "string" ? body.topicId.trim() : "";
    if (!topicId) return fail("A topicId is required", 400);

    /**
     * A topic that is not this student's returns 404, not 403.
     *
     * The same answer as a topic that does not exist, so a probed id cannot be
     * used to discover which topics another college runs (§35, §74).
     */
    const ownership = await authorizeTopic(session.sub, topicId);
    if (!ownership) return fail("That topic could not be found", 404);

    const signals = Array.isArray(body.signals)
      ? body.signals.filter((entry): entry is ProgressSignal => isProgressSignal(entry))
      : [];

    const progress = await recordProgress({
      userId: session.sub,
      ownership,
      signals,
      timeSpentSeconds:
        typeof body.timeSpentSeconds === "number" ? body.timeSpentSeconds : undefined,
      deepestLevel: typeof body.deepestLevel === "string" ? body.deepestLevel : null,
      manualComplete: body.completed === true,
    });

    return ok({ progress });
  } catch (err) {
    return handleError(err);
  }
}

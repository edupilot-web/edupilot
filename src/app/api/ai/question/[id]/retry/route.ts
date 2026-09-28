import { fail, handleError, ok, requireAuth } from "@/lib/api";
import { isDepthLevel, type DepthLevel } from "@/lib/learning/fields";
import { getInteraction } from "@/lib/tutor/history";
import { ask } from "@/lib/tutor/service";

/**
 * POST /api/ai/question/:id/retry  (§15 "Ask again", §40 "Regenerate")
 *
 * The one path that deliberately spends a request. Everything else in the
 * history API reads what is already stored; this re-asks the same question and
 * **stores the new answer as a separate row**, pointing back at the one it
 * re-answers.
 *
 * Not an update. §40 is explicit that both answers are kept — a student who
 * regenerates and gets something worse must still have the first one, and a
 * comparison between two answers is impossible if the first was overwritten.
 *
 * The question is taken from the *stored* interaction, not from the body. A
 * retry endpoint that accepted new text would be `/question` with a different
 * name, and would let a caller attach an arbitrary question to an existing
 * thread while claiming it was a regeneration of something else.
 */
export const maxDuration = 120;

export async function POST(req: Request, ctx: RouteContext<"/api/ai/question/[id]/retry">) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;

    const original = await getInteraction(session.sub, id);
    if (!original) return fail("That answer could not be found", 404);

    // The only thing the caller may change is the depth: "ask again, but
    // deeper" is a real intent, and it is the one §16's follow-ups express.
    let depthLevel: DepthLevel | null = null;
    try {
      const body = (await req.json()) as { depthLevel?: unknown };
      const requested = typeof body?.depthLevel === "string" ? body.depthLevel : null;
      if (requested && isDepthLevel(requested)) depthLevel = requested;
    } catch {
      // No body is the normal case — a plain "ask again".
    }

    const result = await ask({
      userId: session.sub,
      topicId: await topicIdFor(session.sub, id),
      conversationId: original.conversationId,
      question: original.question,
      depthLevel: depthLevel ?? (original.depthLevel as DepthLevel),
      language: original.language as never,
      mode: "question",
      /**
       * The cache is bypassed, and this is the reason the flag exists.
       *
       * A student pressing "Ask again" has read the answer and wants a
       * different one. Serving them the identical cached text would make the
       * button appear broken, and it is the one case where spending a request
       * is exactly what was asked for.
       */
      forceFresh: true,
      regeneratedFromId: original.id,
    });

    if (!result.ok) {
      return fail(result.message, result.status, {
        code: result.code,
        ...(result.retryAfterSeconds ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
      });
    }

    return ok({ interaction: result.interaction, regeneratedFrom: original.id });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * The topic the original answer was about.
 *
 * Read from the stored row rather than accepted from the caller, so a retry
 * cannot be pointed at a different topic — which would file the new answer
 * under a topic the question was never asked about, and could point it at one
 * the student is not entitled to.
 */
async function topicIdFor(userId: string, interactionId: string): Promise<string> {
  const { AiInteraction } = await import("@/models/Tutor");
  const row = await AiInteraction.findOne({ _id: interactionId, userId })
    .select("topicId")
    .lean();

  // Unreachable in practice: the caller has already loaded this interaction.
  if (!row) throw new Error("interaction disappeared between reads");
  return String(row.topicId);
}

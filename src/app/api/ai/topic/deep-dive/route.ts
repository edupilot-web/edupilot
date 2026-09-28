import { fail, handleError, ok, requireAuth } from "@/lib/api";
import { deeperThan, isDepthLevel, type DepthLevel } from "@/lib/learning/fields";
import { ask, askStreaming, type AskInput } from "@/lib/tutor/service";

/**
 * POST /api/ai/topic/deep-dive  (§9 "Go deeper", §10, §29)
 *
 * The moment a student chooses to spend a request.
 *
 * Everything above this on the topic page — the basic explanation, the
 * practical section, the key points, the self-check — is a database read and
 * costs nothing (§9). This endpoint exists so that the cost is attached to an
 * explicit action rather than to opening a page, which is the difference
 * between a platform that can afford to have students and one that cannot.
 *
 * It is not `/question` with a canned string: there is no student question
 * here, and putting words in their mouth would make their own history read as
 * though they had typed something they did not. `buildDeepDivePrompt` phrases
 * the request as what it is.
 */
export const maxDuration = 120;

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

    const topicId = typeof body.topicId === "string" ? body.topicId.trim() : "";
    if (!topicId) return fail("A topicId is required", 400);

    /**
     * The next rung up from where the student is, unless they named one.
     *
     * §10 forbids dropping a student straight into Advanced. `currentLevel` is
     * what they have read so far, and the default target is one step beyond it
     * — so pressing the button repeatedly walks Basic → Practical →
     * Intermediate → Advanced → Expert rather than jumping.
     */
    const requested = typeof body.depthLevel === "string" ? body.depthLevel : null;
    const current = typeof body.currentLevel === "string" ? body.currentLevel : "basic";

    const depthLevel: DepthLevel =
      requested && isDepthLevel(requested)
        ? requested
        : (isDepthLevel(current) ? deeperThan(current) : null) ?? "intermediate";

    const input: AskInput = {
      userId: session.sub,
      topicId,
      subtopicId: typeof body.subtopicId === "string" ? body.subtopicId : null,
      conversationId: typeof body.conversationId === "string" ? body.conversationId : null,
      depthLevel,
      language: (body.language as AskInput["language"]) ?? "english",
      mode: "deep-dive",
    };

    if (body.stream === true) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            for await (const event of askStreaming(input)) {
              controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            }
          } catch (err) {
            console.error("[ai] streaming deep dive failed:", err);
            controller.enqueue(
              encoder.encode(
                `${JSON.stringify({
                  type: "error",
                  message: "The AI tutor is temporarily unavailable. Please try again.",
                })}\n`
              )
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const result = await ask(input);

    if (!result.ok) {
      return fail(result.message, result.status, {
        code: result.code,
        ...(result.retryAfterSeconds ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
      });
    }

    return ok({ interaction: result.interaction });
  } catch (err) {
    return handleError(err);
  }
}

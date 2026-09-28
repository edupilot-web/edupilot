import { fail, handleError, ok, requireAuth } from "@/lib/api";
import { isDepthLevel, type DepthLevel, type LearningLanguage } from "@/lib/learning/fields";
import { ask, askStreaming, type AskInput } from "@/lib/tutor/service";

/**
 * POST /api/ai/question  (§29, §30, §67, §77)
 *
 * The one endpoint a student's question goes through.
 *
 * The body carries **ids and text only** (§30). It cannot name a provider, a
 * model, a temperature or a token budget — those are the server's, and a
 * request that could set them could route around the budget, the prompt and the
 * quota in one call. Any `subjectName` or `topicTitle` in the body is ignored:
 * the context builder re-resolves the whole academic chain from the database
 * and verifies the topic belongs to this student's curriculum before a prompt
 * exists.
 *
 * Two response shapes, chosen by the caller with `stream`:
 *
 *   - `stream: false` → one JSON body, once the answer is stored.
 *   - `stream: true`  → newline-delimited JSON, one event per line.
 *
 * NDJSON rather than SSE. The client is `fetch` in a React component, not an
 * `EventSource` — SSE's field syntax would have to be parsed by hand for no
 * benefit, while one JSON object per line is `split("\n")` and `JSON.parse`.
 * The `done` event carries the *stored* interaction, so the client never has to
 * parse the accumulated model output itself.
 */

/**
 * Long enough for a slow provider plus one validation retry, short enough that
 * a hung request does not hold a serverless invocation open to its platform
 * limit. The provider's own timeout (45s) fires well inside it.
 */
export const maxDuration = 120;

type Body = {
  topicId?: unknown;
  subtopicId?: unknown;
  conversationId?: unknown;
  question?: unknown;
  followUpAction?: unknown;
  depthLevel?: unknown;
  language?: unknown;
  stream?: unknown;
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(req: Request) {
  try {
    const session = await requireAuth();

    let body: Body;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== "object") return fail("Send a JSON body", 400);
      body = parsed as Body;
    } catch {
      return fail("Send a JSON body", 400);
    }

    const topicId = str(body.topicId);
    if (!topicId) return fail("A topicId is required", 400);

    const depthLevel = str(body.depthLevel);

    const input: AskInput = {
      userId: session.sub,
      topicId,
      subtopicId: str(body.subtopicId),
      conversationId: str(body.conversationId),
      question: str(body.question),
      followUpAction: str(body.followUpAction),
      depthLevel: isDepthLevel(depthLevel) ? (depthLevel as DepthLevel) : null,
      language: (str(body.language) as LearningLanguage | null) ?? "english",
      mode: "question",
    };

    if (body.stream === true) return streamResponse(input);

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

/**
 * Wrap the service's event generator in an NDJSON stream.
 *
 * The generator is consumed inside `start` rather than `pull` so back-pressure
 * from a slow client does not leave a provider connection half-read; the
 * answer is stored regardless of whether the browser is still listening, which
 * is what makes a closed tab cost the same as a completed one instead of
 * losing an answer the platform already paid for.
 */
function streamResponse(input: AskInput): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of askStreaming(input)) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch (err) {
        console.error("[ai] streaming answer failed:", err);
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({
              type: "error",
              // Never the underlying error (§51). The detail is in the log and
              // on the stored interaction.
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
      // Without this a reverse proxy may buffer the whole answer and deliver it
      // in one piece, which looks exactly like streaming being broken.
      "X-Accel-Buffering": "no",
    },
  });
}

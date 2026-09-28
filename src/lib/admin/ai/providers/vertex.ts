import {
  ProviderError,
  fetchWithTimeout,
  type AIProvider,
  type ProviderMessage,
  type ProviderOptions,
  type ProviderResult,
} from "@/lib/admin/ai/provider";
import {
  buildGeminiBody,
  geminiErrorFor,
  readGeminiFrame,
  readGeminiResponse,
  type GeminiFlavour,
  type GeminiResponse,
} from "@/lib/admin/ai/providers/gemini-core";
import { readSseData } from "@/lib/admin/ai/providers/openai-compatible";
import {
  canAuthenticate,
  credentialSource,
  vertexAccessToken,
  vertexLocation,
  vertexProjectId,
} from "@/lib/admin/ai/providers/vertex-auth";

/**
 * VertexAIProvider — Gemini models through Google Cloud.
 *
 * The same models as `GeminiProvider`, reached a different way, and the
 * difference is operational rather than technical:
 *
 * - **Credential.** An OAuth token from a service account rather than an API
 *   key, so access is an IAM role that can be scoped, audited and rotated
 *   centrally instead of a string somebody pasted into an environment.
 * - **Data handling.** Vertex is covered by the Google Cloud terms, and prompts
 *   are not used to improve the models. For a platform whose prompts contain a
 *   named student's syllabus and their questions, that is the distinction that
 *   matters.
 * - **Residency and quota.** A region can be pinned, and quota is the project's
 *   rather than a per-key allowance.
 *
 * Everything on the wire is identical, which is why this class is short: the
 * body, the response and the error mapping are `gemini-core.ts`, shared with the
 * API-key provider so the two cannot disagree about what `MAX_TOKENS` means.
 */

const FLAVOUR: GeminiFlavour = {
  label: "Vertex AI",
  credentialHint: "GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON and GOOGLE_VERTEX_PROJECT_ID",
};

/**
 * The default model.
 *
 * Flash rather than Pro. The tutor's job is explaining a syllabus topic to an
 * undergraduate, which Flash does well, and it costs roughly an order of
 * magnitude less per answer — on a platform where every student may ask ten
 * questions a day, that difference is the whole budget. `tierForDepth()` already
 * routes the genuinely hard requests to the advanced tier, which is where Pro
 * belongs.
 */
export const VERTEX_DEFAULT_MODEL = "gemini-2.5-flash";

export class VertexAIProvider implements AIProvider {
  readonly type = "vertex" as const;
  readonly name = "Google Vertex AI";

  isConfigured(): boolean {
    return Boolean(vertexProjectId()) && canAuthenticate();
  }

  /**
   * The base URL for a model call.
   *
   * `global` has its own host with no region prefix, which is easy to get wrong
   * and produces a DNS failure rather than an API error — so it is handled here
   * rather than left to the operator's environment variable.
   */
  private endpoint(model: string, method: string): string | null {
    const project = vertexProjectId();
    if (!project) return null;

    const location = vertexLocation();
    const host =
      location === "global"
        ? "https://aiplatform.googleapis.com"
        : `https://${location}-aiplatform.googleapis.com`;

    return `${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(
      location
    )}/publishers/google/models/${encodeURIComponent(model)}:${method}`;
  }

  /**
   * A real but minimal round trip for the settings screen.
   *
   * Asks for a single token rather than listing models: a project can be able to
   * list models and still be unable to generate with the configured one — a
   * missing `aiplatform.user` role looks exactly like that — and the second is
   * the thing an operator needs to know.
   */
  async validate(): Promise<{ ok: boolean; message: string }> {
    if (!vertexProjectId()) {
      return {
        ok: false,
        message:
          "GOOGLE_VERTEX_PROJECT_ID is not set. Add it to the environment — it is never stored in the database.",
      };
    }
    if (!canAuthenticate()) {
      return {
        ok: false,
        message:
          "No Vertex AI credentials. Set GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON, or run on Google Cloud with a service account attached.",
      };
    }

    try {
      await this.call(
        { system: "Reply with the single word OK.", user: "OK" },
        { model: VERTEX_DEFAULT_MODEL, temperature: 0, maxTokens: 16, topP: 1, timeoutMs: 20_000 },
        false
      );
      return {
        ok: true,
        message: `Vertex AI responded successfully (project ${vertexProjectId()}, ${vertexLocation()}, via ${credentialSource()}).`,
      };
    } catch (err) {
      const message = err instanceof ProviderError ? err.message : "Vertex AI could not be reached.";
      return { ok: false, message };
    }
  }

  async generate(messages: ProviderMessage, options: ProviderOptions): Promise<ProviderResult> {
    return this.call(messages, options, false);
  }

  /**
   * Structured generation, using Gemini's own JSON constraint where a schema is
   * supplied (§12).
   *
   * Both `responseMimeType` and `responseSchema` are hints as far as this module
   * is concerned — zod validates the result regardless, because a constrained
   * decode can still truncate at the token limit and produce well-formed JSON
   * that is missing half the units.
   */
  async generateStructured(
    messages: ProviderMessage,
    options: ProviderOptions
  ): Promise<ProviderResult> {
    return this.call(messages, options, true);
  }

  private async call(
    messages: ProviderMessage,
    options: ProviderOptions,
    structured: boolean
  ): Promise<ProviderResult> {
    const model = options.model || VERTEX_DEFAULT_MODEL;
    const url = this.endpoint(model, "generateContent");

    if (!url) {
      throw new ProviderError(
        "not-configured",
        "GOOGLE_VERTEX_PROJECT_ID is not set on the server.",
        { retryable: false }
      );
    }

    // Minted before the clock starts: a cached token costs nothing, and a fresh
    // one is a round trip that belongs to neither the model nor the timeout the
    // caller asked for.
    const token = await vertexAccessToken(options.signal);
    const started = Date.now();

    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(buildGeminiBody(messages, options, structured)),
      },
      { timeoutMs: options.timeoutMs, signal: options.signal }
    );

    const payload = (await response.json().catch(() => null)) as GeminiResponse | null;
    if (!response.ok) throw geminiErrorFor(response.status, payload, FLAVOUR);

    return readGeminiResponse(payload, FLAVOUR, {
      model,
      maxTokens: options.maxTokens,
      startedAt: started,
    });
  }

  /**
   * Server-sent events, for §77's progressive answer.
   *
   * `alt=sse` rather than the default chunked-JSON-array response: without it
   * Vertex streams a JSON array whose elements arrive split across chunk
   * boundaries, and reassembling that correctly means writing an incremental
   * JSON parser. SSE gives framed messages, which `readSseData` already handles.
   *
   * Deltas only. Accumulating, validating and storing the answer is the caller's
   * job — a provider that also parsed the result would have to know what shape
   * the caller wanted.
   */
  async *stream(
    messages: ProviderMessage,
    options: ProviderOptions
  ): AsyncIterable<{ delta: string; done: boolean }> {
    const model = options.model || VERTEX_DEFAULT_MODEL;
    const base = this.endpoint(model, "streamGenerateContent");

    if (!base) {
      throw new ProviderError(
        "not-configured",
        "GOOGLE_VERTEX_PROJECT_ID is not set on the server.",
        { retryable: false }
      );
    }

    const token = await vertexAccessToken(options.signal);

    const response = await fetchWithTimeout(
      `${base}?alt=sse`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          Accept: "text/event-stream",
        },
        body: JSON.stringify(buildGeminiBody(messages, options, true)),
      },
      { timeoutMs: options.timeoutMs, signal: options.signal }
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as GeminiResponse | null;
      throw geminiErrorFor(response.status, payload, FLAVOUR);
    }
    if (!response.body) {
      throw new ProviderError("invalid-response", "Vertex AI returned an empty stream.");
    }

    for await (const data of readSseData(response.body)) {
      const frame = readGeminiFrame(data, FLAVOUR);
      if (frame) yield { delta: frame.delta, done: false };
    }

    yield { delta: "", done: true };
  }
}

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

/**
 * GeminiProvider (spec §45 phase 2) — the Generative Language API.
 *
 * Talks to the REST API directly rather than through an SDK. One reason: the
 * surface used here is three fields and a fetch, and a dependency that ships its
 * own transport, retry policy and telemetry would have to be reconciled with the
 * job runner's (§19) rather than reused.
 *
 * The key is read from `process.env` on every call. Not cached in a module
 * variable — a long-lived server would keep serving a rotated-out key — and
 * never from the provider-config document, which §22 forbids and whose contents
 * are returned to the browser by the settings screen.
 *
 * The wire format is shared with `VertexAIProvider` through `gemini-core.ts`:
 * both call the same models and differ only in URL and credential. This class is
 * the **API-key** path — simpler to set up, so it is the recommended fallback,
 * while Vertex is the primary because its terms and IAM suit a platform holding
 * student data.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";

const FLAVOUR: GeminiFlavour = { label: "Gemini", credentialHint: "GEMINI_API_KEY" };

/**
 * The default model.
 *
 * Overridden by the provider config's `model`, so this only matters for a
 * deployment that enabled Gemini without choosing one.
 */
export const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";

export class GeminiProvider implements AIProvider {
  readonly type = "gemini" as const;
  readonly name = "Google Gemini";

  private key(): string | null {
    const key = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_AI_API_KEY?.trim();
    return key || null;
  }

  isConfigured(): boolean {
    return Boolean(this.key());
  }

  /**
   * A real but minimal round trip for the settings screen.
   *
   * Asks for a single token rather than listing models: an account can be able
   * to list models and still be unable to generate with the configured one, and
   * the second is the thing an operator needs to know.
   */
  async validate(): Promise<{ ok: boolean; message: string }> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        message:
          "GEMINI_API_KEY is not set. Add it to the environment — it is never stored in the database.",
      };
    }

    try {
      await this.call(
        { system: "Reply with the single word OK.", user: "OK" },
        {
          model: GEMINI_DEFAULT_MODEL,
          temperature: 0,
          maxTokens: 16,
          topP: 1,
          timeoutMs: 15_000,
        },
        false
      );
      return { ok: true, message: "Gemini responded successfully." };
    } catch (err) {
      const message = err instanceof ProviderError ? err.message : "Gemini could not be reached.";
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
   * `responseMimeType` alone already forces JSON; `responseSchema` additionally
   * pins the shape. Both are hints as far as this module is concerned — zod
   * validates the result regardless, because a constrained decode can still
   * truncate at the token limit and produce well-formed JSON that is missing
   * half the units.
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
    const key = this.key();
    if (!key) {
      throw new ProviderError("not-configured", "GEMINI_API_KEY is not set on the server.", {
        retryable: false,
      });
    }

    const model = options.model || GEMINI_DEFAULT_MODEL;
    const started = Date.now();

    const response = await fetchWithTimeout(
      // The key goes in a header, not the query string: a URL is logged by
      // proxies and appears in error messages, and this one would carry the key.
      `${ENDPOINT}/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
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
   * Gemini streams a JSON array whose elements arrive split across chunk
   * boundaries, and reassembling that correctly means writing an incremental
   * JSON parser. SSE gives framed messages, which `readSseData` already handles
   * for the OpenAI-compatible providers.
   *
   * Deltas only. Accumulating, validating and storing the answer is the caller's
   * job — a provider that also parsed the result would have to know what shape
   * the caller wanted.
   */
  async *stream(
    messages: ProviderMessage,
    options: ProviderOptions
  ): AsyncIterable<{ delta: string; done: boolean }> {
    const key = this.key();
    if (!key) {
      throw new ProviderError("not-configured", "GEMINI_API_KEY is not set on the server.", {
        retryable: false,
      });
    }

    const model = options.model || GEMINI_DEFAULT_MODEL;

    const response = await fetchWithTimeout(
      `${ENDPOINT}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
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
      throw new ProviderError("invalid-response", "Gemini returned an empty stream.");
    }

    for await (const data of readSseData(response.body)) {
      const frame = readGeminiFrame(data, FLAVOUR);
      if (frame) yield { delta: frame.delta, done: false };
    }

    yield { delta: "", done: true };
  }
}

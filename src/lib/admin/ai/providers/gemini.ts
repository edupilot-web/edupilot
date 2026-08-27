import {
  ProviderError,
  fetchWithTimeout,
  type AIProvider,
  type ProviderMessage,
  type ProviderOptions,
  type ProviderResult,
} from "@/lib/admin/ai/provider";

/**
 * GeminiProvider (spec §45 phase 2).
 *
 * Talks to the Generative Language REST API directly rather than through an SDK.
 * One reason: the surface used here is three fields and a fetch, and a dependency
 * that ships its own transport, retry policy and telemetry would have to be
 * reconciled with the job runner's (§19) rather than reused.
 *
 * The key is read from `process.env` on every call. Not cached in a module
 * variable — a long-lived server would keep serving a rotated-out key — and
 * never from the provider-config document, which §22 forbids and whose contents
 * are returned to the browser by the settings screen.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";

/**
 * The default model.
 *
 * Overridden by the provider config's `model`, so this only matters for a
 * deployment that enabled Gemini without choosing one.
 */
export const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";

type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { code?: number; message?: string; status?: string };
};

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
        message: "GEMINI_API_KEY is not set. Add it to the environment — it is never stored in the database.",
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
      throw new ProviderError(
        "not-configured",
        "GEMINI_API_KEY is not set on the server.",
        { retryable: false }
      );
    }

    const model = options.model || GEMINI_DEFAULT_MODEL;
    const started = Date.now();

    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: messages.system }] },
      contents: [{ role: "user", parts: [{ text: messages.user }] }],
      generationConfig: {
        temperature: options.temperature,
        topP: options.topP,
        maxOutputTokens: options.maxTokens,
        ...(structured
          ? {
              responseMimeType: "application/json",
              ...(options.jsonSchema ? { responseSchema: options.jsonSchema } : {}),
            }
          : {}),
      },
    };

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
        body: JSON.stringify(body),
      },
      { timeoutMs: options.timeoutMs, signal: options.signal }
    );

    const payload = (await response.json().catch(() => null)) as GeminiResponse | null;

    if (!response.ok) throw this.errorFor(response.status, payload);
    if (!payload) {
      throw new ProviderError("invalid-response", "Gemini returned a response that could not be read.");
    }
    if (payload.error) throw this.errorFor(payload.error.code ?? 500, payload);

    if (payload.promptFeedback?.blockReason) {
      throw new ProviderError(
        "content-filtered",
        `Gemini declined the request (${payload.promptFeedback.blockReason}). Rephrase the instructions or reduce the source material.`,
        { retryable: false }
      );
    }

    const candidate = payload.candidates?.[0];
    const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";

    /**
     * `MAX_TOKENS` is reported as a normal finish, not an error.
     *
     * Treated as a failure here because a truncated academic document is the
     * most dangerous kind of success: the JSON may still parse, the units array
     * is simply short, and a reviewer has no way to see that the model was cut
     * off rather than done.
     */
    if (candidate?.finishReason === "MAX_TOKENS") {
      throw new ProviderError(
        "token-limit",
        `The response hit the ${options.maxTokens.toLocaleString("en-IN")} token limit and was truncated. Generate a single unit at a time, or raise the limit in AI Settings.`,
        { retryable: false }
      );
    }

    if (candidate?.finishReason === "SAFETY" || candidate?.finishReason === "PROHIBITED_CONTENT") {
      throw new ProviderError(
        "content-filtered",
        "Gemini stopped generating for safety reasons. Review the subject material and instructions.",
        { retryable: false }
      );
    }

    if (!text.trim()) {
      throw new ProviderError(
        "invalid-response",
        `Gemini returned no content${candidate?.finishReason ? ` (finish reason: ${candidate.finishReason})` : ""}.`
      );
    }

    return {
      text,
      usage: {
        promptTokens: payload.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: payload.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: payload.usageMetadata?.totalTokenCount ?? 0,
      },
      model,
      durationMs: Date.now() - started,
    };
  }

  /**
   * Map a transport failure onto the closed error set.
   *
   * The provider's message is passed through only for the statuses where it is
   * about the *request* (a bad model name, a malformed schema). For 401 and 403
   * it is replaced: those responses sometimes echo back part of the credential,
   * and §32 forbids surfacing provider secrets.
   */
  private errorFor(status: number, payload: GeminiResponse | null): ProviderError {
    const detail = payload?.error?.message;

    if (status === 400) {
      return new ProviderError(
        "invalid-response",
        `Gemini rejected the request${detail ? `: ${detail}` : "."}`,
        { retryable: false, status }
      );
    }
    if (status === 401 || status === 403) {
      return new ProviderError(
        "unauthorized",
        "Gemini rejected the API key. Check GEMINI_API_KEY on the server.",
        { retryable: false, status }
      );
    }
    if (status === 404) {
      return new ProviderError(
        "not-configured",
        `Gemini has no such model${detail ? `: ${detail}` : "."} Change the model in AI Settings.`,
        { retryable: false, status }
      );
    }
    if (status === 429) {
      return new ProviderError("rate-limited", "Gemini rate limit reached. The job will be retried.", {
        status,
      });
    }
    if (status >= 500) {
      return new ProviderError("unavailable", "Gemini is temporarily unavailable.", { status });
    }

    return new ProviderError("unknown", `Gemini returned an unexpected status ${status}.`, { status });
  }
}
